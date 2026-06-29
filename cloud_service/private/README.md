# Cloud Service - Biometric Validation Service

## Descripción

Servicio en la nube para validación de firmas biométricas usando LSTM. Recibe datos normalizados desde `apiContainer`, aplica validaciones adicionales, padding si es necesario, y procesa la firma con un modelo de Machine Learning.

## Características

✅ **Autenticación**: Basic Auth con comparación constant-time
✅ **Rate Limiting**: 20 requests por minuto por IP
✅ **Validación**: Valida estructura y rango de puntos (100-1200)
✅ **Padding**: Aplica interpolación lineal si < 100 puntos
✅ **TLS/HTTPS**: Soporte para certificados (opcional en desarrollo)
✅ **Logging**: Registro detallado de operaciones

## Estructura del Proyecto

```
cloud_service/
├── .env                    # Configuración del servicio
├── src/
│   ├── requirements.txt    # Dependencias Python
│   └── app/
│       ├── __init__.py
│       ├── main.py         # Aplicación FastAPI principal
│       ├── routes.py       # Endpoints de la API
│       ├── models.py       # Modelos Pydantic
│       ├── auth.py         # Autenticación Basic Auth
│       └── utils.py        # Utilidades (rate limiting, padding)
├── certs/                  # Certificados TLS (generados)
├── models/                 # Modelos ML (por implementar)
├── data/                   # Datos de entrenamiento
├── start_server.ps1        # Script de inicio (PowerShell)
└── generate_certs_v2.ps1   # Generador de certificados
```

## Instalación

### 1. Activar el entorno virtual

```powershell
cd c:\Users\USER\Documents\PRETESIS\MFA_proyect_validate
.\bmcloud\Scripts\activate
```

### 2. Instalar dependencias

```powershell
cd cloud_service
pip install -r src/requirements.txt
```

### 3. Configurar variables de entorno

Edita el archivo `.env` y configura las credenciales:

```env
# IMPORTANTE: Estos valores deben coincidir con apiContainer
ML_SERVICE_USERNAME=bmfa_user
ML_SERVICE_PASSWORD=your_secure_password_here
PUBLIC_GATEWAY_URL=http://localhost:4003
```

## Despliegue simple en AWS

### Topología mínima recomendada

- `public/backend` en subred pública o detrás de un ALB.
- `private` en subred privada.
- `public/backend` llama a `private` por `SDK_URL`.
- `private` no necesita exponer credenciales públicas; solo Basic Auth interna.

### Variables mínimas para `private`

```env
API_PORT=9000
API_HOST=0.0.0.0
PUBLIC_GATEWAY_URL=http://<public-host-or-dns>:4003
TLS_ENABLED=false
ML_SERVICE_USERNAME=bmfa_user
ML_SERVICE_PASSWORD=una_clave_larga_y_unica
MONGO_URI=mongodb://<host>
MONGO_DB_NAME=biometric_service
RATE_LIMIT_REQUESTS=20
RATE_LIMIT_WINDOW_SECONDS=60
MAX_REQUEST_SIZE=102400
MODEL_PATH=./models/lstm_signature_model.keras
MODEL_VERSION=lstm_v1
ENVIRONMENT=production
LOG_LEVEL=INFO
```

### Variables mínimas para `public/backend`

```env
SDK_URL=http://<private-internal-ip-o-dns>:9000
ML_SERVICE_USERNAME=bmfa_user
ML_SERVICE_PASSWORD=una_clave_larga_y_unica
PORT=4000
```

### Reglas de red

- Abrir `4000/tcp` solo para el frontend o balanceador que consuma `public/backend`.
- Abrir `9000/tcp` solo desde la subred pública / SG de `public/backend` hacia `private`.
- Si usas Nginx/ALB con TLS, puedes dejar `TLS_ENABLED=false` dentro de `private`.

### Orden de arranque

1. Levanta MongoDB.
2. Levanta `private`.
3. Levanta `public/backend` apuntando a `SDK_URL`.
4. Levanta el cliente.

### 4. (Opcional) Generar certificados TLS

Para desarrollo, se recomienda usar HTTP (`TLS_ENABLED=false`).

Si necesitas HTTPS:

```powershell
.\generate_certs_v2.ps1
```

## Uso

### Iniciar el servidor

**Opción 1: Script de PowerShell** (Recomendado)

```powershell
.\start_server.ps1
```

**Opción 2: Python directo**

```powershell
bmcloud\Scripts\activate
cd src
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Opción 3: Ejecutar main.py**

```powershell
bmcloud\Scripts\activate
python src/app/main.py
```

El servidor estará disponible en: **http://localhost:8000**

## Endpoints

### 1. Health Check

```http
GET /health
```

**Respuesta:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "model_loaded": false
}
```

### 2. Validar Firma Biométrica

