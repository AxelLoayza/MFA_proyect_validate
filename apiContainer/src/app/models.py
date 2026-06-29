"""
Data Models - Pydantic models for request/response validation
Exactamente lo que envía el cliente Flutter (login_screen.dart)

Flujo:
1. Flutter envía POST a /normalize con StrokeRequest
2. API normaliza (padding si es necesario) 
3. API envía a servicio en la nube con HTTPS/TLS
4. Retorna resultado
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime


class StrokePoint(BaseModel):
    """
    Punto individual del trazo biométrico
    Exactamente como Flutter lo envía en login_screen.dart
    """
    x: float = Field(..., description="Coordenada X del punto")
    y: float = Field(..., description="Coordenada Y del punto")
    t: int = Field(..., ge=0, description="Tiempo relativo en ms desde inicio del trazo")
    p: float = Field(..., ge=0.0, le=1.0, description="Presión normalizada (0.0 a 1.0)")

    class Config:
        json_schema_extra = {
            "example": {
                "x": 100.5,
                "y": 150.3,
                "t": 0,
                "p": 0.85
            }
        }


class NormalizationRequest(BaseModel):
    """
    Request que envía Flutter con los datos del trazo
    Enviado a: POST /normalize
    """
    timestamp: str = Field(..., description="ISO 8601 timestamp de captura")
    stroke_points: List[StrokePoint] = Field(..., description="Puntos del trazo (mínimo 1)")
    stroke_duration_ms: int = Field(..., ge=0, description="Duración total en ms")

    class Config:
        json_schema_extra = {
            "example": {
                "timestamp": "2025-11-14T10:30:00Z",
                "stroke_points": [
                    {"x": 100.5, "y": 150.3, "t": 0, "p": 0.8},
                    {"x": 105.2, "y": 152.1, "t": 50, "p": 0.85},
                    {"x": 110.0, "y": 154.8, "t": 100, "p": 0.9}
                ],
                "stroke_duration_ms": 2500
            }
        }


class NormalizationResponse(BaseModel):
    """
    Response que retorna la API después de normalizar
    El cliente recibe estos datos normalizados + resultado de ML
    """
    status: str = Field(..., description="success | error")
    message: str = Field(..., description="Mensaje de estado")
    normalized_stroke: List[StrokePoint] = Field(default=[], description="Puntos normalizados")
    features: dict = Field(default={}, description="Features extraídas (velocidad, distancia, etc)")
    ml_response: dict = Field(default={}, description="Respuesta del servicio ML en la nube")
    error: str | None = None  # Optional error message


class EnrollmentSignatureRequest(BaseModel):
    """
    Firma individual enviada en el flujo de enrolamiento.
    Se valida estructura y tamaño, pero no se extraen features adicionales.
    """
    timestamp: str = Field(..., description="ISO 8601 timestamp de captura")
    stroke_points: List[StrokePoint] = Field(
        ...,
        min_length=100,
        max_length=1200,
        description="Puntos crudos del trazo"
    )
    stroke_duration_ms: int = Field(..., ge=0, description="Duración total en ms")

    class Config:
        json_schema_extra = {
            "example": {
                "timestamp": "2025-11-14T10:30:00Z",
                "stroke_points": [
                    {"x": 100.5, "y": 150.3, "t": 0, "p": 0.8},
                    {"x": 105.2, "y": 152.1, "t": 50, "p": 0.85},
                    {"x": 110.0, "y": 154.8, "t": 100, "p": 0.9}
                ],
                "stroke_duration_ms": 2500
            }
        }


class EnrollmentRequest(BaseModel):
    """
    Request que envía Node.js con 5 firmas para enrolamiento.
    No incluye features extras: sólo estructura, tamaño y trazos crudos.
    """
    signatures: List[EnrollmentSignatureRequest] = Field(
        ...,
        min_length=5,
        max_length=5,
        description="Exactamente 5 firmas para el enrolamiento de biometría"
    )
    representation_strategy: Literal["dtw_medoid"] = Field(
        default="dtw_medoid",
        description="Estrategia de enrolamiento biometrico"
    )


class EnrollmentResponse(BaseModel):
    """
    Response que la API retorna con el Feature Maestro a Node.js
    """
    status: str
    message: str
    master_feature: dict = Field(..., description="Tensores matemáticos: mean y std")

