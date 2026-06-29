# Dominios, Puertos y Contratos de Red

Este documento fija el mapa operativo para `cloud_service`.

## Alcance

- `cloud_service/public/backend`: gateway público en Node.js.
- `cloud_service/private`: servicio privado de inferencia/normalización en Python.
- `client` y `apiContainer` se dejan fuera de este despliegue.

## Puertos

| Servicio | Puerto | Uso |
|---|---:|---|
| API Gateway | 80/443 | Entrada pública del stack |
| `public/backend` | 4003 | Express HTTP |
| `private` | 9000 | FastAPI/UVicorn HTTP |
| Flutter local | 7000 | Solo desarrollo del frontend Flutter |
| `client/backend` | 4000 | Flujo local del cliente existente |
| `apiContainer` | 9001 | Servicio local de normalización existente |

## Rutas Relevantes

### `public/backend`

- `GET /health`
- `POST /auth/google/verify`
- `POST /auth/google/exchange`
- `POST /enroll`
- `GET /me`
- `POST /invites`

### `private`

- `GET /health`
- `POST /api/biometric/validate`
- `POST /api/biometric/enroll`

## Dominios y URLs

Sin Route 53, el valor útil para integrar servicios es el endpoint de API Gateway:

- `https://<api-id>.execute-api.<region>.amazonaws.com/prod`

Para comunicaciones internas dentro de la VPC:

- `PRIVATE_LSTM_URL=http://<internal-alb-dns>:9000`
- `CLOUD_PROVIDER_ENDPOINT=http://<public-alb-dns>:4003`

## Variables de Entorno Críticas

### `cloud_service/public/backend`

- `LISTEN_URL=http://0.0.0.0:4003`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `JWT_ALGO`
- `JWT_PUBLIC_KEY_PATH`
- `JWT_PRIVATE_KEY_PATH`
- `JWT_EXPIRATION_SECONDS`
- `PRIVATE_LSTM_URL`
- `SDK_URL`
- `ML_SERVICE_USERNAME`
- `ML_SERVICE_PASSWORD`
- `BIOMETRIC_SECRET_KEY`
- `SERVICE_API_KEY` si se quiere forzar cabecera interna
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_ENCRYPTION`
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_FROM_ADDRESS`
- `APP_NAME`
- `INVITE_EXPIRATION_DAYS`

### `cloud_service/private`

- `API_HOST=0.0.0.0`
- `API_PORT=9000`
- `PUBLIC_GATEWAY_URL`
- `TLS_ENABLED`
- `TLS_CERT_FILE`
- `TLS_KEY_FILE`
- `VERIFY_CLIENT_CERTIFICATES`
- `MODEL_PATH`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `MONGO_COLLECTION_PROFILES`
- `MONGO_COLLECTION_LOGS`
- `ML_SERVICE_USERNAME`
- `ML_SERVICE_PASSWORD`
- `RATE_LIMIT_REQUESTS`
- `RATE_LIMIT_WINDOW_SECONDS`
- `MAX_REQUEST_SIZE`
- `MIN_STROKE_POINTS`
- `MAX_STROKE_POINTS`
- `MODEL_INPUT_POINTS`
- `CONFIDENCE_THRESHOLD`
- `MODEL_SEQUENCE_LENGTH`
- `MODEL_FEATURES_PER_POINT`
- `ENVIRONMENT`
- `DEBUG`
- `LOG_LEVEL`

## Reglas De Red Recomendadas

- `public/backend` puede salir a Internet para Google, MongoDB Atlas y correo SMTP.
- `private` no debe tener acceso entrante desde Internet.
- `private` solo debe aceptar tráfico desde el security group de `public/backend`.
- Si `private` usa MongoDB Atlas, habilita NAT Gateway o una conectividad privada equivalente.

## Configuracion Simple Con `.env`

Para mantener la operacion simple, usa `.env` por servicio en desarrollo y como base documental para ECS:

- `cloud_service/public/backend/.env` para el gateway publico.
- `cloud_service/private/.env` para el servicio privado.
- Si luego despliegas en ECS, replica esos mismos nombres como variables de entorno en la task definition.
- No subas `.env` reales al repositorio; conserva solo los ejemplos.
- Si necesitas compartir configuracion entre entornos, usa `.env.example` como contrato.

## Despliegue En AWS Paso A Paso

### 1. Subir imágenes a ECR

- Crea dos repositorios ECR: uno para `cloud_service/public/backend` y otro para `cloud_service/private`.
- Construye las imágenes con tags versionados, por ejemplo `v1.0.0` y `latest`.
- Sube cada imagen a su repositorio ECR y usa esas URLs en el template.

Comandos de referencia:

```bash
aws ecr create-repository --repository-name mfa-public-backend
aws ecr create-repository --repository-name mfa-private-ml
docker build -t mfa-public-backend ./cloud_service/public/backend
docker build -t mfa-private-ml ./cloud_service/private
docker tag mfa-public-backend:latest <account>.dkr.ecr.<region>.amazonaws.com/mfa-public-backend:latest
docker tag mfa-private-ml:latest <account>.dkr.ecr.<region>.amazonaws.com/mfa-private-ml:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/mfa-public-backend:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/mfa-private-ml:latest
```

### 2. Empaquetar el modelo privado

- El modelo TFLite ya vive en `cloud_service/private/src/app/Entrenamineto_LSTM/embedding_network_mini.tflite`.
- El Dockerfile de `private` debe copiar `src/` completo para que el modelo quede dentro de la imagen.
- Si actualizas el modelo, versiona el archivo y construye una nueva imagen.

### 3. Lanzar ECS

- Crea una VPC con subredes públicas y privadas.
- Levanta primero el backend privado.
- Luego levanta el backend público apuntando al DNS interno del privado.
- Usa `UseNatGateway=true` si `private` necesita salir a Atlas o Google.

### 4. Variables En ECS

- No dependas de `.env` en producción.
- En ECS, define variables normales para configuración no secreta.
- Para secretos, usa Secrets Manager o SSM Parameter Store y referencia esos valores desde la task definition.

### 5. MongoDB Atlas

- Crea un usuario dedicado con permisos mínimos sobre la base `mfa_biometric`.
- Agrega en Atlas el rango de salida de tu NAT Gateway o la IP pública de tu entorno temporal.
- Usa URI con `mongodb+srv://` si tu red resuelve DNS SRV; si no, usa el string de réplica clásico.
- Guarda `MONGO_URI` como secreto de ECS o en Secrets Manager, no en el repo.

## Atlas Desde La Nube

Si hoy tienes Atlas en `.env`, la migración recomendada es:

1. Crear un secreto en AWS Secrets Manager con el URI completo.
2. Inyectar ese secreto en `public/backend` y `private` como `MONGO_URI`.
3. Hacer whitelist en Atlas del NAT Gateway o de la IP de salida del entorno.
4. Rotar el usuario de Atlas si ese URI ya estuvo expuesto localmente.

## Reglas Prácticas

- Si el servicio consume CPU de forma sostenida, sube primero `Cpu` antes que `DesiredCount`.
- Si el servicio usa memoria pesada por el modelo, sube `Memory` del task.
- Si el tráfico es bajo pero el cómputo por request es alto, mantén `DesiredCount=2` y sube tamaño del task.

## Decisiones Operativas

- No usar Route 53 por ahora.
- Mantener `client` y `apiContainer` tal como están.
- Versionar cualquier cambio de entorno, puertos o secretos antes de mover otros servicios.