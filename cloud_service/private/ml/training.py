"""
Training utilities (copy placed in private/ml)
"""
import numpy as np

class SyntheticDataGenerator:
    @staticmethod
    def generate_signatures(n_samples=100, sequence_length=400, n_features=8, authentic_ratio=0.5):
        X = []
        y = []
        n_authentic = int(n_samples * authentic_ratio)
        base_pattern = SyntheticDataGenerator._generate_base_pattern(sequence_length, n_features)
        for i in range(n_authentic):
            noise = np.random.normal(0, 0.05, (sequence_length, n_features))
            signature = base_pattern + noise
            signature = np.clip(signature, -1, 1)
            X.append(signature)
            y.append(1)
        for i in range(n_samples - n_authentic):
            signature = np.random.uniform(-1, 1, (sequence_length, n_features))
            X.append(signature)
            y.append(0)
        X = np.array(X, dtype=np.float32)
        y = np.array(y, dtype=np.float32)
        shuffle_idx = np.random.permutation(len(X))
        return X[shuffle_idx], y[shuffle_idx]

    @staticmethod
    def _generate_base_pattern(sequence_length, n_features):
        t = np.linspace(0, 4*np.pi, sequence_length)
        pattern = np.zeros((sequence_length, n_features))
        for i in range(n_features):
            freq = 1 + i * 0.5
            phase = i * np.pi / n_features
            pattern[:, i] = 0.7 * np.sin(freq * t + phase) + 0.3 * np.sin(2*freq*t - phase)
        pattern = (pattern - pattern.mean()) / (pattern.std() + 1e-8)
        pattern = np.tanh(pattern)
        return pattern
