from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    ai_mode: Literal["mock", "gemini"] = "mock"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    database_url: str = "sqlite:///./data/flatsketch.db"
    storage_mode: Literal["local", "gcs"] = "local"
    local_storage_dir: str = "./data/uploads"
    gcs_bucket: str = ""
    google_cloud_project: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]
    backend_api_key: str = ""
    max_upload_bytes: int = 5 * 1024 * 1024
