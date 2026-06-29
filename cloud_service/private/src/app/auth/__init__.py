"""
Auth package - compatibility loader for the legacy auth.py and jwt_service.py modules.
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


_legacy_auth = _load_legacy_module("auth_legacy", "auth.py")
_legacy_jwt = _load_legacy_module("jwt_service_legacy", "jwt_service.py")

verify_credentials = _legacy_auth.verify_credentials
get_auth_header = _legacy_auth.get_auth_header

RSAKeyManager = _legacy_jwt.RSAKeyManager
ARCTokenService = _legacy_jwt.ARCTokenService
init_token_service = _legacy_jwt.init_token_service
get_token_service = _legacy_jwt.get_token_service

__all__ = [
    "verify_credentials",
    "get_auth_header",
    "RSAKeyManager",
    "ARCTokenService",
    "init_token_service",
    "get_token_service",
]
