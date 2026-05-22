# Public Subsystem (Frontend + Backend)

This folder contains the public-facing frontend (React + Vite) and backend (Node.js) scaffolds.

Structure:
```
public/
├── frontend/  # React + Vite app
└── backend/   # Node.js Express backend
```

Run backend:
```bash
cd public/backend
npm install
cp .env.example .env
# set GOOGLE_CLIENT_ID and JWT_PRIVATE_KEY_PATH
npm run dev
```

Run frontend:
```bash
cd public/frontend
npm install
npm run dev
```
