"""
Main FastAPI application with HTTPS/TLS support
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

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
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
    logger.info(f"API Port: {os.getenv('API_PORT', '8000')}")
    logger.info(f"Rate Limit: {os.getenv('RATE_LIMIT_REQUESTS', '20')} requests per minute")
    logger.info(f"Max Request Size: {os.getenv('MAX_REQUEST_SIZE', '204800')} bytes")
    logger.info(f"Model Path: {os.getenv('MODEL_PATH', './models/lstm_signature_model.keras')}")
    logger.info(f"TLS Enabled: {os.getenv('TLS_ENABLED', 'true')}")
    
    # TODO: Load LSTM model here
    # global model
    # model = load_lstm_model(os.getenv('MODEL_PATH'))
    logger.info("Model loading deferred (not implemented yet)")
    
    logger.info("Startup complete - Ready to accept requests")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Cloud Service")
    # Cleanup resources if needed


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
