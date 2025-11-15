"""
Configuration Module - Load from .env file
Centralized configuration for biometric normalization service
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file
load_dotenv()


class Settings:
    """Application Settings - All configurable via environment variables"""

    # ========== API SERVER ==========
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "9001"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = ENVIRONMENT == "development"

    # ========== JWT TOKEN VALIDATION ==========
    JWT_PUBLIC_KEY_PATH: str = os.getenv("JWT_PUBLIC_KEY_PATH", "./keys/jwt_public.pem")
    JWT_ISSUER: str = os.getenv("JWT_ISSUER", "LocalAzure")
    JWT_AUDIENCE: str = os.getenv("JWT_AUDIENCE", "bmfa-processor")
    JWT_ALGORITHM: str = "RS256"

    # ========== SIGNATURE VALIDATION ==========
    SIGNATURE_PROVIDER_USERNAME: str = os.getenv("SIGNATURE_PROVIDER_USERNAME", "bmfa_validator")
    SIGNATURE_PROVIDER_PASSWORD: str = os.getenv("SIGNATURE_PROVIDER_PASSWORD", "secure_password_change_me")

    # ========== CLOUD ML SERVICE (TLS/HTTPS) ==========
    CLOUD_PROVIDER_ENDPOINT: str = os.getenv(
        "CLOUD_PROVIDER_ENDPOINT",
        "https://your-ml-service.example.com/api/biometric/validate"
    )
    CLOUD_PROVIDER_USERNAME: str = os.getenv("CLOUD_PROVIDER_USERNAME", "bmfa_user")
    CLOUD_PROVIDER_PASSWORD: str = os.getenv("CLOUD_PROVIDER_PASSWORD", "your_secure_password_here")
    CLOUD_PROVIDER_TIMEOUT: int = int(os.getenv("CLOUD_PROVIDER_TIMEOUT", "30"))
    CLOUD_PROVIDER_VERIFY_SSL: bool = os.getenv("CLOUD_PROVIDER_VERIFY_SSL", "true").lower() == "true"

    # ========== BIOMETRIC NORMALIZATION ==========
    MIN_STROKE_POINTS: int = int(os.getenv("MIN_STROKE_POINTS", "100"))
    MAX_STROKE_POINTS: int = int(os.getenv("MAX_STROKE_POINTS", "1200"))
    PADDING_STRATEGY: str = os.getenv("PADDING_STRATEGY", "linear_interpolation")

    # ========== RATE LIMITING & SECURITY ==========
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", "8"))
    MAX_REQUEST_SIZE: int = int(os.getenv("MAX_REQUEST_SIZE", "102400"))  # 100 KB

    # ========== LOGGING ==========
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


# Singleton instance
_settings: Settings | None = None


def get_settings() -> Settings:
    """Get application settings singleton"""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def validate_config() -> None:
    """Validate that all required files exist"""
    settings = get_settings()
    jwt_key_path = Path(settings.JWT_PUBLIC_KEY_PATH)
    if not jwt_key_path.exists():
        print(f"⚠️  Warning: JWT Public Key not found at: {settings.JWT_PUBLIC_KEY_PATH}")
        print(f"    Token validation will be skipped in development mode.")
