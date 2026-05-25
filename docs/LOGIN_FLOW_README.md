# Contrato: Flujo de Login con Firma Única (Single-Signature)

Resumen: este README define responsabilidades por capa/proyecto y los contratos JSON / estructuras de colección necesarias para el flujo de login con una sola firma. No se especifican puertos.

**Responsabilidades por capa / proyecto**

- Public Gateway (cloud_service/public/backend)
  - Validar tokens ARC0.5 y forma mínima del paquete recibido desde el SDK.
  - Comprobar existencia del usuario y estado (habilitado, tenant, perfil biométrico).
  - Recuperar la `masterSignature` del usuario (si aplica) antes de enviar a LSTM.
  - Enviar paquete normalizado al servicio Private LSTM y esperar decisión.
  - Si LSTM aprueba, generar firmada ARC1.0 / emitir JWT final y devolver JSON al SDK/cliente.
  - Registrar intento de login y resultado en `loginAttempts` / `auditLogs`.

- Private LSTM Service (cloud_service/private/LSTM)
  - Recibir paquete de firma + contexto (incluida la masterSignature) desde Public Gateway.
  - Normalizar internamente la firma y ejecutar el modelo/trust scoring.
  - Responder con decisión (`accept` / `reject` / `challenge`), `confidence` y firma del resultado (opcional `lstmSignature`).
  - Mantener trazabilidad mínima para auditoría.

- SDK (cliente/native SDK que empaqueta firmas)
  - Validar localmente formatos y realizar mínima normalización (timestamp, nonce, tenantKey público).
  - Añadir metadatos necesarios (SDK version, device id, challenge nonce) y firmar con clave SDK si aplica.
  - Enviar paquete al Public Gateway.
  - Recibir respuesta final (ARC1.0 token) y propagar al app.

- Flutter App (client/frontend)
  - Capturar la firma del usuario (UI / biometric helper) y construir el paquete mínimo para SDK.
  - Llamar al SDK para normalizar/firmar y enviar a Public Gateway.
  - Persistir token final (ARC1.0 JWT) en `shared_preferences` y verificar con `/auth/me` (contravalidación).

- Admin / User Management (servicio interno)
  - Mantener colección `users` y `masterSignature` / metadatos.
  - No participa directamente en cada login, pero Public Gateway consulta su estado y `masterSignature`.


**Colecciones (MongoDB) — nombres y esquemas mínimos**

- `users`
  - _id: ObjectId
  - tenantId: ObjectId
  - email: string (indexed, unique per tenant)
  - displayName: string
  - masterSignature: string|null  # firma maestra para login (opcional)
  - status: string enum ["active","disabled"]
  - createdAt: date
  - updatedAt: date

- `biometricProfiles`
  - _id: ObjectId
  - userId: ObjectId (ref users)
  - tenantId: ObjectId
  - templateType: string
  - templateHash: string  # hash de plantilla si se guarda
  - enrolledAt: date
  - version: number

- `loginAttempts`
  - _id: ObjectId
  - userId: ObjectId|null
  - tenantId: ObjectId|null
  - requestId: string (UUID)  # correlación entre capas
  - sdkPayloadHash: string
  - publicDecision: string ["sent-to-lstm","rejected","accepted"]
  - lstmDecision: string|null ["accept","reject","challenge"]
  - confidence: number|null
  - createdAt: date
  - meta: object (free-form)

- `auditLogs`
  - _id: ObjectId
  - eventType: string
  - actor: string
  - details: object
  - createdAt: date

- `tenants`
  - _id: ObjectId
  - tenantKeyPublic: string  # clave pública / identificador público
  - name: string
  - config: object


**Endpoints y contratos JSON (flujo principal)**

1) SDK -> Public Gateway : paquete de login (POST /auth/login-signature)

Request (Content-Type: application/json):
{
  "requestId": "uuid-v4",
  "tenantKey": "<tenant_public_key>",
  "sdk": {
    "sdkId": "sdk-identifier",
    "sdkVersion": "1.0.0",
    "deviceId": "device-uuid"
  },
  "userAssertion": {
    "signature": "<base64-or-hex>",
    "signatureType": "single-signature", 
    "algorithm": "ES256|RS256|..",
    "timestamp": "2026-05-24T12:34:56Z",
    "nonce": "random-nonce"
  },
  "token": "<optional mfa_token or client token used for session context>",
  "metadata": { /* opcional: ip, user-agent, appVersion */ }
}

Notes:
- `tenantKey` identifica el tenant públicamente; Public Gateway usa esto para enrutar/validar.
- `token` puede ser el token de sesión mínimo si aplica (ej. para step-up), o null para login separado.

