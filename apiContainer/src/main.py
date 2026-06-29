"""
Main Entry Point - Biometric Normalization Service
Starts the FastAPI server with uvicorn

Usage: python main.py
"""
import sys
from pathlib import Path

# Add src directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

import uvicorn
from app.config import get_settings

settings = get_settings()


if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("  🔐 BIOMETRIC NORMALIZATION SERVICE - API")
    print("=" * 80)
    print(f"  📍 Server: http://{settings.API_HOST}:{settings.API_PORT}")
    print(f"  📚 Docs: http://{settings.API_HOST}:{settings.API_PORT}/docs")
    print(f"  🌍 Environment: {settings.ENVIRONMENT}")
    print(f"  🔒 Cloud ML Service: {settings.CLOUD_PROVIDER_ENDPOINT}")
    print(f"  📊 Normalization: {settings.PADDING_STRATEGY}")
    print("=" * 80)
    print()
    
    uvicorn.run(
        "app:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
