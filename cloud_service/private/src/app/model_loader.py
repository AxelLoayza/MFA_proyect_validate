import logging
import os
from pathlib import Path
from typing import Optional

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras.models import load_model
from tensorflow.keras.utils import custom_object_scope

logger = logging.getLogger(__name__)

_MODEL_INSTANCE = None


def generic_loss(y_true, y_pred):
    return tf.reduce_mean(tf.square(y_true - y_pred))


class NotEqual(tf.keras.layers.Layer):
    def call(self, inputs, y=0.0):
        return tf.not_equal(inputs, y)


class Any(tf.keras.layers.Layer):
    def __init__(self, axis=-1, keepdims=False, **kwargs):
        super().__init__(**kwargs)
        self.axis = axis
        self.keepdims = keepdims

    def call(self, inputs):
        return tf.reduce_any(inputs, axis=self.axis, keepdims=self.keepdims)

    def get_config(self):
        config = super().get_config()
        config.update(
            {
                "axis": self.axis,
                "keepdims": self.keepdims,
            }
        )
        return config


def build_mini_embedding_network():
    # Architecture aligned to embedding_network_mini.h5
    inputs = layers.Input(shape=(400, 4), name="signature_input")
    # Custom layer 'NotEqual' and 'Any' are defined in this module and
    # will be available via custom_objects when loading the model.
    x = NotEqual()(inputs, y=0.0)
    x = layers.Masking(mask_value=0.0, name="masking")(inputs)
    # First LSTM returns sequences
    x = layers.LSTM(64, return_sequences=True, name="lstm")(x)
    x = layers.Dropout(0.3, name="dropout")(x)
    # Second LSTM returns final state
    x = layers.LSTM(64, return_sequences=False, name="lstm_1")(x)
    x = layers.Dropout(0.3, name="dropout_1")(x)
    # Dense projection to 256 then L2-normalize
    x = layers.Dense(256, activation=None, name="dense")(x)
    outputs = layers.Lambda(lambda t: tf.nn.l2_normalize(t, axis=1), name="l2_normalize")(x)
    return keras.Model(inputs=inputs, outputs=outputs, name="signature_encoder")


def _resolve_model_path(model_path: Optional[str] = None) -> Path:
    if model_path:
        candidate = Path(model_path).expanduser()
        if candidate.exists():
            return candidate.resolve()

    env_model_path = os.getenv("MODEL_PATH")
    if env_model_path:
        candidate = Path(env_model_path).expanduser()
        if candidate.exists():
            return candidate.resolve()

    return (Path(__file__).resolve().parent / "Entrenamineto_LSTM" / "embedding_network_mini.h5").resolve()


def load_ml_model(model_path: Optional[str] = None):
    """
    Carga el modelo LSTM para inferencia.

    Estrategia:
    - Primero intenta cargar el .h5 como modelo completo.
    - Si falla, reconstruye la arquitectura y carga los pesos desde el mismo archivo.
    - Si el archivo no existe, retorna None.
    """
    resolved_model_path = _resolve_model_path(model_path)

    if not resolved_model_path.exists():
        logger.warning(
            f"LSTM model not found at '{resolved_model_path}'. "
            "Ensure the path is correct or mount the volume."
        )
        return None

    custom_objects = {
        "NotEqual": NotEqual,
        "Any": Any,
        "generic_loss": generic_loss,
    }

    try:
        with custom_object_scope(custom_objects):
            model = load_model(
                str(resolved_model_path),
                compile=False,
                safe_mode=False,
                custom_objects=custom_objects,
            )

        logger.info(f"✅ LSTM model loaded successfully from {resolved_model_path}")
        return model

    except Exception as load_error:
        logger.warning(
            f"Direct Keras load failed for '{resolved_model_path}' ({load_error}). "
            "Trying architecture rebuild + weights load."
        )

    try:
        model = build_mini_embedding_network()
        model.load_weights(str(resolved_model_path))
        logger.info(f"✅ LSTM weights loaded successfully from {resolved_model_path}")
        return model
    except Exception as weights_error:
        logger.error(
            f"❌ Failed to load LSTM model from '{resolved_model_path}': {weights_error}",
            exc_info=True,
        )
        return None


def compute_embedding(model, preprocessed_signature_tensor):
    """
    Given a tensor shape (400, 4), expands dim to (1, 400, 4) and predicts the embedding.
    """
    if model is None:
        raise ValueError("Siamese LSTM model is not loaded into memory.")

    input_tensor = tf.convert_to_tensor(preprocessed_signature_tensor, dtype=tf.float32)

    if len(input_tensor.shape) != 2:
        raise ValueError(f"Expected a 2D tensor with shape (400, 4), got {input_tensor.shape}")

    input_tensor = tf.expand_dims(input_tensor, axis=0)
    embedding = model.predict(input_tensor, verbose=0)

    return embedding[0]


def init_model(model_path: Optional[str] = None):
    global _MODEL_INSTANCE
    _MODEL_INSTANCE = load_ml_model(model_path=model_path)
    return _MODEL_INSTANCE


def get_model():
    if _MODEL_INSTANCE is None:
        raise RuntimeError("Model not initialized. Call init_model() first.")
    return _MODEL_INSTANCE