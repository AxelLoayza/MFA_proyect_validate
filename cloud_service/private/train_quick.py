"""
Quick LSTM training script for development/testing.

Usage:
  python train_quick.py --data-dir PATH_TO_Task2_Preprocesado --epochs 5

This script trains a small classifier on a subset of the preprocessed dataset
to produce a lightweight model useful for smoke-testing the login/ARC flow.
It does NOT implement the full triplet-loss pipeline used in production.
"""
import os
import argparse
import numpy as np
import pathlib

def find_data_dir(candidates):
    for p in candidates:
        if os.path.isdir(p):
            files = ['X_features.npy','Y_user.npy']
            if all(os.path.exists(os.path.join(p,f)) for f in files):
                return p
    return None

def build_model(timesteps, features, n_classes):
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Masking, LSTM, Dropout, Dense

    model = Sequential([
        Masking(mask_value=0., input_shape=(timesteps, features)),
        LSTM(64, return_sequences=True),
        Dropout(0.3),
        LSTM(64, return_sequences=False),
        Dropout(0.3),
        Dense(256, activation='relu'),
        Dense(n_classes, activation='softmax')
    ])
    model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])
    return model

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', default=None)
    parser.add_argument('--epochs', type=int, default=5)
    parser.add_argument('--subset', type=int, default=400)
    args = parser.parse_args()

    cwd = pathlib.Path(__file__).parent
    candidates = [
        args.data_dir or '',
        os.path.join(os.getcwd(), 'Task2_Preprocesado'),
        os.path.join(str(cwd), 'Task2_Preprocesado'),
        os.path.join(str(cwd.parent), 'Task2_Preprocesado'),
    ]

    data_dir = find_data_dir(candidates)
    if not data_dir:
        print('No se encontró Task2_Preprocesado con X_features.npy/Y_user.npy. Pasa --data-dir')
        return

    print(f'Usando datos en: {data_dir}')
    X = np.load(os.path.join(data_dir, 'X_features.npy'))
    Y = np.load(os.path.join(data_dir, 'Y_user.npy'))

    # Basic shapes: (N, timesteps, features)
    N, T, F = X.shape
    n_classes = int(Y.max()) + 1

    take = min(args.subset, N)
    X = X[:take]
    Y = Y[:take]

    # Normalize X (simple min-max per feature)
    X = X.astype('float32')
    for i in range(F):
        col = X[:,:,i]
        minv = col.min()
        maxv = col.max()
        if maxv > minv:
            X[:,:,i] = (col - minv) / (maxv - minv)

    model = build_model(T, F, n_classes)
    print(model.summary())

    model.fit(X, Y, epochs=args.epochs, batch_size=32, validation_split=0.1)

    out_dir = cwd / 'models'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'lstm_quick.h5'
    model.save(str(out_path))
    print(f'Modelo guardado en {out_path}')

if __name__ == '__main__':
    main()
