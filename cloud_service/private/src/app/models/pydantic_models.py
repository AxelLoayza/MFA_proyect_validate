"""
Pydantic models for request/response validation
"""
from typing import List, Optional, Dict, Any, Literal
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


class EnrollmentSignatureRequest(BaseModel):
    """Raw signature payload used for enrollment."""
    timestamp: str = Field(..., description="ISO 8601 timestamp of capture")
    stroke_points: List[StrokePoint] = Field(
        ..., 
        description="Raw signature points",
        min_length=100,
        max_length=1200
    )
    stroke_duration_ms: int = Field(..., description="Total duration in milliseconds", ge=0)
    real_length: int = Field(..., description="Original length before any transport padding", ge=100)

    @field_validator('stroke_points')
    @classmethod
    def validate_signature_length(cls, v):
        if len(v) < 100:
            raise ValueError(f'Too few points: {len(v)} < 100')
        if len(v) > 1200:
            raise ValueError(f'Too many points: {len(v)} > 1200')
        return v


class BiometricResponse(BaseModel):
    """Response payload to apiContainer"""
    is_valid: bool = Field(..., description="Whether signature is valid")
    confidence: float = Field(..., description="Confidence score 0.0-1.0", ge=0.0, le=1.0)
    user_id: Optional[str] = Field(None, description="Matched user ID if valid")
    message: str = Field(..., description="Human-readable message")
    details: Dict[str, Any] = Field(default_factory=dict, description="Additional details")


class EnrollmentCloudRequest(BaseModel):
    """Request para generar el template de enrolamiento con 5 firmas."""
    signatures: List[EnrollmentSignatureRequest] = Field(
        ...,
        min_length=5,
        max_length=5,
        description="5 firmas crudas para extraer el template de enrolamiento"
    )
    representation_strategy: Literal["dtw_medoid"] = Field(
        default="dtw_medoid",
        description="Estrategia de representación para el enrolamiento"
    )


class MasterFeatureResponse(BaseModel):
    """Respuesta con el vector de características maestro"""
    status: str = Field(..., description="success | error")
    master_feature: Dict[str, Any] = Field(
        ...,
        description="Contiene el template de enrolamiento y metadata asociada"
    )
    message: str = Field(..., description="Mensaje de estado")


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="API version")
    model_loaded: bool = Field(..., description="Whether ML model is loaded")
