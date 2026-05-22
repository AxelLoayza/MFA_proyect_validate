"""
LSTM Model for Signature Biometrics (copy placed in private/ml)
"""
# (This is a copy of the model used in src/app/ml/lstm_model.py for private deployment)
import numpy as np
import logging
from typing import Tuple, Optional
from pathlib import Path

try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers, models
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False

logger = logging.getLogger(__name__)


class LSTMBiometricModel:
    def __init__(self, model_path: Optional[str] = None, input_shape: Tuple[int, int] = (400, 8)):
        if not TENSORFLOW_AVAILABLE:
            raise ImportError("TensorFlow is required but not installed")
        self.model_path = model_path
        self.input_shape = input_shape
        self.model = None
        self.is_trained = False
        if model_path and Path(model_path).exists():
            self.load_model(model_path)
        else:
            self.build_model()
    
    def build_model(self):
        model = models.Sequential([
            layers.Input(shape=self.input_shape),
            layers.LSTM(64, return_sequences=True, name="lstm_1"),
            layers.Dropout(0.2),
            layers.LSTM(32, return_sequences=False, name="lstm_2"),
            layers.Dropout(0.2),
            layers.Dense(16, activation='relu', name="dense_1"),
            layers.Dropout(0.1),
            layers.Dense(1, activation='sigmoid', name="output")
        ])
        model.compile(optimizer=keras.optimizers.Adam(learning_rate=0.001), loss='binary_crossentropy', metrics=['accuracy'])
        self.model = model
        return model
    
    def train(self, X_train, y_train, epochs=10, batch_size=32, validation_split=0.2, verbose=1):
        history = self.model.fit(X_train, y_train, epochs=epochs, batch_size=batch_size, validation_split=validation_split, verbose=verbose)
        self.is_trained = True
        return history.history
    
    def predict(self, X):
        if len(X.shape) == 2:
            X = np.expand_dims(X, axis=0)
        predictions = self.model.predict(X, verbose=0)
        return predictions.flatten()
    
    def save_model(self, path: str):
        path = Path(path)
        path.parent.mkdir(exist_ok=True, parents=True)
        self.model.save(str(path))
    
    def load_model(self, path: str):
        path = Path(path)
        self.model = keras.models.load_model(str(path))
        self.is_trained = True
