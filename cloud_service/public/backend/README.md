# Public Backend - Cloud Gateway

Este backend actua como gateway de nube para el proyecto biometrico. Recibe solicitudes desde el backend del cliente, valida identidad/tenant/sesion y persiste el template biometrico final en MongoDB.

## Flujo Final

1. Flutter captura 5 firmas y las envia al backend del cliente en el puerto 4000.
2. El backend del cliente orquesta la sesion y delega al SDK del cliente.
3. El SDK aplica DTW medoid y genera `master_feature`.
4. El backend publico en la nube recibe el resultado en el host configurado y en el puerto 4003.
5. El gateway valida el token, el usuario y el tenant.
6. Si todo es correcto, guarda la plantilla en `biometricprofile`.

## Decisiones de Diseno

- `master_feature` es el nombre definitivo del payload biometrico persistido.
- `samplesUsed` solo indica cuantas firmas participaron en el registro.
- `ARC 0` se usa para el token temporal de enrolamiento.
- `ARC 0.5` se reserva para el token de Google.
- El gateway no hace DTW ni preprocesamiento pesado.
- El gateway no suaviza ni extrae features adicionales.
- El gateway solo valida y persiste.

## Contrato de Entrada

### `POST /enroll`

Headers:

```http
Authorization: Bearer <token-pre-enrolamiento>
Content-Type: application/json
```

Body aceptado:

```json
{
  "master_feature": {
    "dtw_medoid_index": 2,
    "dtw_medoid": [[100.5, 150.3], [101.2, 151.0]],
    "dtw_pairwise_distances": [[0, 1.2], [1.2, 0]],
    "representation_strategy": "dtw_medoid"
  },
  "samplesUsed": 5
}
```

Formas compatibles por retrocompatibilidad:

```json
{
  "biometric_template": { "...": "..." }
}
```

```json
{
  "signatures": [
    { "timestamp": "...", "stroke_points": ["..."], "stroke_duration_ms": 2500 }
  ]
}
```

Validaciones del gateway:

- Token presente y valido.
- Token con ARC pre-enrolamiento valido (`0` o `0.5`).
- Usuario autentico existe.
- Tenant asociado resuelto correctamente.
- Payload biometrico presente.
- Si se envia `signatures`, deben ser exactamente 5.

## Persistencia

La plantilla se guarda en la coleccion `biometricprofile` con estos campos principales:

- `userId`
- `tenantId`
- `authTag`
- `iv`
- `masterFeatureEncrypted`
- `samplesUsed`
- `modelVersion`

Ademas, el usuario queda referenciado con `biometricTemplate` para marcar que el enrolamiento termino.

## Respuesta Exitosa

```json
{
  "success": true,
  "message": "Biometric profile stored successfully",
  "access_token": "<jwt-final>",
  "token_type": "Bearer",
  "arc": "1.0",
  "amr": ["federated", "biometric"],
  "arcSessionId": "<id>",
  "expires_in": 3600,
  "biometricProfile": {
    "id": "<profile-id>",
    "userId": "<user-id>",
    "tenantId": "<tenant-id>",
    "samplesUsed": 5,
    "modelVersion": "lstm_v1"
  }
}
```

## Endpoints Principales

- `POST /auth/google/verify` - Verificacion de Google y emision de ARC 0.5.
- `POST /auth/google/exchange` - Intercambio de authorization code.
- `POST /enroll` - Enrolamiento biometrico y persistencia del template.
- `GET /me` - Usuario actual desde JWT del servidor.

## Configuracion

Variables importantes:

```env
# MongoDB
MONGO_URI=
MONGO_DB_NAME=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_JWKS_URI=https://www.googleapis.com/oauth2/v3/certs

# JWT signing and verification
JWT_PUBLIC_KEY_PATH=./keys/jwt_public.pem
JWT_PRIVATE_KEY_PATH=./keys/jwt_private.pem
JWT_ALGO=RS256
JWT_EXPIRATION_SECONDS=3600

# SDK / apiContainer
SDK_URL=http://localhost:9001
SDK_API_KEY=sdk_default_key
SDK_SECRET=sdk_default_secret

# Private biometric service (Basic Auth)
PRIVATE_LSTM_URL=http://localhost:9000
ML_SERVICE_USERNAME=bmfa_user
ML_SERVICE_PASSWORD=your_secure_password_here

# Crypto and app
BIOMETRIC_SECRET_KEY=<hex-32-bytes>
HOST=0.0.0.0
PORT=4003
```

Notas:

- `JWT_PUBLIC_KEY_PATH` debe apuntar al PEM público local de este servicio, por ejemplo `./keys/jwt_public.pem`.
- `JWT_PRIVATE_KEY_PATH` debe apuntar al PEM privado local de este servicio, por ejemplo `./keys/jwt_private.pem`.
- `ML_SERVICE_USERNAME` y `ML_SERVICE_PASSWORD` son credenciales Basic Auth para llamar a `PRIVATE_LSTM_URL`.
- `BIOMETRIC_SECRET_KEY` es el secreto usado por `src/utils/crypto.js`; si no se define, el servicio arranca con una clave temporal de desarrollo.
- `HOST` controla la interfaz donde escucha Express. Usa `0.0.0.0` para aceptar conexiones desde la red local o una IP/dominio si quieres fijar el bind explícitamente.

## Prueba Rapida

1. Obtener token ARC 0.
2. Enviar `POST /enroll` con `master_feature` y `Authorization: Bearer <token>`.
3. Verificar que la respuesta sea `201`.
4. Revisar que la coleccion `biometricprofile` tenga el nuevo documento.

## Observacion

Este backend no hace DTW. Solo valida identidad y guarda la plantilla biometrica que le entrega el flujo del cliente.