```http
POST /api/biometric/validate
Authorization: Basic Ym1mYV91c2VyOnlvdXJfc2VjdXJlX3Bhc3N3b3JkX2hlcmU=
Content-Type: application/json

{
  "normalized_stroke": [
    {
      "x": 100.5,
      "y": 150.3,
      "t": 0,
      "p": 0.75
    },
    ...
  ],
  "features": {
    "num_points": 100,
    "total_distance": 450.32,
    "velocity_mean": 2.54,
    "velocity_max": 5.82,
    "duration_ms": 1500
  }
}
```

**Respuesta exitosa (200):**
```json
{
  "is_valid": true,
  "confidence": 0.87,
  "user_id": "673636 9b910e1d313235ba06",
  "message": "Firma válida con 87% de confianza",
  "details": {
    "model_version": "lstm_v2.1_mock",
    "processing_time_ms": 45,
    "features_analyzed": ["velocity_mean", "velocity_max", "total_distance", "pressure_variation"],
    "matched_user": "usuario@example.com",
    "num_points_processed": 100,
    "padding_applied": false
  }
}
```

**Errores comunes:**

- **400**: Datos inválidos (puntos fuera de rango 100-1200)
- **401**: Credenciales incorrectas
- **429**: Rate limit excedido (max 20 req/min)
- **413**: Payload demasiado grande (max 100 KB)
- **500**: Error interno del servidor

## Configuración

### Variables de Entorno (.env)

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| `API_PORT` | 8000 | Puerto del servidor |
| `PUBLIC_GATEWAY_URL` | http://localhost:4003 | URL del gateway publico |
| `ML_SERVICE_USERNAME` | bmfa_user | Usuario para Basic Auth |
| `ML_SERVICE_PASSWORD` | your_secure_password_here | Contraseña para Basic Auth |
| `RATE_LIMIT_REQUESTS` | 20 | Requests máximos por minuto |
| `MAX_REQUEST_SIZE` | 102400 | Tamaño máximo de request (bytes - 100 KB) |
| `MIN_STROKE_POINTS` | 100 | Mínimo de puntos después de padding |
| `MAX_STROKE_POINTS` | 1200 | Máximo de puntos permitidos |
| `TLS_ENABLED` | false | Habilitar HTTPS (true/false) |
| `MODEL_PATH` | ./models/lstm_signature_model.keras | Ruta del modelo LSTM |

### Seguridad

#### Autenticación

El servicio usa **HTTP Basic Authentication**:

- Username y password deben coincidir con `apiContainer`
- Comparación constant-time con `secrets.compare_digest()`
- Header: `Authorization: Basic base64(username:password)`

**Generar header de autenticación:**

```python
import base64
credentials = f"{username}:{password}"
encoded = base64.b64encode(credentials.encode()).decode()
header = f"Basic {encoded}"
```

#### Rate Limiting

- **Límite**: 20 requests por minuto por IP
- **Ventana**: 60 segundos (sliding window)
- **Identificación**: Por IP del cliente (considera X-Forwarded-For)
- **Respuesta**: HTTP 429 cuando se excede

#### Límites de Tamaño

- **Request body**: 100 KB máximo (102,400 bytes)
- **Puntos en firma**: 100-1200 puntos
- **Respuesta**: HTTP 413 si se excede

## Validación y Padding

### Validación de Puntos

El servicio valida que cada punto tenga:

- `x`: Coordenada X (float)
- `y`: Coordenada Y (float)
- `t`: Timestamp en ms (int ≥ 0)
- `p`: Presión (float 0.0-1.0)

### Padding Lineal

Si la firma tiene **menos de 100 puntos**, se aplica **interpolación lineal**:

```
Entrada: 50 puntos
Proceso: Interpola 50 puntos adicionales entre los existentes
Salida: 100 puntos normalizados
```

**Fórmula de interpolación:**
```
x_nuevo = x1 + (x2 - x1) * t
y_nuevo = y1 + (y2 - y1) * t
t_nuevo = t1 + (t2 - t1) * t
p_nuevo = p1 + (p2 - p1) * t
```

Donde `t` es el ratio de interpolación (0.0 a 1.0).

## Integración con apiContainer

### Flujo de Comunicación

1. **apiContainer** normaliza los datos de Flutter
2. **apiContainer** envía POST a `https://your-ml-service.com/api/biometric/validate`
3. **cloud_service** valida credenciales (Basic Auth)
4. **cloud_service** verifica rate limit (20 req/min)
5. **cloud_service** valida estructura y puntos
6. **cloud_service** aplica padding si es necesario
7. **cloud_service** procesa con modelo LSTM (por implementar)
8. **cloud_service** retorna respuesta con `is_valid` y `confidence`
9. **apiContainer** reenvía respuesta a Flutter

### Configuración en apiContainer

En `apiContainer/.env`:

```env
CLOUD_PROVIDER_ENDPOINT=http://localhost:8000/api/biometric/validate
CLOUD_PROVIDER_USERNAME=bmfa_user
CLOUD_PROVIDER_PASSWORD=your_secure_password_here
CLOUD_PROVIDER_VERIFY_SSL=false
```

