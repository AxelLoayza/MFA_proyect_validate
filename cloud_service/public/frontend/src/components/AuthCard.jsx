import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { GoogleLogin } from '@react-oauth/google'
import { toast } from 'react-toastify'
import { loginWithGoogle, registerWithGoogle } from '../sdk'
import '../styles/components/AuthCard.css'

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

  useEffect(() => {
    if (!registerModalOpen || typeof document === 'undefined') return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [registerModalOpen])

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
    <div className="auth-card">
      <div className="auth-card__split">
        <section className="auth-card__visual" aria-hidden="true">
          <div className="auth-card__visual-overlay" />
          <div className="auth-card__visual-badge">
            <span className="auth-card__visual-icon">◈</span>
            <span>Acceso a panel de administrador</span>
          </div>
          <div className="auth-card__visual-copy">
            <p className="auth-card__visual-eyebrow">sistema de gestión</p>
            <h2 className="auth-card__visual-title">Gestión segura, clara y centralizada.</h2>
            <p className="auth-card__visual-text">Una experiencia de acceso pensada para iniciar sesión o registrarte con una lectura más limpia y profesional.</p>
          </div>
        </section>

        <section className="auth-card__content">
          <div className="auth-card__hero">
            <p className="auth-card__eyebrow">ARC secure access</p>
            <h1 className="auth-card__title">Accede o regístrate con Google</h1>
            <p className="auth-card__text">
              El flujo separa inicio de sesión y registro. Si tu correo no existe en MongoDB, el backend te pedirá registrarte.
            </p>
          </div>

          <section className="auth-card__actions">
            <div className="auth-card__action shadcn-card">
              <h2 className="auth-card__action-title">Iniciar sesión</h2>
              <p className="auth-card__action-text">Usa tu cuenta ya registrada para entrar al dashboard.</p>
              <div className="auth-card__action-center">
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

            <div className="auth-card__action auth-card__action--highlight shadcn-card">
              <h2 className="auth-card__action-title">Registrarse</h2>
              <p className="auth-card__action-text">Antes de continuar debes aceptar términos y condiciones.</p>
              <div className="auth-card__action-center">
                <button className="shadcn-btn primary auth-card__action-button" onClick={() => setRegisterModalOpen(true)} type="button">
                  Abrir términos y registro
                </button>
              </div>
            </div>
          </section>
        </section>
      </div>

      {notice ? <p className="auth-card__notice">{notice}</p> : null}
      {errorMessage ? <p className="auth-card__error">{errorMessage}</p> : null}

      {registerModalOpen && typeof document !== 'undefined' ? createPortal(
        <div className="invite-modal-overlay" role="dialog" aria-modal="true" aria-label="Términos de registro" onMouseDown={() => setRegisterModalOpen(false)}>
          <div className="modal-card shadcn-card auth-register-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="auth-register-modal__hero">
              <div className="auth-register-modal__badge">Registro seguro</div>
              <div className="auth-register-modal__header">
                <div>
                  <h3 className="auth-register-modal__title">Acuerdo de uso y condiciones</h3>
                  <p className="auth-register-modal__subtitle">Completa la información de tu organización y confirma los términos para activar el acceso.</p>
                </div>
                <button type="button" className="auth-register-modal__close" onClick={() => setRegisterModalOpen(false)} aria-label="Cerrar modal">
                  ×
                </button>
              </div>
            </div>
            <div className="auth-register-modal__body">
              <p className="auth-register-modal__lead">{termsText}</p>
              <div className="auth-register-modal__grid">
                <div className="auth-register-modal__field">
                  <label className="auth-register-modal__label">Nombre de la empresa</label>
                  <input className="auth-register-modal__input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </div>
                <div className="auth-register-modal__field">
                  <label className="auth-register-modal__label">Dominio (opcional)</label>
                  <input className="auth-register-modal__input" value={domain} onChange={(e) => setDomain(e.target.value)} />
                </div>
                <div className="auth-register-modal__field auth-register-modal__field--wide">
                  <label className="auth-register-modal__label">Tenant Key (clave única)</label>
                  <input className="auth-register-modal__input" value={tenantKey} onChange={(e) => setTenantKey(e.target.value)} placeholder="tenant_alfa" />
                </div>
              </div>
              <label className="auth-register-modal__checkbox">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span>He leído los términos y condiciones y estoy de acuerdo.</span>
              </label>
            </div>
            <aside className="auth-register-modal__aside" aria-label="Resumen de registro">
              <div className="auth-register-modal__aside-box">
                <h4 className="auth-register-modal__aside-title">Antes de continuar</h4>
                <p className="auth-register-modal__aside-copy">Usa este panel para dejar el registro más claro y profesional, con el mismo lenguaje visual del modal de invitación.</p>
                <div className="auth-register-modal__aside-list">
                  <div className="auth-register-modal__aside-item">
                    <span className="auth-register-modal__aside-dot" />
                    <div>
                      <strong>Empresa</strong>
                      <span>Define el contexto de tu organización.</span>
                    </div>
                  </div>
                  <div className="auth-register-modal__aside-item">
                    <span className="auth-register-modal__aside-dot" />
                    <div>
                      <strong>Dominio y tenant</strong>
                      <span>Ayudan a validar y separar el acceso.</span>
                    </div>
                  </div>
                  <div className="auth-register-modal__aside-item">
                    <span className="auth-register-modal__aside-dot" />
                    <div>
                      <strong>Consentimiento</strong>
                      <span>Debes aceptar los términos para activar el flujo.</span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
            <div className="auth-register-modal__footer">
              <button type="button" className="shadcn-btn ghost auth-register-modal__secondary" onClick={() => setRegisterModalOpen(false)}>
                Cancelar
              </button>
              <div className={canProceedRegister ? 'google-action' : 'google-action google-action--disabled'}>
                {canProceedRegister ? (
                  <GoogleLogin
                    onSuccess={async (response) => {
                      // create tenant then register with tenantKey
                      if (!tenantKey.trim() || !companyName.trim()) {
                        toast.error('Completa el nombre de la empresa y el tenant key para continuar.')
                        return
                      }

                      setBusy(true)
                      setErrorMessage('')
                      try {
                        const sdk = await import('../sdk')
                        const ct = await sdk.createTenant({ tenantKey, companyName, domain })
                        if (!ct.ok && ct.status !== 409) {
                          toast.error(ct.message || ct.error || 'Error creando tenant')
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
                          toast.success('Registro completado con éxito.')
                          setBusy(false)
                          return
                        }
                        toast.error(reg.message || reg.error || 'Error registrando usuario')
                      } catch (err) {
                        toast.error(err?.message || 'Error en registro')
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
                  <button type="button" className="primary-button primary-button--disabled auth-register-modal__primary" disabled>
                    Acepta los términos para continuar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

    </div>
  )
}
