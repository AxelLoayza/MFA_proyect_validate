"""
TFLite inference wrapper for the biometric signature LSTM model.
Training code has been intentionally removed from this module.
For one-time model export, run: python export_tflite.py
"""
import os
import logging
import numpy as np
from pathlib import Path
from typing import Optional, Tuple

# Suppress TF C++ log noise
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

try:
    import tflite_runtime.interpreter as _tflite_mod
    _Interpreter = _tflite_mod.Interpreter
    TFLITE_AVAILABLE = True
except ImportError:
    try:
        from tensorflow import lite as _tflite_mod
        _Interpreter = _tflite_mod.Interpreter
        TFLITE_AVAILABLE = True
    except ImportError:
        _Interpreter = None
        TFLITE_AVAILABLE = False

logger = logging.getLogger(__name__)


class LSTMBiometricModel:
    """
    Inference-only wrapper around the TFLite biometric LSTM model.
    Loads a .tflite artifact and exposes predict() for use in the
    validation pipeline.
    """

    def __init__(self, model_path: Optional[str] = None):
        """
        Args:
            model_path: Absolute or relative path to the .tflite model file.
        """
        if not TFLITE_AVAILABLE:
            raise ImportError(
                "TFLite runtime is not available. "
                "Install it: pip install tflite-runtime"
            )

        self.model_path = model_path
        self.interpreter = None
        self._input_details = None
        self._output_details = None

        if model_path:
            self.load_model(model_path)

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------

    def load_model(self, path: str) -> None:
        """
        Load a .tflite model file and allocate tensors.

        Args:
            path: Path to the .tflite file.
        """
        model_file = Path(path)

        if not model_file.exists():
            raise FileNotFoundError(f"TFLite model not found: {model_file}")

        if model_file.suffix != ".tflite":
            raise ValueError(
                f"Expected a .tflite file, got: {model_file.suffix}. "
                "Run export_tflite.py to convert the .h5 model."
            )

        self.interpreter = _Interpreter(model_path=str(model_file))
        self.interpreter.allocate_tensors()
        self._input_details = self.interpreter.get_input_details()
        self._output_details = self.interpreter.get_output_details()

        logger.info(
            f"TFLite model loaded: {model_file.name} | "
            f"input={self._input_details[0]['shape']} | "
            f"output={self._output_details[0]['shape']}"
        )

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Run inference on preprocessed signature feature arrays.

        Args:
            X: np.ndarray of shape (SEQ_LEN, N_FEATURES) or (1, SEQ_LEN, N_FEATURES).

        Returns:
            np.ndarray: Output tensor from the model, shape (output_dim,).
        """
        if self.interpreter is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        tensor = np.asarray(X, dtype=np.float32)

        # Ensure shape is (1, seq_len, features)
        if tensor.ndim == 2:
            tensor = np.expand_dims(tensor, axis=0)

        self.interpreter.set_tensor(self._input_details[0]["index"], tensor)
        self.interpreter.invoke()
        output = self.interpreter.get_tensor(self._output_details[0]["index"])

        return output[0]  # Return flat (output_dim,) vector

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def get_input_shape(self) -> Tuple:
        """Return the expected input shape reported by the TFLite model."""
        if self._input_details is None:
            raise RuntimeError("Model not loaded.")
        return tuple(self._input_details[0]["shape"])

    def get_output_shape(self) -> Tuple:
        """Return the output shape reported by the TFLite model."""
        if self._output_details is None:
            raise RuntimeError("Model not loaded.")
        return tuple(self._output_details[0]["shape"])
