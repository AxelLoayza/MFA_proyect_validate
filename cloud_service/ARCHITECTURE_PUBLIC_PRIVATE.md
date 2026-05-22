# Arquitectura Public/Private (Dashboard + Private ML)

## Objetivo
Separar el proyecto en dos subredes lógicas:
- `public/` : Frontend (React + Vite + shadcn UI) y Backend público (Node.js) que maneje autenticación (Google Sign-In) y API públicas.
- `private/`: Servicios internos (Python ML/LSTM, entrenamiento, claves RSA, acceso restringido) que solo exponen endpoints internos o se comunican vía mensaje/cola.

## Estructura recomendada

```
cloud_service/
├── public/                   # Código público: frontend + node backend
│   ├── frontend/             # React + Vite + shadcn UI
│   └── backend/              # Node.js + Express/Fastify (Google OAuth, Mongo)
├── private/                  # Código privado: ML, entrenamiento, keys
│   ├── ml/                   # LSTM, training scripts, modelos
│   ├── keys/                 # private_key.pem, public_key.pem
│   └── services/             # procesos internos (inference server)
├── src/                      # Código python legacy (si aplica)
└── .env / private/.env       # Variables de entorno (secrets en private/.env)
```

## Tecnologías propuestas
- Frontend: React + Vite + shadcn/ui + TailwindCSS
- Backend público: Node.js (Express o Fastify) + Mongoose (o MongoDB driver) + Passport.js (passport-google-oauth20)
- Backend privado: Python (FastAPI) o proceso RPC para servir inferencia LSTM
- DB: MongoDB (instancia local o Atlas)

## Google Sign-In (flujo recomendado)
1. Frontend inicia OAuth con Google usando `@react-oauth/google` o redirección a backend.
2. Backend Node.js recibe `code` o `id_token`, valida con Google, crea sesión JWT (firma con server private key or HS256 secret) y guarda/actualiza user en `users` collection.
3. El token JWT es enviado al frontend y usado en llamadas a API públicas.

## Conexión a Mongo (Node.js ejemplo con Mongoose)

.env (ejemplo para backend):
```
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=local
MONGO_COLLECTION_PROFILES=biometricprofile
MONGO_COLLECTION_LOGS=startup_log
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
JWT_PRIVATE_KEY_PATH=../private/keys/private_key.pem
JWT_PUBLIC_KEY_PATH=../private/keys/public_key.pem
JWT_EXPIRATION_SECONDS=300
```

Código de conexión (Node.js, `backend/src/db.js`):
```js
const mongoose = require('mongoose');
const { MONGO_URI, MONGO_DB_NAME } = process.env;

const uri = MONGO_URI;

async function connect() {
  await mongoose.connect(uri, { dbName: MONGO_DB_NAME });
  console.log('Connected to MongoDB', MONGO_DB_NAME);
}

module.exports = { connect };
```

## Google OAuth (Node.js, Passport)
- Usa `passport-google-oauth20` para estrategia.
- Alternativa moderna: manejar `id_token` en backend y verificar con Google API (`google-auth-library`).

Ejemplo minimal (verificando `id_token`):
```js
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyIdToken(idToken) {
  const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  return ticket.getPayload(); // contiene email, sub (google id), name
}
```

## Conexión Frontend -> Backend
- Frontend obtiene `id_token` de Google (p. ej. `@react-oauth/google`) y lo envía a `POST /auth/google`.
- Backend valida `id_token`, crea/actualiza user en `users` collection y retorna token de sesión (JWT) para uso en APIs.

## shadcn/ui + Tailwind setup (Frontend)
Pasos rápidos:
```bash
# Crear app con Vite
pnpm create vite@latest frontend --template react
cd frontend
pnpm install

# Instalar tailwind
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Instalar shadcn UI (requiere Radix + shadcn libs)
pnpm add @radix-ui/react-primitive
# Seguir guía oficial de shadcn/ui para generar componentes
```

## Comunicación pública<>privada
- Opción 1: Backend público llama al servicio interno de inferencia (REST/gRPC) en `private/services/inference` (puerto interno). Autenticación mutua con mTLS o JWT con claves privadas.
- Opción 2: Mensajería: Backend público publica job a RabbitMQ / Redis Stream y servicio privado consume y responde con resultado de inferencia.

## Siguientes pasos posibles (puedo scaffoldear)
- Crear scaffold del `backend/` Node.js con endpoints: `/auth/google`, `/api/token/generate` (si aplica), `/api/biometric/validate` (proxy a private inference).
- Crear scaffold `frontend/` con Vite + React + Tailwind + shadcn/ui y componente de login Google.
- Mover código LSTM al `private/ml/` y exponer un pequeño servidor FastAPI para inference.

---

Si quieres, procedo a:
- a) Crear el scaffold mínimo del backend Node.js con conexión a Mongo y endpoint `/auth/google` (verifica tokens Google), y archivo `.env.example`.
- b) Crear scaffold del frontend Vite+React con instrucciones para integrar shadcn UI.

Elige (a), (b), o (ambos) y procedo a crear los archivos iniciales.
