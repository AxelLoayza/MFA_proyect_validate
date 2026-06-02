"""
Main FastAPI application with HTTPS/TLS support and MongoDB integration
"""
import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import db_connection
from .model_loader import load_ml_model
from .routes import router

load_dotenv()

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

loaded_model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    """
    global loaded_model

    logger.info("=" * 60)
    logger.info("Starting Cloud Service for Biometric Validation")
    logger.info("=" * 60)

    logger.info(f"Environment: {settings.environment}")
    logger.info(f"API Host: {settings.api_host}:{settings.api_port}")
    logger.info(
        f"Rate Limit: {settings.rate_limit_requests} requests per {settings.rate_limit_window_seconds}s"
    )
    logger.info(f"Max Request Size: {settings.max_request_size} bytes")
    logger.info(f"Model Path: {settings.model_path}")
    logger.info(f"Model Version: {settings.model_version}")
    logger.info(f"Confidence Threshold: {settings.confidence_threshold}")
    logger.info(f"TLS Enabled: {settings.tls_enabled}")

    logger.info(f"MongoDB URI: {settings.mongo_uri}")
    logger.info(f"Database: {settings.mongo_db_name}")

    if db_connection.connect():
        logger.info("✓ MongoDB connection initialized successfully")
    else:
        logger.error("✗ Failed to connect to MongoDB - service will run with limited functionality")

    try:
        loaded_model = load_ml_model()
        app.state.model = loaded_model

        if loaded_model is not None:
            logger.info("✓ LSTM model loaded successfully")
        else:
            logger.warning("LSTM model not loaded. Biometric validation will fail until a valid model is available.")
    except Exception as error:
        loaded_model = None
        app.state.model = None
        logger.error(f"Error loading LSTM model: {error}", exc_info=True)

    logger.info("Startup complete - Ready to accept requests")

    yield

    logger.info("Shutting down Cloud Service")
    db_connection.disconnect()
    logger.info("MongoDB connection closed")


app = FastAPI(
    title="Biometric Signature Validation Service",
    description="Cloud service for validating biometric signature data using LSTM",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for unhandled errors.
    """
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "error": str(exc),
        },
    )


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """
    Middleware to limit request body size.
    """
    max_size = settings.max_request_size

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_size:
        logger.warning(f"Request too large: {content_length} > {max_size}")
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": f"Request body too large: max {max_size} bytes"},
        )

    response = await call_next(request)
    return response


app.include_router(router)


@app.get("/")
async def root():
    """
    Root endpoint.
    """
    return {
        "service": "Biometric Signature Validation",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "validate": "/api/biometric/validate",
        },
    }


if __name__ == "__main__":
    import uvicorn

    port = settings.api_port
    tls_enabled = settings.tls_enabled

    if tls_enabled:
        cert_file = os.getenv("TLS_CERT_FILE", "./certs/server.crt")
        key_file = os.getenv("TLS_KEY_FILE", "./certs/server.key")

        logger.info(f"Starting server with HTTPS on port {port}")
        logger.info(f"Certificate: {cert_file}")
        logger.info(f"Key: {key_file}")

        uvicorn.run(
            "app.main:app",
            host=settings.api_host,
            port=port,
            ssl_certfile=cert_file,
            ssl_keyfile=key_file,
            log_level=settings.log_level.lower(),
        )
    else:
        logger.warning("Running WITHOUT TLS - Use only for development!")
        uvicorn.run(
            "app.main:app",
            host=settings.api_host,
            port=port,
            log_level=settings.log_level.lower(),
        )