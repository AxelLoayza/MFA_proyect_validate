"""
LSTM Model for Signature Biometrics
Validates signatures against master features
"""
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
    """
    LSTM-based model for biometric signature validation
    Compares test signature against master feature
    """
    
    def __init__(self, model_path: Optional[str] = None, input_shape: Tuple[int, int] = (400, 8)):
        """
        Initialize LSTM model
        
        Args:
            model_path: Path to saved model (optional)
            input_shape: Input shape (sequence_length, features)
        """
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
        """
        Build LSTM architecture for signature validation
        
        Architecture:
        - LSTM layer 1: 64 units, return sequences
        - LSTM layer 2: 32 units
        - Dense: 16 units
        - Output: 1 (similarity score 0-1)
        """
        logger.info(f"Building LSTM model with input shape {self.input_shape}")
        
        model = models.Sequential([
            # Input layer
            layers.Input(shape=self.input_shape),
            
            # LSTM layers
            layers.LSTM(64, return_sequences=True, name="lstm_1"),
            layers.Dropout(0.2),
            
            layers.LSTM(32, return_sequences=False, name="lstm_2"),
            layers.Dropout(0.2),
            
            # Dense layers
            layers.Dense(16, activation='relu', name="dense_1"),
            layers.Dropout(0.1),
            
            # Output: similarity score
            layers.Dense(1, activation='sigmoid', name="output")
        ])
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='binary_crossentropy',
            metrics=['accuracy', keras.metrics.AUC(name='auc')]
        )
        
        self.model = model
        logger.info("LSTM model built successfully")
        return model
    
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        epochs: int = 10,
        batch_size: int = 32,
        validation_split: float = 0.2,
        verbose: int = 1
    ) -> dict:
        """
        Train the model
        
        Args:
            X_train: Training data (N, 400, 8)
            y_train: Training labels (N,) - 0 or 1
            epochs: Number of epochs
            batch_size: Batch size
            validation_split: Validation split ratio
            verbose: Verbosity level
            
        Returns:
            dict: Training history
        """
        if self.model is None:
            self.build_model()
        
        logger.info(f"Training LSTM model: {len(X_train)} samples, {epochs} epochs")
        
        history = self.model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=validation_split,
            verbose=verbose
        )
        
        self.is_trained = True
        logger.info("Model training completed")
        
        return history.history
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predict signature validity
        
        Args:
            X: Input data (N, 400, 8) or (400, 8)
            
        Returns:
            np.ndarray: Prediction scores (0-1)
        """
        if self.model is None:
            raise RuntimeError("Model not built or loaded")
        
        # Handle single sample
        if len(X.shape) == 2:
            X = np.expand_dims(X, axis=0)
        
        predictions = self.model.predict(X, verbose=0)
        return predictions.flatten()
    
    def save_model(self, path: str):
        """
        Save model to disk
        
        Args:
            path: Save path
        """
        if self.model is None:
            raise RuntimeError("No model to save")
        
        path = Path(path)
        path.parent.mkdir(exist_ok=True, parents=True)
        
        self.model.save(str(path))
        logger.info(f"Model saved to {path}")
    
    def load_model(self, path: str):
        """
        Load model from disk
        
        Args:
            path: Model path
        """
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Model not found: {path}")
        
        self.model = keras.models.load_model(str(path))
        self.is_trained = True
        logger.info(f"Model loaded from {path}")
    
    def get_model_summary(self) -> str:
        """Get model architecture summary"""
        if self.model is None:
            return "Model not built"
        
        import io
        import sys
        
        buffer = io.StringIO()
        self.model.summary(print_fn=lambda x: buffer.write(x + '\n'))
        return buffer.getvalue()


# Global instance
_model: Optional[LSTMBiometricModel] = None


def init_model(model_path: Optional[str] = None) -> LSTMBiometricModel:
    """
    Initialize global model instance
    
    Args:
        model_path: Path to saved model
        
    Returns:
        LSTMBiometricModel instance
    """
    global _model
    _model = LSTMBiometricModel(model_path=model_path)
    return _model


def get_model() -> LSTMBiometricModel:
    """
    Get global model instance
    
    Returns:
        LSTMBiometricModel instance
        
    Raises:
        RuntimeError: If model not initialized
    """
    if _model is None:
        raise RuntimeError("Model not initialized. Call init_model() first.")
    return _model
