"""
Pydantic models for request/response validation
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator


class StrokePoint(BaseModel):
    """Individual point in a signature stroke"""
    x: float = Field(..., description="X coordinate in pixels")
    y: float = Field(..., description="Y coordinate in pixels")
    t: int = Field(..., description="Timestamp in milliseconds", ge=0)
    p: float = Field(..., description="Pressure value", ge=0.0, le=1.0)

    @field_validator('x', 'y')
    @classmethod
    def validate_coordinates(cls, v):
        if not isinstance(v, (int, float)):
            raise ValueError('Coordinates must be numeric')
        return float(v)


class BiometricFeatures(BaseModel):
    """Extracted features from normalized stroke"""
    num_points: int = Field(..., description="Number of points after normalization")
    total_distance: float = Field(..., description="Total distance in pixels")
    velocity_mean: float = Field(..., description="Mean velocity in px/ms")
    velocity_max: float = Field(..., description="Maximum velocity in px/ms")
    duration_ms: int = Field(..., description="Total duration in milliseconds")


class BiometricRequest(BaseModel):
    """Request payload from apiContainer"""
    normalized_stroke: List[StrokePoint] = Field(
        ..., 
        description="Normalized stroke points (100-1200 points)",
        min_length=100,
        max_length=1200
    )
    features: BiometricFeatures = Field(..., description="Extracted features")
    real_length: int = Field(..., description="Original length before padding", ge=100)

    @field_validator('normalized_stroke')
    @classmethod
    def validate_stroke_length(cls, v):
        if len(v) < 100:
            raise ValueError(f'Too few points: {len(v)} < 100')
        if len(v) > 1200:
            raise ValueError(f'Too many points: {len(v)} > 1200')
        return v


class BiometricResponse(BaseModel):
    """Response payload to apiContainer / Node.js"""
    is_valid: bool = Field(..., description="Whether signature is valid")
    confidence: float = Field(..., description="Confidence score 0.0-1.0", ge=0.0, le=1.0)
    distance: float = Field(..., description="Euclidean distance between embeddings")
    message: str = Field(..., description="Human-readable message")
    details: Dict[str, Any] = Field(default_factory=dict, description="Additional details")


class MasterFeature(BaseModel):
    """Tensor de referencia para la firma del usuario"""
    mean: List[List[float]] = Field(..., description="Tensor promedio (400x4)")
    std: List[List[float]] = Field(..., description="Tensor desviación estándar (400x4)")


class ValidationCloudRequest(BaseModel):
    """Request payload from Node.js para validar: Master vs Live"""
    live_signature: BiometricRequest = Field(..., description="La nueva firma a validar")
    master_feature: MasterFeature = Field(..., description="El feature maestro desencriptado previamente por Node.js")


class EnrollmentCloudRequest(BaseModel):
    """Request para generar el Feature Maestro con 5 firmas"""
    signatures: List[BiometricRequest] = Field(
        ...,
        min_length=5,
        max_length=5,
        description="5 firmas normalizadas para extraer master feature"
    )

class MasterFeatureResponse(BaseModel):
    """Respuesta con el vector de características maestro"""
    status: str = Field(..., description="success | error")
    master_feature: Dict[str, List[List[float]]] = Field(
        ...,
        description="Contiene las matrices 'mean' y 'std'"
    )
    message: str = Field(..., description="Mensaje de estado")


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="API version")
    model_loaded: bool = Field(..., description="Whether ML model is loaded")
