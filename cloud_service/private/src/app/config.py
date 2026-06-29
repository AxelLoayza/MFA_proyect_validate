"""
Configuration management using environment variables
"""
import os
from typing import Optional
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load .env file from root of project
load_dotenv()


def _resolve_project_path(value: str, base_dir: Path) -> str:
    """Resolve relative project paths against the src directory."""
    candidate = Path(value)
    if candidate.is_absolute():
        return str(candidate)
    return str((base_dir / candidate).resolve())


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
    public_gateway_url: str = os.getenv("PUBLIC_GATEWAY_URL", "http://localhost:4003")
    tls_enabled: bool = os.getenv("TLS_ENABLED", "false").lower() == "true"
    tls_cert_file: str = os.getenv("TLS_CERT_FILE", "./certs/server.crt")
    tls_key_file: str = os.getenv("TLS_KEY_FILE", "./certs/server.key")
    verify_client_certificates: bool = os.getenv("VERIFY_CLIENT_CERTIFICATES", "false").lower() == "true"
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    cors_allow_credentials: bool = os.getenv("CORS_ALLOW_CREDENTIALS", "true").lower() == "true"
    log_format: str = os.getenv(
        "LOG_FORMAT",
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    
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
    # STROKE VALIDATION
    # ========================
    min_stroke_points: int = int(os.getenv("MIN_STROKE_POINTS", "100"))
    max_stroke_points: int = int(os.getenv("MAX_STROKE_POINTS", "1200"))
    model_input_points: int = int(os.getenv("MODEL_INPUT_POINTS", "100"))
    
    # ========================
    # MODEL CONFIGURATION
    # ========================
    model_path: str = os.getenv(
        "MODEL_PATH",
        os.path.join(os.path.dirname(__file__), "Entrenamineto_LSTM", "embedding_network_mini.tflite")
    )
    model_version: str = os.getenv("MODEL_VERSION", "lstm_v1")
    preprocessing_profile: str = os.getenv("PREPROCESSING_PROFILE", "repo_compat")
    confidence_threshold: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))
    lstm_similarity_threshold: float = float(os.getenv("LSTM_SIMILARITY_THRESHOLD", "0.75"))
    max_request_size: int = int(os.getenv("MAX_REQUEST_SIZE", "204800"))
    model_sequence_length: int = int(os.getenv("MODEL_SEQUENCE_LENGTH", "100"))
    model_features_per_point: int = int(os.getenv("MODEL_FEATURES_PER_POINT", "4"))
    
    # ========================
    # ENVIRONMENT & LOGGING
    # ========================
    environment: str = os.getenv("ENVIRONMENT", "development")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"
        protected_namespaces = ()

    def __init__(self, **values):
        super().__init__(**values)
        src_dir = Path(__file__).resolve().parents[1]
        self.model_path = _resolve_project_path(self.model_path, src_dir)


# Create global settings instance
settings = Settings()
