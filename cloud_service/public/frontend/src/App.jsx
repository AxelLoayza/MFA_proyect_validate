import React, { useState, useEffect } from 'react'
import AuthCard from './components/AuthCard'
import AdminPanel from './components/AdminPanel'
import { getMe } from './sdk'

export default function App() {
  const [user, setUser] = useState(null)
  const [unauthorized, setUnauthorized] = useState(false)
  const [booting, setBooting] = useState(true)
  const [registrationHint, setRegistrationHint] = useState('')

  useEffect(() => {
    async function check() {
      const token = localStorage.getItem('mfa_token')
      if (!token) {
        setBooting(false)
        return
      }
      const me = await getMe()
      if (me && me.user) {
        if (me.user.role === 'superadmin') {
          setUser(me.user)
          setUnauthorized(false)
        } else {
          setUnauthorized(true)
        }
      } else {
        localStorage.removeItem('mfa_token')
      }
      setBooting(false)
    }
    check()
  }, [])

  const handleLogin = (nextUser) => {
    setUser(nextUser)
    setUnauthorized(nextUser?.role !== 'superadmin')
  }

  const handleNeedsRegistration = (message) => {
    setRegistrationHint(message || 'Debes registrarte antes de iniciar sesión.')
    setUnauthorized(false)
    setUser(null)
  }

  const handleLogout = () => {
    localStorage.removeItem('mfa_token')
    setUser(null)
    setUnauthorized(false)
  }

  return (
    <div className="app-shell">
      <div className="app-shell__background" />
      <div className="app-shell__glow app-shell__glow--left" />
      <div className="app-shell__glow app-shell__glow--right" />

      <header className="topbar">
        <div>
          <div className="topbar__brand">ARC Secure Cloud</div>
          <div className="topbar__subtitle">Public access portal</div>
        </div>
        {user ? (
          <button className="topbar__button" onClick={handleLogout}>Cerrar sesión</button>
        ) : null}
      </header>

      <main className="app-shell__main">
        {booting ? (
          <section className="hero-card">
            <p className="hero-card__eyebrow">Loading</p>
            <h1 className="hero-card__title">Preparando tu sesión...</h1>
            <p className="hero-card__text">Validando token y permisos en MongoDB.</p>
          </section>
        ) : user ? (
          <AdminPanel user={user} onLogout={handleLogout} />
        ) : unauthorized ? (
          <section className="hero-card hero-card--warning">
            <p className="hero-card__eyebrow">Access denied</p>
            <h1 className="hero-card__title">No tienes permiso para entrar al dashboard</h1>
            <p className="hero-card__text">Tu cuenta no tiene el rol requerido en MongoDB.</p>
            <AuthCard onLogin={handleLogin} onNeedsRegistration={handleNeedsRegistration} />
          </section>
        ) : (
          <section className="hero-card hero-card--login">
            <AuthCard onLogin={handleLogin} onNeedsRegistration={handleNeedsRegistration} />
          </section>
        )}

        {registrationHint ? (
          <div className="auth-landing__notice auth-landing__notice--sticky">{registrationHint}</div>
        ) : null}
      </main>
    </div>
  )
}
