"""
Main FastAPI application with HTTPS/TLS support and MongoDB integration
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .routes import router
from .utils import RateLimiter
from .config import settings
from .database import db_connection

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=settings.log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events
    """
    # Startup
    logger.info("=" * 60)
    logger.info("Starting Cloud Service for Biometric Validation")
    logger.info("=" * 60)
    
    # Log configuration
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"API Host: {settings.api_host}:{settings.api_port}")
    logger.info(f"Rate Limit: {settings.rate_limit_requests} requests per {settings.rate_limit_window_seconds}s")
    logger.info(f"Max Request Size: {settings.max_request_size} bytes")
    logger.info(f"Model Path: {settings.model_path}")
    logger.info(f"Model Version: {settings.model_version}")
    logger.info(f"Confidence Threshold: {settings.confidence_threshold}%")
    logger.info(f"TLS Enabled: {settings.tls_enabled}")
    
    # MongoDB Connection
    logger.info(f"MongoDB URI: {settings.mongo_uri}")
    logger.info(f"Database: {settings.mongo_db_name}")
    
    if db_connection.connect():
        logger.info("✓ MongoDB connection initialized successfully")
    else:
        logger.error("✗ Failed to connect to MongoDB - service will run with limited functionality")
    
    # TODO: Load LSTM model here
    # global model
    # model = load_lstm_model(settings.model_path)
    logger.info("Model loading deferred (not implemented yet)")
    
    logger.info("Startup complete - Ready to accept requests")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Cloud Service")
    db_connection.disconnect()
    logger.info("MongoDB connection closed")


# Create FastAPI application
app = FastAPI(
    title="Biometric Signature Validation Service",
    description="Cloud service for validating biometric signature data using LSTM",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for unhandled errors
    """
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "error": str(exc)
        }
    )


# Request size limiter middleware
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """
    Middleware to limit request body size
    """
    max_size = int(os.getenv("MAX_REQUEST_SIZE", "102400"))  # 100 KB default
    
    # Check Content-Length header
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_size:
        logger.warning(f"Request too large: {content_length} > {max_size}")
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": f"Request body too large: max {max_size} bytes"}
        )
    
    response = await call_next(request)
    return response


# Include routes
app.include_router(router)


# Root endpoint
@app.get("/")
async def root():
    """
    Root endpoint
    """
    return {
        "service": "Biometric Signature Validation",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "validate": "/api/biometric/validate"
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("API_PORT", "8000"))
    tls_enabled = os.getenv("TLS_ENABLED", "true").lower() == "true"
    
    if tls_enabled:
        # Run with HTTPS
        cert_file = os.getenv("TLS_CERT_FILE", "./certs/server.crt")
        key_file = os.getenv("TLS_KEY_FILE", "./certs/server.key")
        
        logger.info(f"Starting server with HTTPS on port {port}")
        logger.info(f"Certificate: {cert_file}")
        logger.info(f"Key: {key_file}")
        
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=port,
            ssl_certfile=cert_file,
            ssl_keyfile=key_file,
            log_level="info"
        )
    else:
        # Run with HTTP (development only)
        logger.warning("Running WITHOUT TLS - Use only for development!")
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=port,
            log_level="info"
        )
