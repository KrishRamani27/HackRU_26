from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def now():
    return datetime.now(timezone.utc)


def new_id():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    object_key: Mapped[str] = mapped_column(String(200))
    mime_type: Mapped[str] = mapped_column(String(50))
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Design(Base):
    __tablename__ = "designs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    spec: Mapped[dict] = mapped_column(JSON)
    custom_elements: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'"))
    sketch_asset_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id"), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    __mapper_args__ = {"version_id_col": version, "version_id_generator": False}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Version(Base):
    __tablename__ = "design_versions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    design_id: Mapped[str] = mapped_column(ForeignKey("designs.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    spec: Mapped[dict] = mapped_column(JSON)
    custom_elements: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Part(Base):
    __tablename__ = "saved_parts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    part_type: Mapped[str] = mapped_column(String(30), index=True)
    spec_settings: Mapped[dict] = mapped_column(JSON)
    style: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CustomPart(Base):
    __tablename__ = "custom_parts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    # Keep the existing JSON column; old rows hold one object, new rows hold a list.
    element: Mapped[dict | list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def initialize_database(engine):
    """Add the manual-drawing fields without deleting old designs or versions."""
    with engine.begin() as connection:
        # Serialize this small migration across Cloud Run workers on PostgreSQL.
        if engine.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(2026101001)"))
        Base.metadata.create_all(connection)
        for table in ("designs", "design_versions"):
            columns = {column["name"] for column in inspect(connection).get_columns(table)}
            if "custom_elements" not in columns:
                connection.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN custom_elements JSON NOT NULL DEFAULT '[]'"
                ))


def database(url: str):
    parsed = make_url(url)
    if parsed.drivername in {"postgres", "postgresql"}:
        parsed = parsed.set(drivername="postgresql+psycopg")
    sqlite = parsed.drivername == "sqlite"
    if sqlite and parsed.database and parsed.database != ":memory:":
        Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(parsed, pool_pre_ping=True,
                           connect_args={"check_same_thread": False} if sqlite else {})
    return engine, sessionmaker(engine, expire_on_commit=False)


def record(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}
