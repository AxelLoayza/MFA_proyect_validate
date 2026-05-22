# Public Backend (Node.js)

Minimal scaffold for public backend handling Google Sign-In and session JWTs.

Quick start:

```bash
cd public/backend
npm install
cp .env.example .env
# fill GOOGLE_CLIENT_ID and secret
npm run dev
```

Endpoints:
- `POST /auth/google` - Accepts `{ id_token }` from client, verifies with Google, upserts user in `users` collection and returns server JWT.

Notes:
- JWT is signed with private key located at path `JWT_PRIVATE_KEY_PATH` (recommended to point to `../../private/keys/private_key.pem`).
- Uses `mongoose` to connect to MongoDB defined by `MONGO_URI` and `MONGO_DB_NAME`.
