"""
ML package - Machine Learning models and training
"""
from .lstm_model import (
    LSTMBiometricModel,
    init_model,
    get_model,
    TENSORFLOW_AVAILABLE
)
from .training import SyntheticDataGenerator, QuickTrainer

__all__ = [
    "LSTMBiometricModel",
    "init_model",
    "get_model",
    "TENSORFLOW_AVAILABLE",
    "SyntheticDataGenerator",
    "QuickTrainer"
]