Public Gateway validaciones iniciales:
- Verificar `tenantKey` y obtener `tenantId`.
- Validar formato `userAssertion` y verificar firma SDK minimal (si aplica).
- Buscar `users` por lo que permita el tenant (email/claim extra) — si no existe, devolver `404`/`reject`.
- Recuperar `masterSignature` del `user` (si existe) para enviar a LSTM.

Si validaciones fallan -> respuesta inmediata: 400/401/403 con body:
{
  "requestId":"uuid",
  "status":"rejected",
  "reason":"invalid-payload|user-not-found|invalid-tenant"
}


2) Public Gateway -> Private LSTM : paquete de evaluación

Request (POST JSON):
{
  "requestId": "uuid-v4",
  "tenantId": "mongodb-objectid",
  "userId": "mongodb-objectid",
  "sdkPayload": { /* copia / normalized minimal del SDK payload */ },
  "userAssertion": { /* del SDK: signature, algorithm, timestamp, nonce */ },
  "masterSignature": "<base64-or-hex>|null",
  "context": {
    "ip": "1.2.3.4",
    "deviceId": "...",
    "attemptAt": "2026-05-24T12:34:56Z"
  }
}

Private LSTM validará y normalizará internamente; devolverá:

Response (JSON):
{
  "requestId":"uuid-v4",
  "decision":"accept|reject|challenge",
  "confidence": 0.0-1.0,
  "reason": "string (optional)",
  "lstmSignature": "<optional-signature>"
}


3) Public Gateway (tras respuesta LSTM)
- Si `decision` == `accept`:
  - Generar ARC1.0 token (signed by public gateway private key) que contenga claims mínimos: `sub` (userId), `tenantId`, `arc":"1.0", `iat`, `exp`, `requestId`.
  - Persistir en `loginAttempts` con `lstmDecision` y `confidence`.
  - Responder al SDK con payload final:

Final Response (200):
{
  "requestId":"uuid-v4",
  "status":"accepted",
  "access_token": "<ARC1.0 JWT>",
  "arc_version":"1.0",
  "user": {
    "id":"user-objectid",
    "email":"user@example.com",
    "displayName":"...",
    "hasBiometricProfile": true
  },
  "meta": {
    "confidence": 0.92,
    "lstmSignature": "..."
  }
}

- Si `decision` == `reject`:
  - Responder con status `rejected` y razón mínima.
- Si `challenge`:
  - Indicar next steps (ej. step-up, captcha, additional factors).


**Casos especiales / validaciones**
- Replay / nonce: SDK debe proveer `nonce` y Public Gateway debe validar fresh timestamp + nonce cache (evitar reuse).
- Correlación: usar `requestId` en todas las llamadas para tracing.
- Master signature retrieval: Public Gateway debe leer `users.masterSignature` o la fuente autorizada antes de llamar a LSTM.
- Rate limiting y detección de anomalías: Public Gateway aplica rate-limits por `tenantId` y `deviceId`.


**Ejemplos concretos (mínimos)**

SDK -> Public (ejemplo):
{
  "requestId":"3f1b8b2a-...",
  "tenantKey":"tenant-public-123",
  "sdk": {"sdkId":"mobile","sdkVersion":"1.2.0","deviceId":"dev-1"},
  "userAssertion": {"signature":"MEUCIQ...","signatureType":"single-signature","algorithm":"ES256","timestamp":"2026-05-24T12:34:56Z","nonce":"n-abc"},
  "token": null
}

Public->LSTM (ejemplo):
{
  "requestId":"3f1b8b2a-...",
  "tenantId":"6423...",
  "userId":"6428...",
  "sdkPayload":{ /* minimal */ },
  "userAssertion":{ /* } */ },
  "masterSignature":"BASE64_MASTER_SIG"
}

LSTM->Public (ejemplo):
{
  "requestId":"3f1b8b2a-...",
  "decision":"accept",
  "confidence":0.95,
  "lstmSignature":"LSTM-SIGNATURE-BASE64"
}

Public->SDK Final (ejemplo):
{
  "requestId":"3f1b8b2a-...",
  "status":"accepted",
  "access_token":"eyJhbGciOiJSUzI1NiIsInR5...",
  "arc_version":"1.0",
  "user": {"id":"6428...","email":"u@e.com","displayName":"User"},
  "meta": {"confidence":0.95}
}


**Recomendaciones operativas**
- Firmas y claves: mantener claves privadas en KMS / vault; `tenantKey` debe ser público y no permitir que su valor sea secreto.
- Trazabilidad: almacenar `requestId` y correlacionar logs entre Public y Private.
- Contravalidación cliente: la app debe verificar el `access_token` con `/auth/me` al iniciar sesión para evitar volver a pantalla de Google en reinicios.
- Versionado ARC: incluir claim `arc_version` en JWTs para futuras migraciones.


---

Archivo generado: `docs/LOGIN_FLOW_README.md` (contrato del flujo de login con firma única).
