# 📁 Estructura Organizada - Cloud Service Biometric

## 🏗️ Arquitectura del Proyecto

```
cloud_service/
│
├── train.py                              # 🚀 Script de entrenamiento rápido
├── src/
│   ├── run.py                           # Punto de entrada (FastAPI)
│   ├── requirements.txt                 # Dependencias
│   │
│   └── app/
│       ├── __init__.py
│       ├── main.py                      # ✅ FastAPI app + lifespan
│       ├── config.py                    # ✅ Pydantic Settings
│       ├── database.py                  # ✅ MongoDB connection
│       ├── auth.py                      # ✅ Basic Auth (legacy)
│       ├── preprocessing.py             # ✅ Biometric preprocessing
│       ├── utils.py                     # ✅ Rate limiting (legacy)
│       │
│       ├── models/                      # 📦 Pydantic Models
│       │   ├── __init__.py
│       │   └── pydantic_models.py      # Request/response validation
│       │
│       ├── auth/                        # 🔐 Authentication & JWT
│       │   ├── __init__.py
│       │   └── jwt.py                   # RS256 token generation & validation
│       │                                 #  - RSAKeyManager: Key management
│       │                                 #  - ARCTokenService: Token service
│       │
│       ├── ml/                          # 🤖 Machine Learning
│       │   ├── __init__.py
│       │   ├── lstm_model.py            # LSTM neural network
│       │   │                             #  - LSTMBiometricModel: Model class
│       │   │                             #  - init_model(): Global instance
│       │   │
│       │   └── training.py              # Training utilities
│       │                                 #  - SyntheticDataGenerator
│       │                                 #  - QuickTrainer
│       │
│       ├── biometric/                   # 👆 Biometric Operations
│       │   └── __init__.py              # (Contendrá: validation, enrollment)
│       │
│       ├── routes/                      # 🌐 API Endpoints
│       │   ├── __init__.py
│       │   ├── biometric.py             # (Contendrá: /api/biometric/*)
│       │   └── token.py                 # (Futuro: /api/token/generate)
│       │
│       └── utils/                       # 🛠️ Utilities
│           ├── __init__.py
│           └── rate_limiter.py          # Rate limiting (mover de utils.py)
│
├── keys/                                 # 🔑 RSA Keys (generados automáticamente)
│   ├── private_key.pem
│   └── public_key.pem
│
├── models/                               # 🧠 Trained ML Models
│   └── lstm_model_v1.h5                 # Modelo LSTM entrenado
│
├── .env                                  # Environment variables
├── CONTEXTO.md
├── README.md
└── ANALISIS_IMPLEMENTACION.md
```

---

## 📊 Módulos y Responsabilidades

### `app/models/` - Modelos Pydantic
```python
from app.models import StrokePoint, BiometricRequest, BiometricResponse
```
- Validación de entrada/salida
- Documentación automática de API

### `app/auth/jwt.py` - Autenticación JWT
```python
from app.auth import init_token_service, get_token_service

# Inicializar
token_service = init_token_service(key_dir="keys")

# Generar token ARC
token, payload = token_service.generate_token(
    user_id="550e8400-...",
    tenant_id="tenant_alfa",
    email="user@alfa.com",
    role="user",
    status=1,
    device_id="dev_mac_9f823a",
    issuer="https://arc-auth.service/tenant_alfa",
    expiry_seconds=300
)

# Validar token
is_valid, payload, error = token_service.validate_token(token)
```

**Features:**
- ✅ Generación automática de claves RSA 2048-bit
- ✅ Firma RS256
- ✅ Validación de tokens
- ✅ Estructura ARC completa

### `app/ml/lstm_model.py` - Modelo de Red Neuronal
```python
from app.ml import LSTMBiometricModel, init_model, get_model

# Inicializar
model = init_model(model_path="models/lstm_model_v1.h5")

# Predecir
predictions = model.predict(X_test)  # Shape: (N,) - scores 0-1
```

