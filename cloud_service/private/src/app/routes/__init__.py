"""
Routes package - compatibility loader for the legacy routes.py module.
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


_legacy = _load_legacy_module("routes_legacy", "routes.py")

router = _legacy.router

__all__ = ["router"]
