from pathlib import Path


class Storage:
    def __init__(self, settings):
        self.settings = settings
        self.bucket = None
        if settings.storage_mode == "gcs":
            from google.cloud import storage
            if not settings.gcs_bucket:
                raise ValueError("GCS_BUCKET is required for gcs storage")
            self.bucket = storage.Client(project=settings.google_cloud_project or None).bucket(settings.gcs_bucket)
        else:
            self.root = Path(settings.local_storage_dir).resolve()
            self.root.mkdir(parents=True, exist_ok=True)

    def write(self, key: str, data: bytes, mime: str):
        if self.bucket:
            self.bucket.blob(key).upload_from_string(data, content_type=mime, if_generation_match=0, timeout=30)
        else:
            (self.root / key).write_bytes(data)

    def read(self, key: str):
        if self.bucket:
            return self.bucket.blob(key).download_as_bytes(timeout=30)
        return (self.root / key).read_bytes()
