# Entrenamiento rápido LSTM (desarrollo)

Este README explica cómo correr un entrenamiento ligero para probar la integración de validación biométrica.

Requisitos mínimos:
- Python 3.8+
- `tensorflow`, `numpy`

Instalación (ejemplo):
```bash
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install --upgrade pip
pip install tensorflow numpy
```

Ejecutar entrenamiento rápido:
```bash
python train_quick.py --data-dir PATH/TO/Task2_Preprocesado --epochs 5 --subset 400
```

Salida:
- `cloud_service/private/models/lstm_quick.h5` — modelo de prueba guardado.

Notas:
- Este script entrena un clasificador softmax (por usuario) en vez de la arquitectura de triplet-loss usada en producción. Es suficiente para pruebas rápidas y smoke tests.
- Si no tienes los archivos `X_features.npy` y `Y_user.npy`, copia la carpeta `Task2_Preprocesado` al lugar indicado o pasa su path con `--data-dir`.
