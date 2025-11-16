# 🔐 Biometric Normalization Service - apiContainer

Servicio de normalización y preprocesamiento básico de datos biométricos de firmas manuscritas. Actúa como middleware entre la aplicación móvil (Flutter) y el servicio de validación ML (cloud_service).

## 📋 Arquitectura del Sistema

```
Flutter/Node → apiContainer (9001) → cloud_service (8000)
                  ↓                        ↓
           Normalización              Validación ML
           Padding básico             LSTM Inference
           Features básicas           Preprocesamiento avanzado
```

---

## 🚀 Endpoints

### **apiContainer (Puerto 9001)**

#### `GET /health`
**Propósito:** Health check - verificar que el servicio está activo

**Response:**
```json
{
  "status": "healthy",
  "service": "Biometric Normalization API",
  "version": "1.0.0"
}
```

#### `POST /normalize`
**Propósito:** Recibir stroke biométrico, normalizarlo y validarlo con ML

**Request de Flutter/Node:**
```json
{
  "timestamp": "2025-11-15T10:30:00Z",
  "stroke_points": [
    {"x": 266.0, "y": 168.0, "t": 0, "p": 0.5},
    {"x": 267.0, "y": 162.0, "t": 68, "p": 0.5}
  ],
  "stroke_duration_ms": 2808
}
```

**Validaciones:**
- Mínimo: 100 puntos (rechaza con 400 si < 100)
- Máximo: 1200 puntos (rechaza con 400 si > 1200)
- Rate limit: 8 requests/minuto por IP

**Procesamiento:**
1. Valida estructura y cantidad de puntos
2. Aplica padding a 1200 puntos usando estrategia `repeat_last`
3. Calcula `real_length` (cantidad original antes de padding)
4. Extrae features básicas (velocidad, distancia, duración)

**Envía a cloud_service:**
```json
{
  "normalized_stroke": [...1200 puntos...],
  "real_length": 174,
  "features": {
    "num_points": 1200,
    "real_length": 174,
    "velocity_mean": 317.4,
    "velocity_max": 14142.14,
    "total_distance": 1006.9,
    "duration_ms": 2808
  }
}
```

**Response:**
```json
{
  "status": "success",
  "normalized_stroke": [...],
  "features": {...},
  "ml_response": {
    "is_valid": true,
    "confidence": 0.95,
    "user_id": "predicted_user_123",
    "prediction_time_ms": 45
  }
}
```

---

### **cloud_service (Puerto 8000)**

#### `POST /api/biometric/validate`
**Propósito:** Validación ML con modelo LSTM

**Procesamiento:**
1. Recupera `real_length` (puntos reales antes de padding)
2. Resampling a 100 Hz
3. Suavizado (Savitzky-Golay)
4. Calcula features avanzadas (vx, vy, theta, curvatura)
5. Normalización completa [0,1]
6. Truncado inteligente + padding con máscara
7. Inferencia LSTM

---

## 📦 Flujo Completo de Datos

### Responsabilidades apiContainer:
- ✅ Validar estructura básica
- ✅ Rechazar < 100 puntos
- ✅ Aplicar padding simple a 1200 puntos
- ✅ Calcular `real_length`
- ✅ Enviar datos crudos: `{x, y, t, p}` + `real_length`
- ❌ NO normalizar valores (lo hace cloud_service)

### Responsabilidades cloud_service:
- ✅ Recibir datos crudos
- ✅ Resampling 100 Hz
- ✅ Suavizado
- ✅ Calcular features avanzadas
- ✅ Normalización completa
- ✅ LSTM inference

## ✨ Features

- ✅ **Receive biometric strokes** from any client
- ✅ **Automatic padding** for short strokes (linear interpolation)
- ✅ **Feature extraction** (velocity, distance, duration, point count)
- ✅ **JWT token validation** against your identity provider
- ✅ **HTTPS/TLS communication** with cloud ML service
- ✅ **Simple configuration** via `.env` file
- ✅ **No database** - stateless, lightweight, scalable
- ✅ **Production-ready** logging and error handling

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd src
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Run the Service

```bash
cd src
python main.py
```

Server starts at `http://0.0.0.0:9001`

## 📡 API Endpoints

### POST /normalize
Normalize biometric stroke and send to ML service

**Request:**
```json
{
  "timestamp": "2025-11-14T10:30:00Z",
  "stroke_points": [
    {"x": 100.5, "y": 150.3, "t": 0},
    {"x": 105.2, "y": 152.1, "t": 50}
  ],
  "stroke_duration_ms": 2500,
  "signature_token": "eyJhbGc..."
}
```

**Response:**
```json
{
  "status": "success",
  "normalized_stroke": [...],
  "features": {...},
  "ml_response": {...},
  "message": "Biometric data normalized and validated"
}
```

## 📁 Project Structure

```
src/
├── app/
│   ├── __init__.py         # FastAPI app
│   ├── config.py           # Configuration
│   ├── models.py           # Pydantic models
│   ├── routes.py           # Endpoints
│   ├── normalizer.py       # Padding logic
│   ├── security.py         # JWT validation
│   └── cloud_service.py    # HTTPS communication
├── main.py                 # Entry point
└── requirements.txt        # Dependencies
```

## 🔒 Security

- JWT validation against identity provider
- HTTPS/TLS with cloud ML service
- Basic authentication
- Signature provider validation

## 📝 Configuration

See `.env.example` for all variables.

Key variables:
- `API_PORT`: Server port (9001)
- `JWT_PUBLIC_KEY_PATH`: Path to public key
- `CLOUD_PROVIDER_ENDPOINT`: ML service URL
- `MIN_STROKE_POINTS`: Minimum points before padding
- `PADDING_STRATEGY`: linear_interpolation or repeat_last

## 📚 API Documentation

Interactive docs: http://localhost:9001/docs

---

**Version:** 1.0.0

