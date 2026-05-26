import os
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras.models import load_model
from tensorflow.keras.losses import cosine_similarity
from tensorflow.keras.utils import custom_object_scope
import logging

logger = logging.getLogger(__name__)

# Register the custom metric/loss used during training if any.
# Often contrastive loss is used. If there's an unknown loss, define it or use compile=False.
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
        config.update({"axis": self.axis, "keepdims": self.keepdims})
        return config


def build_mini_embedding_network():
    inputs = layers.Input(shape=(400, 4), name="signature")
    x = layers.Masking(mask_value=0.0)(inputs)
    x = layers.LSTM(128, return_sequences=True, dropout=0.3)(x)
    x = layers.LSTM(64, return_sequences=False, dropout=0.3)(x)
    x = layers.Dense(256, activation="relu", kernel_regularizer=keras.regularizers.l2(1e-4))(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(128, activation=None, kernel_regularizer=keras.regularizers.l2(1e-4))(x)
    outputs = layers.Lambda(lambda t: tf.nn.l2_normalize(t, axis=1), name="embedding")(x)
    return keras.Model(inputs=inputs, outputs=outputs, name="signature_encoder")

def load_ml_model():
    """
    Loads the trained LSTM Siamese Network model (Keras .h5 format)
    Ensure the path points to where `embedding_network_mini.h5` is stored.
    """
    from .config import settings
    model_path = os.getenv('MODEL_PATH', 'C:/Users/user/Downloads/LSTM/embedding_network_mini.h5')
    
    if not os.path.exists(model_path):
        logger.warning(f"LSTM Model not found at '{model_path}'. Ensure the path is correct or mount the volume.")
        return None
        
    try:
        # Load the model without compiling since we strictly use it for inference (predict)
        # safe_mode=False allows lambda/ops (like Masking's internal NotEqual) to load in Keras 3
        custom_objects = {
            "NotEqual": NotEqual,
            "Any": Any,
        }
        try:
            with custom_object_scope(custom_objects):
                model = load_model(
                    model_path,
                    compile=False,
                    safe_mode=False,
                    custom_objects=custom_objects
                )
        except Exception as load_error:
            logger.warning(f"Direct Keras load failed ({load_error}); rebuilding mini architecture and loading weights.")
            model = build_mini_embedding_network()
            model.load_weights(model_path)
        logger.info(f"✅ LSTM Keras Model loaded successfully from {model_path}!")
        return model
    except Exception as e:
        logger.error(f"❌ Failed to load LSTM model: {str(e)}")
        return None

def compute_embedding(model, preprocessed_signature_tensor):
    """
    Given a tensor shape (400, 4), expands dim to (1, 400, 4) and predicts the embedding.
    """
    if model is None:
        raise ValueError("Siamese LSTM Model is not loaded into memory.")
        
    # Tensorflow expects a batch dimension: (batch, time_steps, features)
    input_tensor = tf.expand_dims(preprocessed_signature_tensor, axis=0) # shape (1, 400, 4)
    # Predict to get embedding (usually 128 elements)
    embedding = model.predict(input_tensor, verbose=0)
    
    return embedding[0] # Return the flat (128,) vector
