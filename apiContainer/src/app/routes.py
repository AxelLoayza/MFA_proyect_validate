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
from .models import NormalizationRequest, NormalizationResponse, EnrollmentRequest, EnrollmentResponse
from .normalizer import normalize_stroke
from .cloud_service import send_to_ml_service, send_enrollment_to_ml_service
from .rate_limiter import rate_limit_dependency

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
        except HTTPException:
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


@router.post("/enroll", response_model=EnrollmentResponse, dependencies=[Depends(rate_limit_dependency)])
async def enroll_biometric_master(request: EnrollmentRequest) -> EnrollmentResponse:
    """
    Endpoint intermedio para registro.
    Toma 5 firmas desde Node.js, las normaliza en memoria y solicita 
    el tensor final numérico al cloud_service.
    """
    logger.info(f"Recibiendo solicitud de enrolamiento con {len(request.signatures)} firmas")
    
    # Normalizar cada firma individualmente (padding y corrección de ejes)
    normalized_payloads = []
    
    try:
        for i, sig in enumerate(request.signatures):
             norm_points, features = normalize_stroke(sig)
             
             normalized_payloads.append({
                 "normalized_stroke": [{"x": p.x, "y": p.y, "t": p.t, "p": p.p} for p in norm_points],
                 "real_length": features.get("real_length"),
                 "features": features
             })
             
        logger.info(f"✓ 5 Firmas normalizadas (Padding y Padding Features aplicados)")
        
        # Enviar a cloud_service/api/biometric/enroll
        cloud_response = send_enrollment_to_ml_service(normalized_payloads)
        
        # `master_feature` viene como {"mean": [...], "std": [...]}
        return EnrollmentResponse(
            status="success",
            message="Biometric enrollment tensor calculated successfully",
            master_feature=cloud_response.get("master_feature", {})
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error procesando el enrolamiento: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal error formatting enrollment signatures: {str(e)}"
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


@router.post("/auth/google/verify")
async def verify_google(request: dict) -> dict:
    """
    Endpoint Google OAuth - SDK intermediario
    
    Recibe id_token de Backend Node.js y delega a Cloud Service
    
    Entrada:
    {
      "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijk4Y..."
    }
    
    Salida:
    {
      "success": True,
      "access_token": "arc_0.5_token",
      "arc": "0.5",
      "amr": ["federated"],
      "user": {...},
      "arcSessionId": "..."
    }
    """
    try:
        id_token = request.get("id_token")
        access_token = request.get("access_token")

        if not id_token and not access_token:
            raise HTTPException(
                status_code=400,
                detail="id_token o access_token requerido"
            )

        logger.info("[API Routes] Verificando Google token")

        # Importar aquí para evitar circular imports
        from .google_service import verify_google_token, verify_google_access

        if id_token:
            result = await verify_google_token(id_token)
        else:
            # access_token flow
            result = await verify_google_access(access_token)
        
        logger.info(f"[API Routes] ✓ Google token verificado, ARC {result['arc']}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API Routes] Error en Google verify: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Google verification failed: {str(e)}"
        )


@router.post("/auth/google/exchange")
async def exchange_google_code(request: dict) -> dict:
    """
    Endpoint Google OAuth Code Exchange - SDK intermediario
    
    Recibe authorization_code de Backend Node.js y delega a Cloud Service
    
    Flujo Code Flow + PKCE:
    1. Backend Node.js envía authorization_code
    2. SDK (este servicio) envía a Cloud Service
    3. Cloud Service intercambia con Google (tiene CLIENT_SECRET)
    4. Cloud Service extrae datos, firma ARC 0.5, retorna
    
    Entrada:
    {
      "code": "4/0AY0e-g...",
      "redirect_uri": "https://localhost:4000/api/auth/callback/google"
    }
    
    Salida:
    {
      "success": True,
      "access_token": "arc_0.5_token",
      "arc": "0.5",
      "amr": ["federated"],
      "user": {...},
      "arcSessionId": "..."
    }
    """
    try:
        code = request.get("code")
        redirect_uri = request.get("redirect_uri")
        
        if not code:
            raise HTTPException(
                status_code=400,
                detail="authorization_code requerido"
            )
        
        logger.info("[API Routes] Intercambiando authorization_code con Cloud Service")
        
        # Importar aquí para evitar circular imports
        from .google_service import exchange_google_code
        
        result = await exchange_google_code(code, redirect_uri)
        
        logger.info(f"[API Routes] ✓ Code intercambiado, ARC {result['arc']}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API Routes] Error en Google exchange: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Google code exchange failed: {str(e)}"
        )
