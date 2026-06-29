# Cloud Service AWS Deployment Guide

This guide covers only the `cloud_service` stack:

- `cloud_service/public/backend` - Node.js gateway that handles Google OAuth, JWT issuance, MongoDB writes, and calls the private ML service.
- `cloud_service/private` - Python/FastAPI biometric validation service with Basic Auth.

`client` and `apiContainer` are intentionally out of scope here.

## Target Layout

Recommended runtime separation:

- Public subnet: load balancer or API Gateway entry point for `public/backend`.
- Private subnet: `private` ML service, no public inbound access.
- MongoDB Atlas: external managed database accessed over TLS from `public/backend`.

## Prerequisites

Install or provision the following on the target machine or image:

- Node.js 20+ for `cloud_service/public/backend`.
- Python 3.11+ for `cloud_service/private`.
- `git`.
- A process manager for Node.js such as `pm2` or `nodemon` for development.
- A Python virtual environment tool (`venv` is enough).
- Network egress to MongoDB Atlas and Google OAuth endpoints.

If you deploy on EC2, install system packages first:

```bash
sudo apt update
sudo apt install -y git curl build-essential python3 python3-venv python3-pip
```

## Environment Files

Create and maintain separate `.env` files for each service.

### `cloud_service/public/backend/.env`

Required values:

```env
MONGO_URI=<mongodb-atlas-connection-string>
MONGO_DB_NAME=mfa_biometric

GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
GOOGLE_REDIRECT_URI=https://<your-domain>/api/auth/callback/google
GOOGLE_JWKS_URI=https://www.googleapis.com/oauth2/v3/certs

JWT_PUBLIC_KEY_PATH=./keys/jwt_public.pem
JWT_PRIVATE_KEY_PATH=./keys/jwt_private.pem
JWT_ALGO=RS256
JWT_EXPIRATION_SECONDS=3600

SDK_URL=http://<private-ml-host>:9000
SDK_API_KEY=sdk_default_key
SDK_SECRET=sdk_default_secret

PRIVATE_LSTM_URL=http://<private-ml-host>:9000
ML_SERVICE_USERNAME=bmfa_user
ML_SERVICE_PASSWORD=<strong-password>

BIOMETRIC_SECRET_KEY=<64-hex-chars>
PORT=4003

MAIL_HOST=smtp.gmail.com
MAIL_PORT=465
MAIL_USERNAME=<smtp-user>
MAIL_PASSWORD=<smtp-password>
MAIL_ENCRYPTION=ssl
MAIL_FROM_ADDRESS=<smtp-user>
MAIL_FROM_NAME=ARC Secure Cloud

INVITE_EXPIRATION_DAYS=1
APP_NAME=ARC Secure Cloud
```

### `cloud_service/private/.env`

Required values:

```env
API_PORT=9000
API_HOST=0.0.0.0

ML_SERVICE_USERNAME=bmfa_user
ML_SERVICE_PASSWORD=<strong-password>

RATE_LIMIT_REQUESTS=20
RATE_LIMIT_WINDOW_SECONDS=60
MAX_REQUEST_SIZE=102400

MIN_STROKE_POINTS=100
MAX_STROKE_POINTS=1200
MODEL_INPUT_POINTS=100

TLS_ENABLED=false
TLS_CERT_FILE=./certs/server.crt
TLS_KEY_FILE=./certs/server.key
VERIFY_CLIENT_CERTIFICATES=false

MODEL_PATH=./src/app/Entrenamineto_LSTM/embedding_network_mini.h5
CONFIDENCE_THRESHOLD=0.7
MODEL_SEQUENCE_LENGTH=100
MODEL_FEATURES_PER_POINT=4

MONGO_URI=<mongodb-atlas-connection-string>
MONGO_DB_NAME=mfa_biometric

LOG_LEVEL=INFO
ENVIRONMENT=production
DEBUG=false
```

## MongoDB Atlas

Use the Atlas URI directly in `MONGO_URI`. The connection is external and TLS-enabled.

Example shape:

```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority&appName=<app>
```

Recommendations:

- Whitelist the public IP of the EC2 instance or NAT gateway in Atlas Network Access.
- Prefer a dedicated Atlas database user with least privilege.
- Store the URI in AWS Secrets Manager or SSM Parameter Store, not in source control.

## Runtime Setup on EC2

### Public backend

```bash
cd cloud_service/public/backend
npm ci
npm run dev
```

### Private ML service

```bash
cd cloud_service/private/src
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python src/main.py
```

## Startup Order

1. MongoDB Atlas access is verified.
2. `cloud_service/private` is started first.
3. `cloud_service/public/backend` is started next.
4. The frontend and client-side services can then point to the public backend.

## Network Rules

- `public/backend` inbound: allow only the port exposed by the load balancer or API Gateway.
- `private` inbound: allow only traffic from the security group of `public/backend`.
- `private` should not be internet-facing.
- Outbound from both services must allow HTTPS to Google, MongoDB Atlas, and any SMTP provider.

## TLS and Keys

- `JWT_PUBLIC_KEY_PATH` and `JWT_PRIVATE_KEY_PATH` must point to real PEM files on `public/backend`.
- `BIOMETRIC_SECRET_KEY` should be a 32-byte hex string for AES-256-GCM.
- If you do not set `BIOMETRIC_SECRET_KEY`, the service will start with a temporary in-memory dev key.

## Smoke Tests

### Public backend

```bash
curl http://<public-host>:4003/health
```

### Private ML service

```bash
curl -u bmfa_user:<strong-password> http://<private-host>:9000/health
```

## What This Guide Does Not Cover

- `client/backend`
- `apiContainer`
- The Flutter frontend

Those are managed separately by design.
