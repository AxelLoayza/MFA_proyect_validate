"""
Utils package - compatibility loader for the legacy utils.py module.
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


_legacy = _load_legacy_module("utils_legacy", "utils.py")

RateLimiter = _legacy.RateLimiter
get_client_ip = _legacy.get_client_ip
validate_stroke_points = _legacy.validate_stroke_points
apply_linear_interpolation_padding = _legacy.apply_linear_interpolation_padding
calculate_basic_features = _legacy.calculate_basic_features

__all__ = [
	"RateLimiter",
	"get_client_ip",
	"validate_stroke_points",
	"apply_linear_interpolation_padding",
	"calculate_basic_features",
]
