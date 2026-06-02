"""
Configuration management using environment variables
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env file from root of project
load_dotenv()

MODEL_PATH = str(
    Path(__file__).resolve().parent / "Entrenamineto_LSTM" / "embedding_network_mini.h5"
)


def _resolve_model_path_from_env() -> str:
    env_model_path = os.getenv("MODEL_PATH")
    # Prefer the project-local .h5 artifact if present
    local_h5 = Path(__file__).resolve().parent / "Entrenamineto_LSTM" / "embedding_network_mini.h5"
    if local_h5.exists():
        return str(local_h5.resolve())

    # Otherwise, honor an explicit MODEL_PATH only if it exists
    if env_model_path:
        candidate = Path(env_model_path).expanduser()
        if candidate.exists():
            return str(candidate.resolve())

    return MODEL_PATH


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables
    """

    # ========================
    # MONGODB CONFIGURATION
    # ========================
    mongo_uri: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    mongo_db_name: str = os.getenv("MONGO_DB_NAME", "biometric_service")
    mongo_collection_profiles: str = os.getenv("MONGO_COLLECTION_PROFILES", "biometricprofile")
    mongo_collection_logs: str = os.getenv("MONGO_COLLECTION_LOGS", "audit_logs")

    # ========================
    # API CONFIGURATION
    # ========================
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    tls_enabled: bool = os.getenv("TLS_ENABLED", "false").lower() == "true"

    # ========================
    # AUTHENTICATION
    # ========================
    ml_service_username: str = os.getenv("ML_SERVICE_USERNAME", "bmfa_user")
    ml_service_password: str = os.getenv("ML_SERVICE_PASSWORD", "your_secure_password_here")

    # ========================
    # RATE LIMITING
    # ========================
    rate_limit_requests: int = int(os.getenv("RATE_LIMIT_REQUESTS", "20"))
    rate_limit_window_seconds: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

    # ========================
    # MODEL CONFIGURATION
    # ========================
    model_path: str = _resolve_model_path_from_env()
    model_version: str = os.getenv("MODEL_VERSION", "lstm_v1")
    preprocessing_profile: str = os.getenv("PREPROCESSING_PROFILE", "advanced8")
    confidence_threshold: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))
    max_request_size: int = int(os.getenv("MAX_REQUEST_SIZE", "204800"))

    # ========================
    # ENVIRONMENT & LOGGING
    # ========================
    environment: str = os.getenv("ENVIRONMENT", "development")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    class Config:
        env_file = ".env"
        case_sensitive = False


# Create global settings instance
settings = Settings()