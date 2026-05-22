"""
Quick Training Script for LSTM Model
Generates synthetic data and trains the model rapidly
"""
import numpy as np
import logging
from typing import Tuple
from datetime import datetime

try:
    import tensorflow as tf
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False

logger = logging.getLogger(__name__)


class SyntheticDataGenerator:
    """
    Generates synthetic biometric signature data for quick training
    """
    
    @staticmethod
    def generate_signatures(
        n_samples: int = 100,
        sequence_length: int = 400,
        n_features: int = 8,
        authentic_ratio: float = 0.5
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate synthetic signature data
        
        Args:
            n_samples: Number of samples to generate
            sequence_length: Length of each sequence (default: 400)
            n_features: Number of features per point (default: 8)
            authentic_ratio: Ratio of authentic vs forged (0.5 = 50% each)
            
        Returns:
            Tuple[X, y]: (signatures, labels)
                - X: Shape (n_samples, sequence_length, n_features)
                - y: Binary labels (1=authentic, 0=forged)
        """
        X = []
        y = []
        
        n_authentic = int(n_samples * authentic_ratio)
        n_forged = n_samples - n_authentic
        
        logger.info(f"Generating {n_samples} synthetic signatures: {n_authentic} authentic, {n_forged} forged")
        
        # Generate authentic signatures (similar pattern with variation)
        base_pattern = SyntheticDataGenerator._generate_base_pattern(sequence_length, n_features)
        
        for i in range(n_authentic):
            # Authentic: base pattern + small noise
            noise = np.random.normal(0, 0.05, (sequence_length, n_features))
            signature = base_pattern + noise
            signature = np.clip(signature, -1, 1)  # Clip to valid range
            X.append(signature)
            y.append(1)
        
        # Generate forged signatures (random patterns)
        for i in range(n_forged):
            # Forged: random pattern
            signature = np.random.uniform(-1, 1, (sequence_length, n_features))
            X.append(signature)
            y.append(0)
        
        X = np.array(X, dtype=np.float32)
        y = np.array(y, dtype=np.float32)
        
        # Shuffle
        shuffle_idx = np.random.permutation(len(X))
        X = X[shuffle_idx]
        y = y[shuffle_idx]
        
        logger.info(f"Generated data shape: X={X.shape}, y={y.shape}")
        
        return X, y
    
    @staticmethod
    def _generate_base_pattern(sequence_length: int, n_features: int) -> np.ndarray:
        """
        Generate a base signature pattern (represents an authentic user's style)
        """
        # Create smooth curves using sine waves (simulates real signature)
        t = np.linspace(0, 4*np.pi, sequence_length)
        
        pattern = np.zeros((sequence_length, n_features))
        
        for i in range(n_features):
            # Each feature is a combination of sine waves with different frequencies
            freq = 1 + i * 0.5
            phase = i * np.pi / n_features
            pattern[:, i] = 0.7 * np.sin(freq * t + phase) + 0.3 * np.sin(2*freq*t - phase)
        
        # Normalize
        pattern = (pattern - pattern.mean()) / (pattern.std() + 1e-8)
        pattern = np.tanh(pattern)  # Clip to [-1, 1]
        
        return pattern


class QuickTrainer:
    """
    Quick training utility for LSTM model
    Trains on synthetic data for rapid validation
    """
    
    @staticmethod
    def train_quick(
        model,
        n_samples: int = 200,
        epochs: int = 10,
        batch_size: int = 32
    ) -> dict:
        """
        Train model on synthetic data quickly
        
        Args:
            model: LSTMBiometricModel instance
            n_samples: Number of synthetic samples
            epochs: Number of training epochs
            batch_size: Batch size
            
        Returns:
            dict: Training history
        """
        logger.info(f"Starting quick training: {n_samples} samples, {epochs} epochs")
        start_time = datetime.now()
        
        # Generate synthetic data
        X, y = SyntheticDataGenerator.generate_signatures(
            n_samples=n_samples,
            sequence_length=400,
            n_features=8,
            authentic_ratio=0.5
        )
        
        # Train
        history = model.train(
            X, y,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.2,
            verbose=1
        )
        
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"Training completed in {elapsed:.2f}s")
        
        return history
    
    @staticmethod
    def evaluate_quick(model, n_test: int = 50) -> dict:
        """
        Evaluate model on synthetic test data
        
        Args:
            model: LSTMBiometricModel instance
            n_test: Number of test samples
            
        Returns:
            dict: Evaluation metrics
        """
        logger.info(f"Evaluating model on {n_test} test samples")
        
        # Generate test data
        X_test, y_test = SyntheticDataGenerator.generate_signatures(
            n_samples=n_test,
            sequence_length=400,
            n_features=8,
            authentic_ratio=0.5
        )
        
        # Evaluate
        predictions = model.predict(X_test)
        
        # Compute metrics
        predicted_labels = (predictions > 0.5).astype(int)
        accuracy = np.mean(predicted_labels == y_test)
        
        # True positives, false positives, etc.
        tp = np.sum((predicted_labels == 1) & (y_test == 1))
        tn = np.sum((predicted_labels == 0) & (y_test == 0))
        fp = np.sum((predicted_labels == 1) & (y_test == 0))
        fn = np.sum((predicted_labels == 0) & (y_test == 1))
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        
        metrics = {
            "accuracy": float(accuracy),
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "tp": int(tp),
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn)
        }
        
        logger.info(f"Evaluation results: Accuracy={accuracy:.4f}, Precision={precision:.4f}, Recall={recall:.4f}, F1={f1:.4f}")
        
        return metrics
