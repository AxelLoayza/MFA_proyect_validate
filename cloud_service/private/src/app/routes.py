"""
API routes for biometric validation
"""
import logging
from typing import Dict, Any
from types import SimpleNamespace
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.config import settings
from app.models import BiometricRequest, BiometricResponse, HealthResponse, EnrollmentCloudRequest, MasterFeatureResponse, StepUpBiometricRequest
from app.auth import verify_credentials
from app.model_loader import compute_embedding
from app.utils import (
    RateLimiter, 
    get_client_ip, 
    validate_stroke_points
)
from app.preprocessing import preprocess_signature, preprocess_signature_repo_compat, compute_dtw_medoid_raw, compute_basic_signature_features

logger = logging.getLogger(__name__)

MIN_STROKE_POINTS = settings.min_stroke_points
MAX_STROKE_POINTS = settings.max_stroke_points

# Initialize router
router = APIRouter()

# Initialize rate limiter from environment-backed settings
rate_limiter = RateLimiter(
    max_requests=settings.rate_limit_requests,
    window_seconds=settings.rate_limit_window_seconds,
)

# Global variable to track model status (will be updated when model loads)
model_loaded = False


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    
    Returns:
        HealthResponse: Service health status
    """
    from app import __version__
    
    return HealthResponse(
        status="healthy",
        version=__version__,
        model_loaded=model_loaded
    )


@router.post("/api/biometric/validate", response_model=BiometricResponse)
async def validate_biometric(
    request: Request,
    payload: StepUpBiometricRequest,
    authenticated: bool = Depends(verify_credentials)
):
    """Validate a raw biometric signature and compare it against the stored reference template."""

    # Get client IP
    client_ip = get_client_ip(request)
    logger.info(f"Received validation request from {client_ip}")

    if not rate_limiter.check_rate_limit(client_ip):
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded: max 20 requests per minute"
        )

    try:
        stroke_points = payload.stroke_points
        is_valid, error_msg = validate_stroke_points(
            stroke_points,
            min_points=MIN_STROKE_POINTS,
            max_points=MAX_STROKE_POINTS,
        )

        if not is_valid:
            logger.error(f"Invalid stroke data: {error_msg}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )

        if payload.real_length < MIN_STROKE_POINTS:
            logger.warning(
                f"Signature rejected: real_length too short ({payload.real_length} < {MIN_STROKE_POINTS})"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Signature too short: {payload.real_length} points (minimum {MIN_STROKE_POINTS} required)"
            )

        basic_features = compute_basic_signature_features(
            stroke_points,
            payload.stroke_duration_ms,
            payload.real_length,
        )
        reference_template = payload.reference_template or {}

        print("=" * 80)
        print("📥 DATOS RECIBIDOS DESDE public gateway")
        print("=" * 80)
        print(f"  📊 Puntos crudos: {len(stroke_points)}")
        print(f"  📏 Longitud real (sin padding): {payload.real_length}")
        print(f"  📐 Distancia total: {basic_features.total_distance:.2f} px")
        print(f"  🏃 Velocidad promedio: {basic_features.velocity_mean:.2f} px/ms")
        print(f"  ⚡ Velocidad máxima: {basic_features.velocity_max:.2f} px/ms")
        print(f"  ⏱️  Duración: {basic_features.duration_ms} ms")
        print("-" * 80)

        logger.info(
            f"Processing stroke: {len(stroke_points)} points (real: {payload.real_length}), "
            f"distance={basic_features.total_distance}, "
            f"velocity_mean={basic_features.velocity_mean}"
        )

        try:
            use_repo_compat = (
                settings.preprocessing_profile.lower() == "repo_compat"
                or settings.model_features_per_point == 4
            )

            if use_repo_compat:
                if settings.preprocessing_profile.lower() != "repo_compat" and settings.model_features_per_point == 4:
                    logger.warning(
                        "Preprocessing profile '%s' does not match MODEL_FEATURES_PER_POINT=%s; using repo_compat to stay aligned with the production model",
                        settings.preprocessing_profile,
                        settings.model_features_per_point,
                    )
                features_array, mask = preprocess_signature_repo_compat(
                    stroke_points=stroke_points,
                    real_length=payload.real_length,
                    target_length=400,
                    robust_percentile=10,
                )
                feature_label = "[x, y, t, p]"
            else:
                features_array, mask = preprocess_signature(
                    stroke_points=stroke_points,
                    real_length=payload.real_length,
                    target_frequency=100,
                    target_length=400,
                )
                feature_label = "[x, y, vx, vy, v_mag, theta, curvature, pressure]"

            valid_points = int(mask.sum())
            padded_points = int((1 - mask).sum())

            print("✅ PREPROCESAMIENTO COMPLETADO")
            print(f"  🎯 Shape final: {features_array.shape}")
            print(f"  ✔️  Puntos válidos: {valid_points}")
            print(f"  ➕ Puntos con padding: {padded_points}")
            print(f"  📊 Features: {feature_label}")
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

        ml_model = getattr(getattr(request.app, "state", None), "ml_model", None)

        is_signature_valid, confidence_score, comparison_details = _validate_against_reference(
            stroke_points,
            reference_template,
            basic_features,
            float(mask.sum()),
            preprocessed_signature=features_array,
            ml_model=ml_model,
        )

        response = BiometricResponse(
            is_valid=is_signature_valid,
            confidence=confidence_score,
            user_id=None,
            message=f"Firma {'válida' if is_signature_valid else 'inválida'} con {confidence_score * 100:.0f}% de confianza",
            details={
                "model_version": settings.model_version,
                "processing_time_ms": 45,
                "features_analyzed": [
                    "template_distance",
                    "point_alignment",
                    "stroke_overlap"
                ],
                "matched_user": reference_template.get("user_id") if is_signature_valid else None,
                "num_points_processed": int(mask.sum()),
                "comparison": comparison_details,
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


def _build_reference_stroke(reference_template):
    dtw_medoid = reference_template.get("dtw_medoid") if isinstance(reference_template, dict) else None
    if not dtw_medoid:
        return None

    reference_points = []
    for index, point in enumerate(dtw_medoid):
        if isinstance(point, dict):
            x_value = point.get("x")
            y_value = point.get("y")
        elif isinstance(point, (list, tuple)) and len(point) >= 2:
            x_value, y_value = point[0], point[1]
        else:
            continue

        if x_value is None or y_value is None:
            continue

        reference_points.append(
            SimpleNamespace(
                x=float(x_value),
                y=float(y_value),
                t=index * 10,
                p=0.5,
            )
        )

    return reference_points or None


def _compute_lstm_similarity(preprocessed_signature, reference_template, ml_model):
    if ml_model is None or preprocessed_signature is None:
        return None

    reference_stroke = _build_reference_stroke(reference_template)
    if not reference_stroke:
        return None

    try:
        reference_features, _ = preprocess_signature_repo_compat(
            stroke_points=reference_stroke,
            real_length=len(reference_stroke),
            target_length=400,
            robust_percentile=10,
        )

        live_embedding = compute_embedding(ml_model, preprocessed_signature)
        reference_embedding = compute_embedding(ml_model, reference_features)

        denominator = float(np.linalg.norm(live_embedding) * np.linalg.norm(reference_embedding))
        if denominator <= 0.0:
            return None

        similarity = float(np.clip(np.dot(live_embedding, reference_embedding) / denominator, -1.0, 1.0))
        return similarity
    except Exception as error:
        logger.warning("LSTM similarity computation failed: %s", error)
        return None


def _validate_against_reference(normalized_stroke, reference_template, features, valid_points, preprocessed_signature=None, ml_model=None):
    def _resolve_dtw_medoid(template):
        if not isinstance(template, dict):
            return None

        if template.get("dtw_medoid"):
            return template.get("dtw_medoid")

        nested_template = template.get("masterFeature") or template.get("master_feature")
        if isinstance(nested_template, dict) and nested_template.get("dtw_medoid"):
            return nested_template.get("dtw_medoid")

        return None

    dtw_medoid = _resolve_dtw_medoid(reference_template)

    if not dtw_medoid:
        confidence = 0.35
        return False, confidence, {
            "reason": "missing_reference_template",
            "distance": None,
            "threshold": None,
            "valid_points": valid_points
        }

    captured_xy = np.array([[p.x, p.y] for p in normalized_stroke], dtype=float)
    reference_xy = np.array([[point[0], point[1]] for point in dtw_medoid], dtype=float)

    min_length = min(len(captured_xy), len(reference_xy))
    if min_length < 2:
        confidence = 0.25
        return False, confidence, {
            "reason": "insufficient_points",
            "distance": None,
            "threshold": None,
            "valid_points": valid_points
        }

    captured_xy = captured_xy[:min_length]
    reference_xy = reference_xy[:min_length]
    mean_distance = float(np.mean(np.linalg.norm(captured_xy - reference_xy, axis=1)))

    threshold = max(18.0, float(reference_template.get("distance_threshold", 24.0)))
    score = max(0.0, 1.0 - (mean_distance / threshold))

    pressure_bonus = 0.05 if 0.0 <= getattr(features, "velocity_mean", 0.0) <= 20.0 else 0.0
    lstm_similarity = _compute_lstm_similarity(preprocessed_signature, reference_template, ml_model)
    lstm_threshold = settings.lstm_similarity_threshold
    lstm_valid = lstm_similarity is None or lstm_similarity >= lstm_threshold

    confidence = max(0.0, min(1.0, 0.4 + score * 0.45 + pressure_bonus))
    if lstm_similarity is not None:
        confidence = max(0.0, min(1.0, confidence * 0.6 + lstm_similarity * 0.4))

    is_valid = mean_distance <= threshold and valid_points >= MIN_STROKE_POINTS and lstm_valid

    return is_valid, confidence, {
        "reason": "template_match",
        "distance": mean_distance,
        "threshold": threshold,
        "valid_points": valid_points,
        "lstm": {
            "similarity": lstm_similarity,
            "threshold": lstm_threshold,
            "used": lstm_similarity is not None,
            "valid": lstm_valid,
        }
    }

@router.post("/api/biometric/enroll", response_model=MasterFeatureResponse)
async def enroll_biometric(
    request: Request,
    payload: EnrollmentCloudRequest,
    authenticated: bool = Depends(verify_credentials)
):
    """
    Endpoint para RECIBIR 5 FIRMAS crudas y RETORNAR EL TEMPLATE DE ENROLAMIENTO.
    No suaviza ni extrae features adicionales: conserva la forma de la firma.
    """
    client_ip = get_client_ip(request)
    logger.info(f"Received MERGE/ENROLLMENT request from {client_ip}")
    logger.info(f"Enrollment signatures received: {len(payload.signatures)}")

    # Validar limitación de tasa
    if not rate_limiter.check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded"
        )
    
    try:
        raw_signatures = []

        # Validar y registrar las 5 firmas crudas
        for i, sig in enumerate(payload.signatures):
            is_valid, error_msg = validate_stroke_points(
                sig.stroke_points,
                min_points=MIN_STROKE_POINTS,
                max_points=MAX_STROKE_POINTS,
            )
            if not is_valid:
                raise ValueError(f"Firma #{i+1} inválida: {error_msg}")
            
            if sig.real_length < MIN_STROKE_POINTS:
                raise ValueError(f"Firma #{i+1} muy corta: real_length={sig.real_length}")

            raw_signatures.append(sig.stroke_points)
            
        print("=" * 80)
        print("✅ TODAS LAS 5 FIRMAS VALIDADAS CORRECTAMENTE PARA ENROLAMIENTO")
        print("=" * 80)

        medoid_index, medoid_sequence, pairwise_distances = compute_dtw_medoid_raw(raw_signatures)

        master_feature = {
            "dtw_medoid_index": medoid_index,
            "dtw_medoid": medoid_sequence,
            "dtw_pairwise_distances": pairwise_distances,
            "representation_strategy": "dtw_medoid",
            "preprocessing_profile": settings.preprocessing_profile,
            "target_length": 400,
        }
        
        return MasterFeatureResponse(
            status="success",
            message="Biometric enrollment template generated successfully",
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
            detail="Internal preprocessing error"
        )
