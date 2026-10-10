import hmac
import io
import logging
import os
import warnings
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError
from sqlalchemy import delete, select, text
from sqlalchemy.orm.exc import StaleDataError

from .ai import AIService
from .config import Settings
from .custom_schemas import DesignDocumentWrite
from .custom_routes import custom_router, locked_design, save_snapshot
from .database import Asset, Design, Part, Version, database, initialize_database, record
from .schemas import CommandRequest, DesignSpec, EditAction, SavedPart, SuggestionRequest
from .storage import Storage

logger = logging.getLogger(__name__)
Image.MAX_IMAGE_PIXELS = 20_000_000


def create_app(settings: Settings | None = None):
    settings = settings or Settings()
    if os.environ.get("K_SERVICE") and not settings.backend_api_key:
        raise ValueError("Set BACKEND_API_KEY before deploying to Cloud Run")
    engine, sessions = database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        initialize_database(engine)
        app.state.storage = Storage(settings)
        app.state.ai = AIService(settings)
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="FlatSketch backend", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                       allow_headers=["Content-Type", "X-API-Key"], expose_headers=["X-AI-Mode"])

    def authorize(x_api_key: str | None = Header(default=None)):
        if settings.backend_api_key and not hmac.compare_digest(
                (x_api_key or "").encode(), settings.backend_api_key.encode()):
            raise HTTPException(401, "Missing or incorrect X-API-Key")

    protected = [Depends(authorize)]

    @app.exception_handler(StaleDataError)
    async def concurrent_update(request, exc):
        return JSONResponse(status_code=409,
                            content={"detail": "Design changed. Reload it before saving your edits."})

    def db_session():
        with sessions() as session:
            yield session

    def get_row(session, model, row_id):
        row = session.get(model, row_id)
        if row is None:
            raise HTTPException(404, "Record not found")
        return row

    def read_image(upload):
        data = upload.file.read(settings.max_upload_bytes + 1)
        if len(data) > settings.max_upload_bytes:
            raise HTTPException(413, "Image exceeds upload limit")
        if not data:
            raise HTTPException(422, "Image is empty")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(data)) as image:
                    mime = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}.get(image.format)
                    if not mime:
                        raise HTTPException(415, "Only PNG, JPEG and WebP images are supported")
                    image.verify()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError,
                Image.DecompressionBombWarning):
            raise HTTPException(422, "Invalid or oversized image") from None
        return data, mime

    def parse_spec(value):
        try:
            return DesignSpec.model_validate_json(value)
        except ValidationError:
            raise HTTPException(422, "spec must be valid JSON matching the dress contract") from None

    def check_asset(session, asset_id):
        if asset_id:
            get_row(session, Asset, asset_id)

    @app.get("/health")
    def health():
        return {"status": "ok", "ai_mode": settings.ai_mode}

    @app.get("/ready", dependencies=protected)
    def ready(session=Depends(db_session)):
        session.execute(text("SELECT 1"))
        return {"status": "ok", "storage_mode": settings.storage_mode}

    @app.get("/spec/example", response_model=DesignSpec, dependencies=protected)
    def example():
        return DesignSpec(notes="Hand-made sample for frontend development.")

    @app.post("/analyze", response_model=DesignSpec, dependencies=protected)
    def analyze(response: Response, sketch: UploadFile = File(...)):
        response.headers["X-AI-Mode"] = settings.ai_mode
        return app.state.ai.analyze(read_image(sketch), sketch.filename)

    @app.post("/verify", response_model=list[EditAction], dependencies=protected)
    def verify(response: Response, sketch: UploadFile = File(...), flat: UploadFile = File(...),
               spec: str = Form(..., max_length=20000)):
        response.headers["X-AI-Mode"] = settings.ai_mode
        return app.state.ai.edits(parse_spec(spec),
                                  "Compare original sketch (first image) with flat (second image). "
                                  "Return only corrections that better match the sketch.",
                                  [read_image(sketch), read_image(flat)])

    @app.post("/command", response_model=list[EditAction], dependencies=protected)
    def command(body: CommandRequest, response: Response):
        response.headers["X-AI-Mode"] = settings.ai_mode
        return app.state.ai.edits(body.spec, f"Apply this student command: {body.text}")

    @app.post("/suggestions", dependencies=protected)
    def suggestions(body: SuggestionRequest, response: Response):
        response.headers["X-AI-Mode"] = settings.ai_mode
        return app.state.ai.suggestions(body.spec, body.goal)

    @app.post("/assets", status_code=201, dependencies=protected)
    def upload_asset(image: UploadFile = File(...), session=Depends(db_session)):
        data, mime = read_image(image)
        asset_id = str(uuid4())
        extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[mime]
        key = f"{asset_id}.{extension}"
        try:
            app.state.storage.write(key, data, mime)
        except Exception as exc:
            logger.warning("Storage upload failed (%s)", type(exc).__name__)
            raise HTTPException(502, "Could not store the image") from None
        asset = Asset(id=asset_id, object_key=key, mime_type=mime, size=len(data))
        session.add(asset)
        session.commit()
        return {**record(asset), "url": f"/assets/{asset.id}"}

    @app.get("/assets/{asset_id}", dependencies=protected)
    def asset_image(asset_id: str, session=Depends(db_session)):
        asset = get_row(session, Asset, asset_id)
        try:
            data = app.state.storage.read(asset.object_key)
        except Exception as exc:
            logger.warning("Storage read failed (%s)", type(exc).__name__)
            raise HTTPException(502, "Could not read the image") from None
        return Response(data, media_type=asset.mime_type,
                        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300"})

    @app.post("/designs", status_code=201, dependencies=protected)
    def create_design(body: DesignDocumentWrite, session=Depends(db_session)):
        check_asset(session, body.sketch_asset_id)
        data = body.model_dump()
        data["custom_elements"] = data["custom_elements"] or []
        row = Design(**data)
        session.add(row)
        session.flush()
        session.add(Version(design_id=row.id, version=1, spec=row.spec,
                            custom_elements=row.custom_elements))
        session.commit()
        return record(row)

    @app.get("/designs", dependencies=protected)
    def list_designs(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                     session=Depends(db_session)):
        rows = session.scalars(select(Design).order_by(Design.updated_at.desc(), Design.id)
                               .limit(limit).offset(offset))
        return [record(row) for row in rows]

    @app.get("/designs/{design_id}", dependencies=protected)
    def get_design(design_id: str, session=Depends(db_session)):
        return record(get_row(session, Design, design_id))

    @app.put("/designs/{design_id}", dependencies=protected)
    def update_design(design_id: str, body: DesignDocumentWrite,
                      expected_version: int | None = Query(None, ge=1), session=Depends(db_session)):
        row = locked_design(session, design_id, expected_version)
        check_asset(session, body.sketch_asset_id)
        row.name, row.spec, row.sketch_asset_id = body.name, body.spec.model_dump(), body.sketch_asset_id
        if body.custom_elements is not None:
            row.custom_elements = [element.model_dump() for element in body.custom_elements]
        return save_snapshot(session, row)

    @app.get("/designs/{design_id}/versions", dependencies=protected)
    def versions(design_id: str, limit: int = Query(50, ge=1, le=100),
                 offset: int = Query(0, ge=0), session=Depends(db_session)):
        get_row(session, Design, design_id)
        rows = session.scalars(select(Version).where(Version.design_id == design_id)
                               .order_by(Version.version.desc()).limit(limit).offset(offset))
        return [record(row) for row in rows]

    @app.delete("/designs/{design_id}", status_code=204, dependencies=protected)
    def delete_design(design_id: str, session=Depends(db_session)):
        row = get_row(session, Design, design_id)
        session.execute(delete(Version).where(Version.design_id == design_id))
        session.delete(row)
        session.commit()
        return Response(status_code=204)

    @app.post("/parts", status_code=201, dependencies=protected)
    def save_part(body: SavedPart, session=Depends(db_session)):
        row = Part(**body.model_dump())
        session.add(row)
        session.commit()
        return record(row)

    @app.get("/parts", dependencies=protected)
    def list_parts(part_type: str | None = None, limit: int = Query(50, ge=1, le=100),
                   offset: int = Query(0, ge=0), session=Depends(db_session)):
        query = select(Part).order_by(Part.created_at.desc(), Part.id)
        if part_type:
            query = query.where(Part.part_type == part_type)
        return [record(row) for row in session.scalars(query.limit(limit).offset(offset))]

    @app.get("/parts/{part_id}", dependencies=protected)
    def get_part(part_id: str, session=Depends(db_session)):
        return record(get_row(session, Part, part_id))

    @app.delete("/parts/{part_id}", status_code=204, dependencies=protected)
    def delete_part(part_id: str, session=Depends(db_session)):
        session.delete(get_row(session, Part, part_id))
        session.commit()
        return Response(status_code=204)

    app.include_router(custom_router(db_session, protected))
    return app


app = create_app()
