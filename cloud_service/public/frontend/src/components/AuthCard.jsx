import React, { useMemo, useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { loginWithGoogle, registerWithGoogle } from '../sdk'

const termsText = `
Esta aplicación utiliza ARC 0.5 y gestión de ARC 1 para validar el acceso, registrar sesiones y proteger el uso autorizado del servicio.

Al registrarte aceptas:
- El uso de este servicio únicamente para fines permitidos por tu organización.
- El compromiso de cifrar firmas, credenciales y cualquier información de seguridad otorgada.
- La confidencialidad de toda información, acceso y material asociado a la empresa, sin compartirlo con terceros.
- La posibilidad de eliminación posterior de tu cuenta y de la información asociada, incluyendo datos de empresa, si decides salir del servicio luego de unas semanas o cuando sea solicitado por la organización.
- El tratamiento de tus datos para fines de autenticación, auditoría y control de acceso.
`

export default function AuthCard({ onLogin, onNeedsRegistration }) {
  const [registerModalOpen, setRegisterModalOpen] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [tenantKey, setTenantKey] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [domain, setDomain] = useState('')

  const canProceedRegister = useMemo(() => termsAccepted, [termsAccepted])

  const handleAuth = async (credentialResponse, action) => {
    const id_token = credentialResponse?.credential
    if (!id_token) return
    try {
      setBusy(true)
      setErrorMessage('')
      setNotice('')
      const response = action === 'register'
        ? await registerWithGoogle(id_token)
        : await loginWithGoogle(id_token)

      if (response.ok && response.token) {
        localStorage.setItem('mfa_token', response.token)
        const meResponse = await fetchMe()
        if (meResponse?.user) {
          onLogin(meResponse.user)
        }
        setRegisterModalOpen(false)
        setTermsAccepted(false)
        return
      }

      if (response.status === 404 && response.error === 'needs_registration') {
        setNotice(response.message || 'Este correo necesita registro primero.')
        onNeedsRegistration?.(response.message || 'Este correo necesita registro primero.')
        return
      }

      if (response.status === 409 && response.error === 'already_registered') {
        setNotice(response.message || 'Este correo ya está registrado. Inicia sesión.')
        return
      }

      setErrorMessage(response.message || response.error || 'No se pudo completar la autenticación')
    } catch (err) {
      setErrorMessage(err?.message || 'Error de autenticación')
    } finally {
      setBusy(false)
    }
  }

  async function fetchMe() {
    const token = localStorage.getItem('mfa_token')
    if (!token) return null
    const resp = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!resp.ok) return null
    return resp.json()
  }

  return (
    <div className="auth-landing">
      <section className="auth-landing__hero">
        <p className="hero-card__eyebrow">ARC secure access</p>
        <h1 className="hero-card__title">Accede o regístrate con Google</h1>
        <p className="hero-card__text">
          El flujo separa inicio de sesión y registro. Si tu correo no existe en MongoDB, el backend te pedirá registrarte.
        </p>
      </section>

      <section className="auth-landing__actions">
        <div className="action-card shadcn-card">
          <h2 className="action-card__title">Iniciar sesión</h2>
          <p className="action-card__text">Usa tu cuenta ya registrada para entrar al dashboard.</p>
          <div className="action-card__button">
            <GoogleLogin
              onSuccess={(response) => handleAuth(response, 'login')}
              onError={() => setErrorMessage('Google Sign-In error')}
              theme="outline"
              size="large"
              shape="pill"
              text={busy ? 'signin_with' : 'signin_with'}
            />
          </div>
        </div>

        <div className="action-card action-card--highlight shadcn-card">
          <h2 className="action-card__title">Registrarse</h2>
          <p className="action-card__text">Antes de continuar debes aceptar términos y condiciones.</p>
          <button className="shadcn-btn primary" onClick={() => setRegisterModalOpen(true)} type="button">
            Abrir términos y registro
          </button>
        </div>
      </section>

      {notice ? <p className="auth-landing__notice">{notice}</p> : null}
      {errorMessage ? <p className="auth-landing__error">{errorMessage}</p> : null}

      {registerModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Términos de registro">
          <div className="modal-card shadcn-card">
            <div className="modal-card__header">
              <h3>Acuerdo de uso y condiciones</h3>
              <button type="button" className="shadcn-btn ghost modal-card__close" onClick={() => setRegisterModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-card__body">
              <p className="modal-card__text">{termsText}</p>
              <div className="modal-card__fields">
                <label className="modal-card__label">Nombre de la empresa</label>
                <input className="shadcn-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                <label className="modal-card__label">Dominio (opcional)</label>
                <input className="shadcn-input" value={domain} onChange={(e) => setDomain(e.target.value)} />
                <label className="modal-card__label">Tenant Key (clave única)</label>
                <input className="shadcn-input" value={tenantKey} onChange={(e) => setTenantKey(e.target.value)} placeholder="tenant_alfa" />
              </div>
              <label className="modal-card__checkbox">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span>He leído los términos y condiciones y estoy de acuerdo.</span>
              </label>
            </div>
            <div className="modal-card__footer">
              <button type="button" className="shadcn-btn ghost" onClick={() => setRegisterModalOpen(false)}>
                Cancelar
              </button>
              <div className={canProceedRegister ? 'google-action' : 'google-action google-action--disabled'}>
                {canProceedRegister ? (
                  <GoogleLogin
                    onSuccess={async (response) => {
                      // create tenant then register with tenantKey
                      setBusy(true)
                      setErrorMessage('')
                      try {
                        const sdk = await import('../sdk')
                        const ct = await sdk.createTenant({ tenantKey, companyName, domain })
                        if (!ct.ok && ct.status !== 409) {
                          setErrorMessage(ct.message || ct.error || 'Error creando tenant')
                          setBusy(false)
                          return
                        }
                        const reg = await sdk.registerWithGoogle(response?.credential, tenantKey)
                        if (reg.ok && reg.token) {
                          localStorage.setItem('mfa_token', reg.token)
                          const meResponse = await fetchMe()
                          if (meResponse?.user) onLogin(meResponse.user)
                          setRegisterModalOpen(false)
                          setTermsAccepted(false)
                          setTenantKey('')
                          setCompanyName('')
                          setDomain('')
                          setBusy(false)
                          return
                        }
                        setErrorMessage(reg.message || reg.error || 'Error registrando usuario')
                      } catch (err) {
                        setErrorMessage(err?.message || 'Error en registro')
                      } finally {
                        setBusy(false)
                      }
                    }}
                    onError={() => setErrorMessage('Google Sign-In error')}
                    theme="outline"
                    size="large"
                    shape="pill"
                    text="signup_with"
                  />
                ) : (
                  <button type="button" className="primary-button primary-button--disabled" disabled>
                    Acepta los términos para continuar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
