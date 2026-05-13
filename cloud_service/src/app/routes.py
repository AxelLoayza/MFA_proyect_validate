"""
API routes for biometric validation
"""
import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from .models import BiometricRequest, BiometricResponse, HealthResponse, EnrollmentCloudRequest, MasterFeatureResponse
from .auth import verify_credentials
from .utils import (
    RateLimiter, 
    get_client_ip, 
    validate_stroke_points
)
from .preprocessing import preprocess_signature, generate_master_feature

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
        
        # Reject signatures with real_length < 100 - no value for ML model
        if payload.real_length < 100:
            logger.warning(f"Signature rejected: real_length too short ({payload.real_length} < 100)")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Signature too short: {payload.real_length} points (minimum 100 required)"
            )
        
        # Log received data
        print("=" * 80)
        print("📥 DATOS RECIBIDOS DESDE apiContainer")
        print("=" * 80)
        print(f"  📊 Puntos normalizados: {len(payload.normalized_stroke)}")
        print(f"  📏 Longitud real (sin padding): {payload.real_length}")
        print(f"  📐 Distancia total: {payload.features.total_distance:.2f} px")
        print(f"  🏃 Velocidad promedio: {payload.features.velocity_mean:.2f} px/ms")
        print(f"  ⚡ Velocidad máxima: {payload.features.velocity_max:.2f} px/ms")
        print(f"  ⏱️  Duración: {payload.features.duration_ms} ms")
        print("-" * 80)
        
        logger.info(f"Processing stroke: {len(payload.normalized_stroke)} points (real: {payload.real_length}), "
                   f"distance={payload.features.total_distance}, "
                   f"velocity_mean={payload.features.velocity_mean}")
        
        # Advanced preprocessing pipeline
        try:
            features_array, mask = preprocess_signature(
                stroke_points=payload.normalized_stroke,
                real_length=payload.real_length,
                target_frequency=100,
                target_length=400
            )
            
            # Mensaje de éxito con información detallada
            valid_points = int(mask.sum())
            padded_points = int((1 - mask).sum())
            
            print("✅ PREPROCESAMIENTO COMPLETADO")
            print(f"  🎯 Shape final: {features_array.shape} (400 puntos × 8 features)")
            print(f"  ✔️  Puntos válidos: {valid_points}")
            print(f"  ➕ Puntos con padding: {padded_points}")
            print(f"  📊 Features: [x, y, vx, vy, v_mag, theta, curvature, pressure]")
            print(f"  🎭 Máscara aplicada: {mask.sum()}/{len(mask)} puntos reales")
            print("=" * 80)
            print()
            
            logger.info(f"Preprocessing complete: features shape={features_array.shape}, mask sum={mask.sum()}")
        except ValueError as e:
            logger.error(f"Preprocessing failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Preprocessing error: {str(e)}"
            )
            
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error procesando la biometría"
        )

@router.post("/api/biometric/enroll", response_model=MasterFeatureResponse)
async def enroll_biometric(
    request: Request,
    payload: EnrollmentCloudRequest,
    authenticated: bool = Depends(verify_credentials)
):
    """
    Endpoint para RECIBIR 5 FIRMAS y RETORNAR EL MASTER FEATURE.
    No valida contra la base de datos ni consulta red neuronal.
    Genera el tensor matemático (mean) y rango de tolerancia (std)
    """
    client_ip = get_client_ip(request)
    logger.info(f"Received MERGE/ENROLLMENT request from {client_ip}")

    # Validar limitación de tasa
    if not rate_limiter.check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded"
        )
    
    list_preprocessed = []
    
    try:
        # Preprocesar las 5 firmas
        for i, sig in enumerate(payload.signatures):
             # Validar stroke points
            is_valid, error_msg = validate_stroke_points(sig.normalized_stroke, min_points=100, max_points=1200)
            if not is_valid:
                raise ValueError(f"Firma #{i+1} inválida: {error_msg}")
            
            if sig.real_length < 100:
                 raise ValueError(f"Firma #{i+1} muy corta: real_length={sig.real_length}")
                 
            # Extracción Matemática / Preprocesamiento
            features_array, mask = preprocess_signature(
                stroke_points=sig.normalized_stroke,
                real_length=sig.real_length,
                target_frequency=100,
                target_length=400
            )
            list_preprocessed.append((features_array, mask))
            
        print("=" * 80)
        print("✅ TODAS LAS 5 FIRMAS PREPROCESADAS CORRECTAMENTE PARA ENROLAMIENTO")
        print("=" * 80)
        
        # Generar "Feature Maestro" matemático
        master_feature = generate_master_feature(list_preprocessed)
        
        return MasterFeatureResponse(
            status="success",
            message="Feature Maestro generado a partir de 5 firmas biométricas",
            master_feature=master_feature
        )
        
    except ValueError as e:
        logger.error(f"Error procesando firmas de enrolamiento: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Feature extraction error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected preprocessing error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal preprocessing error"
        )
        
        # TODO: Process with LSTM model
        # model_output = lstm_model.predict(features_array[np.newaxis, ...])
        # For now, use mock validation
        
        # Mock validation logic (replace with real model)
        is_signature_valid = _mock_validate_signature(features_array, mask, payload.features)
        confidence_score = _mock_calculate_confidence(features_array, mask, payload.features)
        
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
                "num_points_processed": int(mask.sum()),
                "preprocessing": {
                    "real_length": payload.real_length,
                    "after_preprocessing": features_array.shape[0],
                    "valid_points": int(mask.sum()),
                    "padded_points": int((1 - mask).sum())
                }
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


def _mock_validate_signature(features_array, mask, features) -> bool:
    """
    Mock signature validation (to be replaced with LSTM model)
    
    Args:
        features_array: Preprocessed features array (400, 8)
        mask: Mask array (400,) - 1 for real, 0 for padding
        features: Original extracted features
        
    Returns:
        bool: Whether signature appears valid
    """
    # Simple heuristic for mock validation
    # Check if signature has reasonable characteristics
    
    valid_points = int(mask.sum())
    
    if valid_points < 100:
        return False
    
    if features.velocity_mean < 0.5 or features.velocity_mean > 20.0:
        return False
    
    if features.total_distance < 50.0:
        return False
    
    # Mock: Consider valid if meets basic criteria
    return True


def _mock_calculate_confidence(features_array, mask, features) -> float:
    """
    Mock confidence calculation (to be replaced with LSTM model)
    
    Args:
        features_array: Preprocessed features array (400, 8)
        mask: Mask array (400,) - 1 for real, 0 for padding
        features: Original extracted features
        
    Returns:
        float: Confidence score between 0.0 and 1.0
    """
    # Simple heuristic for mock confidence
    base_confidence = 0.75
    
    valid_points = int(mask.sum())
    
    # Adjust based on number of points
    if valid_points >= 200:
        base_confidence += 0.10
    elif valid_points < 120:
        base_confidence -= 0.10
    
    # Adjust based on velocity consistency
    if 1.0 <= features.velocity_mean <= 5.0:
        base_confidence += 0.05
    
    # Clamp between 0.0 and 1.0
    return max(0.0, min(1.0, base_confidence))
