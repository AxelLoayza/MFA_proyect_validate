"""
One-time export script: converts embedding_network_mini.h5 → embedding_network_mini.tflite

Run ONCE from cloud_service/private/ with the ml venv active:
    ..\ml\Scripts\python.exe export_tflite.py

The resulting .tflite file is the production artifact.
Set MODEL_PATH in .env to point to the generated .tflite path.

Architecture read from the saved .h5:
    Input(400, 4) → Masking → LSTM(64, return_seq=True) → Dropout →
    LSTM(64) → Dropout → Dense(256) → Lambda(l2_normalize)  →  output(256,)
"""
import sys
import os
import pathlib

# ---- locate h5 ---------------------------------------------------------------
DEFAULT_H5 = pathlib.Path(__file__).parent / "src" / "app" / "Entrenamineto_LSTM" / "embedding_network_mini.h5"
h5_path = pathlib.Path(os.getenv("H5_PATH", str(DEFAULT_H5)))

if not h5_path.exists():
    print(f"ERROR: H5 model not found at '{h5_path}'")
    print("       Set the H5_PATH env var to point to the correct .h5 file.")
    sys.exit(1)

out_path = h5_path.with_suffix(".tflite")

# ---- load weights directly from h5py (bypasses Keras deserialization issues) --
print(f"Reading weights from: {h5_path}")
import h5py
import numpy as np

with h5py.File(h5_path, "r") as f:
    mw = f["model_weights"]
    lstm_kernel      = mw["lstm"]["lstm"]["lstm_cell"]["kernel"][:]
    lstm_rec_kernel  = mw["lstm"]["lstm"]["lstm_cell"]["recurrent_kernel"][:]
    lstm_bias        = mw["lstm"]["lstm"]["lstm_cell"]["bias"][:]
    lstm1_kernel     = mw["lstm_1"]["lstm_1"]["lstm_cell"]["kernel"][:]
    lstm1_rec_kernel = mw["lstm_1"]["lstm_1"]["lstm_cell"]["recurrent_kernel"][:]
    lstm1_bias       = mw["lstm_1"]["lstm_1"]["lstm_cell"]["bias"][:]
    dense_kernel     = mw["dense"]["dense"]["kernel"][:]
    dense_bias       = mw["dense"]["dense"]["bias"][:]

print(f"  LSTM1  kernel={lstm_kernel.shape} rec={lstm_rec_kernel.shape}")
print(f"  LSTM2  kernel={lstm1_kernel.shape} rec={lstm1_rec_kernel.shape}")
print(f"  Dense  kernel={dense_kernel.shape}")

# ---- rebuild model in Keras --------------------------------------------------
print("\nRebuilding model in Keras...")
import tensorflow as tf

input_features = lstm_kernel.shape[0]    # 4
lstm_units      = lstm_kernel.shape[1] // 4  # 64
lstm2_units     = lstm1_kernel.shape[1] // 4  # 64
dense_units     = dense_kernel.shape[1]      # 256

inputs = tf.keras.Input(batch_shape=(1, 400, input_features), name="signature_input")
x = tf.keras.layers.Masking(mask_value=0.0)(inputs)
x = tf.keras.layers.LSTM(lstm_units, return_sequences=True, unroll=True, name="lstm")(x)
x = tf.keras.layers.Dropout(0.0)(x)   # dropout=0 at inference
x = tf.keras.layers.LSTM(lstm2_units, return_sequences=False, unroll=True, name="lstm_1")(x)
x = tf.keras.layers.Dropout(0.0)(x)
x = tf.keras.layers.Dense(dense_units, activation=None, name="dense")(x)
outputs = tf.keras.layers.Lambda(
    lambda t: tf.nn.l2_normalize(t, axis=1), name="l2_normalize"
)(x)

model = tf.keras.Model(inputs=inputs, outputs=outputs, name="signature_encoder")

# ---- set weights by name ----------------------------------------------------
print("Setting weights...")
model.get_layer("lstm").set_weights([lstm_kernel, lstm_rec_kernel, lstm_bias])
model.get_layer("lstm_1").set_weights([lstm1_kernel, lstm1_rec_kernel, lstm1_bias])
model.get_layer("dense").set_weights([dense_kernel, dense_bias])

print(f"  Input  : {model.input_shape}")
print(f"  Output : {model.output_shape}")
print(f"  Params : {model.count_params():,}")

# ---- convert -----------------------------------------------------------------
print("\nConverting to TFLite...")
try:
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    # Keep a fully static graph so the TFLite runtime can load it without Flex ops.
    converter.optimizations = []
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS]
    tflite_model = converter.convert()
except Exception as e:
    print(f"ERROR during conversion: {e}")
    sys.exit(1)

# ---- save --------------------------------------------------------------------
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_bytes(tflite_model)
print(f"\nOK  TFLite model saved to: {out_path}")
print(f"    Size: {len(tflite_model) / 1024:.1f} KB")
print(f"\nNext: set MODEL_PATH=./app/Entrenamineto_LSTM/embedding_network_mini.tflite in your .env")
