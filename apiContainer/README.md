# 🔐 Biometric Normalization Service

Simple, lightweight API service that normalizes biometric stroke data and forwards it to your cloud ML service via HTTPS/TLS.

## 📋 Purpose

This service acts as an **intermediary** between your mobile application (or any biometric client) and your cloud ML service:

```
Mobile App (Flutter/Android/iOS)
    ↓
    └─→ POST /normalize (biometric stroke)
           ↓
      [Normalize with padding if needed]
      [Extract features]
           ↓
      HTTPS/TLS request → Cloud ML Service
           ↓
      [Return ML validation result]
```

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