**IMPORTANTE**: `CLOUD_PROVIDER_USERNAME` y `CLOUD_PROVIDER_PASSWORD` deben coincidir con `ML_SERVICE_USERNAME` y `ML_SERVICE_PASSWORD` en `cloud_service/.env`.

## Testing

Servicio en la nube para validación y enrolamiento de firmas biométricas usando LSTM y DTW medoid. Recibe datos normalizados desde `apiContainer` para login, y firmas crudas para enrolamiento.

```bash
# Health check
curl http://localhost:8000/health

# Validación con autenticación
✅ **Login**: Resampling, suavizado, features avanzadas, normalización y máscara
✅ **Enrolamiento**: DTW medoid sobre firmas crudas, sin suavizado ni features extra
curl -X POST http://localhost:8000/api/biometric/validate \
  -H "Authorization: Basic Ym1mYV91c2VyOnlvdXJfc2VjdXJlX3Bhc3N3b3JkX2hlcmU=" \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

1. El backend del cliente recopila varias firmas de registro.
2. `apiContainer` valida tamaño y estructura fija, y envía las firmas crudas.
3. El cloud service selecciona el DTW medoid como template representativo.
4. No se suavizan coordenadas ni se extraen features extra en esta fase.

El servicio privado aplica preprocesamiento biométrico adicional para login:
username = "bmfa_user"
password = "your_secure_password_here"
credentials = f"{username}:{password}"

Para enrolamiento:

- Valida tamaño y estructura del JSON.
- Conserva la firma original.
- Calcula DTW medoid sobre las trayectorias crudas.
- No usa suavizado, features avanzadas ni máscara como parte del template.
encoded = base64.b64encode(credentials.encode()).decode()

# Request
headers = {
    "Authorization": f"Basic {encoded}",
    "Content-Type": "application/json"
}

payload = {
    "normalized_stroke": [
        {"x": 100.5, "y": 150.3, "t": 0, "p": 0.75},
        # ... 100-1200 puntos
    ],
    "features": {
        "num_points": 100,
        "total_distance": 450.32,
        "velocity_mean": 2.54,
        "velocity_max": 5.82,
        "duration_ms": 1500
    }
}

response = requests.post(
    "http://localhost:8000/api/biometric/validate",
    headers=headers,
    json=payload
)

print(response.json())
```

## Estado Actual

### ✅ Implementado

- Estructura de archivos completa
- Endpoints `/health` y `/api/biometric/validate`
- Autenticación Basic Auth
- Rate limiting (20 req/min)
- Validación de datos (Pydantic)
- Padding con interpolación lineal
- Límites de tamaño de request
- Logging detallado
- Soporte TLS/HTTPS (opcional)

### 🚧 Pendiente

- **Modelo LSTM**: Entrenar y cargar modelo de TensorFlow
- **Base de datos**: Integración con MongoDB para almacenar firmas
- **Métricas**: Dashboard de monitoreo
- **Tests unitarios**: Suite de pruebas automatizadas
- **Docker**: Containerización del servicio

## Desarrollo Futuro

### Prioridad 1: Modelo LSTM

```python
# src/app/ml_model.py
import tensorflow as tf
from tensorflow import keras

def load_lstm_model(model_path):
    """Load trained LSTM model"""
    model = keras.models.load_model(model_path)
    return model

def predict_signature(model, stroke_points, features):
    """Predict if signature is valid"""
    # Preparar datos para LSTM
    # Formato: (batch_size, sequence_length, features)
    # ...
    prediction = model.predict(data)
    return prediction
```

### Prioridad 2: MongoDB Integration

```python
# src/app/database.py
from pymongo import MongoClient

def save_signature(user_id, stroke_data, is_valid, confidence):
    """Save signature to database"""
    # ...
```

## Troubleshooting

### Error: "Cannot connect to server"

**Causa**: El servidor no está corriendo

**Solución**:
```powershell
.\start_server.ps1
```

### Error: "Invalid credentials" (401)

**Causa**: Username/password no coinciden entre apiContainer y cloud_service

**Solución**: Verifica que en ambos archivos `.env`:
- `CLOUD_PROVIDER_USERNAME` === `ML_SERVICE_USERNAME`
- `CLOUD_PROVIDER_PASSWORD` === `ML_SERVICE_PASSWORD`

### Error: "Rate limit exceeded" (429)

**Causa**: Excediste 20 requests en 60 segundos

**Solución**: Espera 1 minuto o aumenta `RATE_LIMIT_REQUESTS` en `.env`

### Error: "Too many points" (400)

**Causa**: La firma tiene más de 1200 puntos

**Solución**: Reduce la cantidad de puntos o aumenta `MAX_STROKE_POINTS` en `.env`

## Licencia

Proyecto académico - PRETESIS MFA

## Contacto

Para preguntas o issues, contacta al equipo de desarrollo.
