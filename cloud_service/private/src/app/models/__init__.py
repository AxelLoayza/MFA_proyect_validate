"""
Models package - compatibility loader for the legacy models.py module.
"""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


def _load_legacy_module(module_name: str, filename: str):
    module_path = Path(__file__).resolve().parents[1] / filename
    spec = spec_from_file_location(f"{__name__}.{module_name}", module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load legacy module: {filename}")

    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_legacy = _load_legacy_module("models_legacy", "models.py")

StrokePoint = _legacy.StrokePoint
BiometricFeatures = _legacy.BiometricFeatures
BiometricRequest = _legacy.BiometricRequest
BiometricResponse = _legacy.BiometricResponse
EnrollmentCloudRequest = _legacy.EnrollmentCloudRequest
MasterFeatureResponse = _legacy.MasterFeatureResponse
HealthResponse = _legacy.HealthResponse

__all__ = [
    "StrokePoint",
    "BiometricFeatures",
    "BiometricRequest",
    "BiometricResponse",
    "EnrollmentCloudRequest",
    "MasterFeatureResponse",
    "HealthResponse",
]
