"""
API Routes - Normalization endpoint

Recibe exactamente lo que envía Flutter (login_screen.dart):
  - timestamp: ISO 8601 string
  - stroke_points: Array de {x, y, t, p}
  - stroke_duration_ms: int

Procesa:
  1. Valida estructura
  2. Normaliza (padding si es necesario)
  3. Envía a servicio ML en la nube por HTTPS/TLS
  4. Retorna respuesta con datos normalizados + resultado ML

Protecciones:
  - Rate limiting: 8 requests/minute por IP
  - Request size limit: 100 KB max
  - Points limit: 100-1200 puntos
"""
from fastapi import APIRouter, HTTPException, status, Depends, Request
import logging
from app.models import NormalizationRequest, NormalizationResponse
from app.normalizer import normalize_stroke
from app.cloud_service import send_to_ml_service
from app.rate_limiter import rate_limit_dependency

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Biometric Normalization"])


@router.post("/normalize", response_model=NormalizationResponse, dependencies=[Depends(rate_limit_dependency)])
async def normalize_biometric(request: NormalizationRequest) -> NormalizationResponse:
    """
    Endpoint principal: Recibe stroke, normaliza, envía a ML en la nube
    
    Entrada (de Flutter):
    {
      "timestamp": "2025-11-14T10:30:00Z",
      "stroke_points": [{"x": 100.5, "y": 150.3, "t": 0, "p": 0.8}, ...],
      "stroke_duration_ms": 2500
    }
    
    Salida (respuesta):
    {
      "status": "success",
      "normalized_stroke": [...puntos normalizados...],
      "features": {...features extraídas...},
      "ml_response": {...resultado de tu servicio ML...},
      "message": "Biometric data normalized and validated"
    }
    """
    try:
        # 1. Normalizar datos del stroke (padding si es necesario)
        logger.info(f"Recibido stroke con {len(request.stroke_points)} puntos, duración: {request.stroke_duration_ms}ms")
        
        try:
            normalized_points, features = normalize_stroke(request)
            logger.info(f"✓ Stroke normalizado: {len(request.stroke_points)} → {len(normalized_points)} puntos")
        except ValueError as e:
            logger.error(f"Error en normalización: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Normalization error: {str(e)}"
            )
        
        # 2. Enviar a servicio ML en la nube (HTTPS/TLS)
        logger.info(f"Enviando a servicio ML: {len(normalized_points)} puntos normalizados + features")
        
        try:
            ml_response = send_to_ml_service(normalized_points, features)
            logger.info(f"✓ Respuesta de ML recibida: {ml_response}")
        except HTTPException as e:
            logger.error(f"Error del servicio ML: {e.detail}")
            raise
        
        # 3. Retornar respuesta exitosa
        return NormalizationResponse(
            status="success",
            message="Biometric data normalized and validated successfully",
            normalized_stroke=normalized_points,
            features=features,
            ml_response=ml_response,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error inesperado: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )


@router.get("/health")
async def health_check() -> dict:
    """Health check endpoint - verifica que el servicio está corriendo"""
    return {
        "status": "healthy",
        "service": "Biometric Normalization API",
        "version": "1.0.0",
        "message": "Ready to normalize biometric data"
    }
