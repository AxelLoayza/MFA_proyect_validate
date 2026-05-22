# Frontend (React + Vite)

Scaffolded minimal React app to be used with the public backend.

Quick start:

```bash
cd public/frontend
npm install
cp .env.example .env
npm run dev
```

Notes:
- Uses `@react-oauth/google` for client-side Google Sign-In. You must include the Google client id in your index.html or use the provider wrapper.
- `LoginButton` sends `id_token` to `/auth/google` on the public backend.
- TailwindCSS and shadcn instructions to be added when you want UI components integrated.
