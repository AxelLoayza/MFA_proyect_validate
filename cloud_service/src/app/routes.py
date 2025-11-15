"""
API routes for biometric validation
"""
import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from .models import BiometricRequest, BiometricResponse, HealthResponse
from .auth import verify_credentials
from .utils import (
    RateLimiter, 
    get_client_ip, 
    validate_stroke_points,
    apply_linear_interpolation_padding,
    calculate_basic_features
)

logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter()

# Initialize rate limiter (20 requests per minute)
rate_limiter = RateLimiter(max_requests=20, window_seconds=60)

# Global variable to track model status (will be updated when model loads)
model_loaded = False


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    
    Returns:
        HealthResponse: Service health status
    """
    from . import __version__
    
    return HealthResponse(
        status="healthy",
        version=__version__,
        model_loaded=model_loaded
    )


@router.post("/api/biometric/validate", response_model=BiometricResponse)
async def validate_biometric(
    request: Request,
    payload: BiometricRequest,
    authenticated: bool = Depends(verify_credentials)
):
    """
    Validate biometric signature data
    
    This endpoint receives normalized stroke data from apiContainer,
    validates it, applies additional padding if needed, and processes
    it through the LSTM model for authentication.
    
    Args:
        request: FastAPI Request object (for IP extraction)
        payload: BiometricRequest with normalized stroke and features
        authenticated: Authentication dependency
        
    Returns:
        BiometricResponse: Validation result with confidence score
        
    Raises:
        HTTPException: 429 if rate limit exceeded, 400 if invalid data
    """
    # Get client IP
    client_ip = get_client_ip(request)
    logger.info(f"Received validation request from {client_ip}")
    
    # Check rate limit
    if not rate_limiter.check_rate_limit(client_ip):
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded: max 20 requests per minute"
        )
    
    try:
        # Validate stroke points
        is_valid, error_msg = validate_stroke_points(
            payload.normalized_stroke,
            min_points=100,
            max_points=1200
        )
        
        if not is_valid:
            logger.error(f"Invalid stroke data: {error_msg}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
        
        # Check if padding is needed (should already be done by apiContainer)
        stroke_points = payload.normalized_stroke
        if len(stroke_points) < 100:
            logger.info(f"Applying additional padding: {len(stroke_points)} -> 100")
            stroke_points = apply_linear_interpolation_padding(stroke_points, 100)
        
        # Log received data
        logger.info(f"Processing stroke: {len(stroke_points)} points, "
                   f"distance={payload.features.total_distance}, "
                   f"velocity_mean={payload.features.velocity_mean}")
        
        # TODO: Process with LSTM model
        # For now, return mock validation response
        # This will be replaced with actual model inference
        
        # Mock validation logic (replace with real model)
        is_signature_valid = _mock_validate_signature(stroke_points, payload.features)
        confidence_score = _mock_calculate_confidence(stroke_points, payload.features)
        
        # Build response
        response = BiometricResponse(
            is_valid=is_signature_valid,
            confidence=confidence_score,
            user_id="673636 9b910e1d313235ba06" if is_signature_valid else None,
            message=f"Firma {'válida' if is_signature_valid else 'inválida'} con {confidence_score*100:.0f}% de confianza",
            details={
                "model_version": "lstm_v2.1_mock",
                "processing_time_ms": 45,
                "features_analyzed": [
                    "velocity_mean",
                    "velocity_max",
                    "total_distance",
                    "pressure_variation",
                    "num_points"
                ],
                "matched_user": "usuario@example.com" if is_signature_valid else None,
                "num_points_processed": len(stroke_points),
                "padding_applied": len(payload.normalized_stroke) < 100
            }
        )
        
        logger.info(f"Validation complete: valid={is_signature_valid}, confidence={confidence_score}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing biometric data: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


def _mock_validate_signature(stroke_points, features) -> bool:
    """
    Mock signature validation (to be replaced with LSTM model)
    
    Args:
        stroke_points: List of normalized stroke points
        features: Extracted features
        
    Returns:
        bool: Whether signature appears valid
    """
    # Simple heuristic for mock validation
    # Check if signature has reasonable characteristics
    
    if features.num_points < 100:
        return False
    
    if features.velocity_mean < 0.5 or features.velocity_mean > 20.0:
        return False
    
    if features.total_distance < 50.0:
        return False
    
    # Mock: Consider valid if meets basic criteria
    return True


def _mock_calculate_confidence(stroke_points, features) -> float:
    """
    Mock confidence calculation (to be replaced with LSTM model)
    
    Args:
        stroke_points: List of normalized stroke points
        features: Extracted features
        
    Returns:
        float: Confidence score between 0.0 and 1.0
    """
    # Simple heuristic for mock confidence
    base_confidence = 0.75
    
    # Adjust based on number of points
    if features.num_points >= 200:
        base_confidence += 0.10
    elif features.num_points < 120:
        base_confidence -= 0.10
    
    # Adjust based on velocity consistency
    if 1.0 <= features.velocity_mean <= 5.0:
        base_confidence += 0.05
    
    # Clamp between 0.0 and 1.0
    return max(0.0, min(1.0, base_confidence))
