"""
FastAPI Application - Biometric Data Normalization Service
Receives biometric features → Normalizes with padding → Sends to ML service via HTTPS/TLS
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from .config import get_settings, validate_config
from .routes import router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Validate configuration
try:
    validate_config()
except Exception as e:
    logger.warning(f"Configuration warning: {e}")

# Get settings
settings = get_settings()

# Create FastAPI application
app = FastAPI(
    title="Biometric Normalization API",
    version="1.0.0",
    description="Normalize biometric stroke data and forward to ML service via HTTPS/TLS",
)

# Add CORS middleware for flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Middleware to limit request body size (protection against payload attacks)
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """Limit request body size to prevent DoS attacks"""
    if request.method in ["POST", "PUT", "PATCH"]:
        content_length = request.headers.get("content-length")
        if content_length:
            content_length = int(content_length)
            if content_length > settings.MAX_REQUEST_SIZE:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={
                        "status": "error",
                        "message": f"Request body too large: {content_length} bytes (max: {settings.MAX_REQUEST_SIZE} bytes)"
                    }
                )
    
    response = await call_next(request)
    return response


# Include routes
app.include_router(router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Biometric Normalization API",
        "version": "1.0.0",
        "status": "running",
        "environment": settings.ENVIRONMENT,
        "endpoints": {
            "normalize": "POST /normalize",
            "health": "GET /health",
            "docs": "GET /docs",
        }
    }


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return {
        "status": "error",
        "message": str(exc),
    }
