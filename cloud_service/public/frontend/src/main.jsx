import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { GoogleOAuthProvider } from '@react-oauth/google'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''

function MissingGoogleClientId() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', color: '#e5eefc', background: '#0b1220', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '720px', width: '100%', border: '1px solid rgba(148,163,184,.25)', borderRadius: '20px', padding: '1.5rem', background: 'rgba(15,23,42,.9)' }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: '.18em', fontSize: '.75rem', color: '#94a3b8' }}>Configuración pendiente</p>
        <h1 style={{ margin: '.5rem 0 1rem', fontSize: '1.9rem', lineHeight: 1.1 }}>Falta configurar Google OAuth en el frontend admin</h1>
        <p style={{ margin: 0, color: '#cbd5e1' }}>No existe <strong>VITE_GOOGLE_CLIENT_ID</strong> en el entorno de <strong>cloud_service/public/frontend</strong>. Sin ese valor, Google devuelve el error de client_id faltante.</p>
        <pre style={{ marginTop: '1rem', padding: '1rem', borderRadius: '14px', overflowX: 'auto', background: '#020617', color: '#93c5fd' }}>.env.example\nVITE_API_BASE_URL=http://localhost:4003\nVITE_GOOGLE_CLIENT_ID=tu_client_id_de_google</pre>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <MissingGoogleClientId />
    )}
  </React.StrictMode>
)