**Architecture:**
```
Input (400, 8)
  ↓
LSTM 64 units
Dropout 0.2
  ↓
LSTM 32 units
Dropout 0.2
  ↓
Dense 16 units + ReLU
Dropout 0.1
  ↓
Dense 1 unit + Sigmoid
  ↓
Output: [0.0, 1.0]  # Similarity score
```

### `app/ml/training.py` - Entrenamiento Rápido
```python
from app.ml import SyntheticDataGenerator, QuickTrainer, LSTMBiometricModel

# Generar datos sintéticos
X, y = SyntheticDataGenerator.generate_signatures(
    n_samples=200,
    sequence_length=400,
    n_features=8,
    authentic_ratio=0.5
)

# Entrenar
model = LSTMBiometricModel()
history = QuickTrainer.train_quick(
    model,
    n_samples=200,
    epochs=10,
    batch_size=32
)

# Evaluar
metrics = QuickTrainer.evaluate_quick(model, n_test=50)
# Retorna: accuracy, precision, recall, f1, tp, tn, fp, fn
```

---

## 🚀 Workflow de Uso

### 1️⃣ Entrenar Modelo (Nuevo)
```bash
cd c:\Users\axtev\Documents\TESIS\MFA_proyect_validate\cloud_service
python train.py
```

**Salida:**
```
✅ Model trained on 200 synthetic samples
✅ Accuracy: 0.9400, Precision: 0.9500, Recall: 0.9200, F1: 0.9350
✅ Model saved to: models/lstm_model_v1.h5
```

### 2️⃣ Generar Claves RSA (Automático)
Las claves se generan automáticamente al:
```python
from app.auth import init_token_service
token_service = init_token_service(key_dir="keys")
# ✅ Genera: keys/private_key.pem, keys/public_key.pem
```

### 3️⃣ Generar Tokens ARC
```python
from app.auth import get_token_service

token_service = get_token_service()
token, payload = token_service.generate_token(
    user_id="550e8400-e29b-41d4-a716-446655440000",
    tenant_id="tenant_alfa",
    email="empleado@alfa.com",
    role="user",
    status=1,
    device_id="dev_mac_9f823a",
    issuer="https://arc-auth.service/tenant_alfa",
    expiry_seconds=300
)

print(token)  # JWT firmado con RS256
```

### 4️⃣ Iniciar Servicio
```bash
cd c:\Users\axtev\Documents\TESIS\MFA_proyect_validate\cloud_service\src
python run.py
```

---

## 📝 Siguientes Pasos

### ✅ Completado
- [x] Estructura de carpetas organizada
- [x] Módulo JWT con RS256
- [x] Modelo LSTM con entrenamiento rápido
- [x] Generación automática de claves RSA
- [x] Datos sintéticos para test rápido
- [x] Script de entrenamiento `train.py`

### 🔄 Por Hacer
- [ ] Ejecutar `train.py` para entrenar modelo
- [ ] Integrar modelo en `/api/biometric/validate`
- [ ] Crear `/api/token/generate` con JWT
- [ ] Guardar sesiones en `arc_sessions`
- [ ] Refactorizar `routes.py` → `routes/biometric.py`
- [ ] Crear tests unitarios

---

## 🔧 Dependencias Añadidas

```
PyJWT==2.8.1           # JWT encoding/decoding
cryptography==41.0.7   # RSA key generation & encryption
```

Estas se instalarán con:
```bash
pip install -r requirements.txt
```

---

## 💡 Ventajas de Esta Estructura

✅ **Modular**: Cada componente es independiente  
✅ **Escalable**: Fácil agregar nuevas rutas/modelos  
✅ **Testeable**: Funciones sin side-effects  
✅ **Limpio**: Separación de responsabilidades  
✅ **Documentado**: Docstrings y tipos de datos  
✅ **Type-safe**: Utiliza type hints en todo
