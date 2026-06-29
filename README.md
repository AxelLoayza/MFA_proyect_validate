# MFA Proyecto Validate

Proyecto de autenticación multifactor con flujo Google OAuth, emisión ARC 0.5, enrolamiento biométrico y validación por firma/LSTM.

## Arquitectura

El flujo principal es:

1. Flutter frontend inicia sesión con Google.
2. `client/backend` recibe el token/código y decide el siguiente paso.
3. `apiContainer` normaliza y delega validaciones biométricas.
4. `cloud_service/public/backend` valida Google, emite ARC 0.5 y expone `/auth/me`.
5. `cloud_service/private` ejecuta la validación biométrica/LSTM.

## Estructura relevante

- `client/frontend` - app Flutter para móvil, web y escritorio.
- `client/backend` - backend Node/Express que recibe el flujo del cliente.
- `apiContainer` - servicio de normalización y puente hacia la nube.
- `cloud_service/public/backend` - gateway público y autoridad ARC.
- `cloud_service/private` - servicio privado de validación biométrica.

## Puertos usados

- `8080` - Flutter web / debug local.
- `4000` - `client/backend`.
- `4003` - `cloud_service/public/backend`.
- `9001` - `apiContainer`.
- `9000` - `cloud_service/private`.

## Archivos de entorno

Cada servicio tiene un archivo `.env.example`. Copia el ejemplo a `.env` y ajusta los valores locales.

- `client/frontend/.env.example`
- `client/backend/.env.example`
- `apiContainer/.env.example`
- `cloud_service/public/backend/.env.example`
- `cloud_service/private/.env.example`

## Variables y configuración

### Flutter

- `WEB_APP_URL` - URL usada en web.
- `ANDROID_APP_URL` - URL usada al depurar en Android por LAN.
- `BACKEND_URL` - URL del backend del cliente.
- `PUBLIC_BACKEND_URL` - URL del gateway público.
- `SDK_URL` o `CLOUD_SERVICE_URL` - URL del puente hacia `apiContainer`.

### Reglas importantes

- `0.0.0.0` se usa como bind del servidor, no como destino desde Flutter.
- En Android debes apuntar al IP LAN real de la PC, por ejemplo `192.168.1.194`.
- Para web, Google Cloud debe registrar el origen exacto del navegador, por ejemplo `http://localhost:8080` o `http://192.168.1.194:8080`.
- Para Android, Google OAuth depende del package name y la SHA-1/SHA-256 del build, no del origin JavaScript.

## Modelos versionados

Este repositorio incluye los artefactos de inferencia que ya forman parte del contrato de producción:

- `cloud_service/private/src/app/Entrenamineto_LSTM/embedding_network_mini.h5`
- `cloud_service/private/src/app/Entrenamineto_LSTM/embedding_network_mini.tflite`

## Qué no se versiona

No deben subirse al repositorio:

- `.env` reales.
- `.venv` o entornos virtuales locales.
- `__pycache__` y otros artefactos generados.
- Claves PEM generadas localmente.

## Puesta en marcha local

### 1. `cloud_service/private`

```powershell
cd cloud_service/private
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r src/requirements.txt
python -m uvicorn app.main:app --app-dir src --host 0.0.0.0 --port 9000 --env-file .env
```

### 2. `cloud_service/public/backend`

```powershell
cd cloud_service/public/backend
npm install
npm run start
```

### 3. `apiContainer`

```powershell
cd apiContainer
python src/main.py
```

### 4. `client/backend`

```powershell
cd client/backend
npm install
npm run start
```

### 5. `client/frontend`

```powershell
cd client/frontend
flutter pub get
flutter run -d android
```

Para web local:

```powershell
flutter run -d edge --web-hostname=localhost --web-port=8080
```

## Notas de despliegue

- `client/backend` debe escuchar en `0.0.0.0:4000`.
- `cloud_service/public/backend` debe escuchar en `0.0.0.0:4003`.
- `apiContainer` y `cloud_service/private` pueden seguir en `localhost` si corren en la misma máquina.
- El backend público es quien emite ARC 0.5; Flutter no debe hablarle directo para el flujo normal.

## Observaciones

- El flujo web puede fallar por `origin_mismatch` si el origen exacto no está registrado en Google Cloud.
- El flujo Android puede fallar si no están configurados el package name y la SHA-1 correctos.
- Si el móvil no recibe respuesta, primero confirma conectividad LAN y luego revisa firewall antes de tocar el código.
