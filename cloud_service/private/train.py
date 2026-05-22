"""
Quick Training Script
Trains LSTM model on synthetic data (rápido y evaluable)
Run: python train.py
"""
import sys
import os
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

import logging
from app.ml import LSTMBiometricModel, QuickTrainer, SyntheticDataGenerator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    """Train LSTM model on synthetic data"""
    
    logger.info("=" * 80)
    logger.info("QUICK TRAINING - LSTM Biometric Model")
    logger.info("=" * 80)
    
    try:
        # Create models directory
        models_dir = Path("models")
        models_dir.mkdir(exist_ok=True)
        
        # Initialize model
        logger.info("\n1. Initializing LSTM model...")
        model = LSTMBiometricModel()
        print("\nModel Architecture:")
        print(model.get_model_summary())
        
        # Quick training
        logger.info("\n2. Training on synthetic data...")
        history = QuickTrainer.train_quick(
            model,
            n_samples=200,      # Small dataset for quick training
            epochs=10,          # Few epochs for speed
            batch_size=32
        )
        
        # Evaluate
        logger.info("\n3. Evaluating model...")
        metrics = QuickTrainer.evaluate_quick(model, n_test=50)
        
        print("\n" + "=" * 80)
        print("EVALUATION RESULTS")
        print("=" * 80)
        for key, value in metrics.items():
            print(f"  {key:15s}: {value:.4f}" if isinstance(value, float) else f"  {key:15s}: {value}")
        
        # Save model
        model_path = models_dir / "lstm_model_v1.h5"
        logger.info(f"\n4. Saving model to {model_path}...")
        model.save_model(str(model_path))
        
        print("\n" + "=" * 80)
        print("✅ TRAINING COMPLETED SUCCESSFULLY")
        print(f"Model saved to: {model_path}")
        print("=" * 80 + "\n")
        
        return 0
        
    except Exception as e:
        logger.error(f"Training failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
