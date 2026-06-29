import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import '../styles/components/InviteModal.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4003')

export default function InviteModal({ open, onClose, tenantOptions = [] }) {
  const [form, setForm] = useState({ name: '', email: '', tenantKey: '', role: 'user' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const selectableTenants = tenantOptions.filter((tenant) => tenant?._id || tenant?.tenantKey)

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const submit = async () => {
    setBusy(true)
    setMessage('')
    try {
      const resp = await fetch(`${API_BASE_URL}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantKey: form.tenantKey, email: form.email, name: form.name, role: form.role })
      })
      const data = await resp.json()
      if (!resp.ok) {
        setMessage(data.error || 'Error creating invite')
      } else {
        setMessage('Invitación creada. Revisa el correo del destinatario.')
      }
    } catch (err) {
      setMessage(err.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="invite-modal-overlay" role="dialog" aria-modal="true" aria-label="Generar invitación" onMouseDown={onClose}>
      <div className="invite-modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="invite-modal-card__hero">
          <div className="invite-modal-card__badge">Acceso controlado</div>
          <div className="invite-modal-card__header">
            <div>
              <h3 className="invite-modal-card__title">Generar invitación</h3>
              <p className="invite-modal-card__subtitle">Crea un acceso con permisos definidos para una organización específica.</p>
            </div>
            <button type="button" className="invite-modal-card__close" onClick={onClose} aria-label="Cerrar modal">×</button>
          </div>
        </div>
        <div className="invite-modal-card__body">
          <p className="invite-modal-card__lead">Completa el formulario para generar una invitación y enviarla por correo al usuario seleccionado.</p>

          <div className="invite-modal-card__grid">
            <div className="invite-modal-card__field">
              <label className="invite-modal-card__label" htmlFor="invite-name">Nombre</label>
              <input
                id="invite-name"
                className="invite-modal-card__input"
                placeholder="Nombre del invitado"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="invite-modal-card__field">
              <label className="invite-modal-card__label" htmlFor="invite-email">Email</label>
              <input
                id="invite-email"
                className="invite-modal-card__input"
                placeholder="correo@empresa.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="invite-modal-card__field invite-modal-card__field--wide">
              <label className="invite-modal-card__label" htmlFor="invite-tenant">Organización</label>
              <select
                id="invite-tenant"
                className="invite-modal-card__input"
                value={form.tenantKey}
                onChange={(e) => setForm({ ...form, tenantKey: e.target.value })}
              >
                <option value="">Selecciona organización</option>
                  {selectableTenants.map((t) => <option key={t._id || t.tenantKey} value={t.tenantKey || t._id}>{t.companyName || t.tenantKey}</option>)}
              </select>
            </div>

            <div className="invite-modal-card__field">
              <label className="invite-modal-card__label" htmlFor="invite-role">Rol</label>
              <select
                id="invite-role"
                className="invite-modal-card__input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          {message ? <div className="invite-modal-card__message">{message}</div> : null}
        </div>
        <aside className="invite-modal-card__aside" aria-label="Resumen de invitación">
          <div className="invite-modal-card__aside-box">
            <h4 className="invite-modal-card__aside-title">Resumen</h4>
            <p className="invite-modal-card__aside-copy">Este panel aprovecha el ancho disponible y ayuda a que el modal se sienta más sólido, menos comprimido y más cercano a un formulario profesional.</p>
            <div className="invite-modal-card__aside-list">
              <div className="invite-modal-card__aside-item">
                <span className="invite-modal-card__aside-dot" />
                <div>
                  <strong>Datos claros</strong>
                  <span>Nombre, email, organización y rol separados con una jerarquía limpia.</span>
                </div>
              </div>
              <div className="invite-modal-card__aside-item">
                <span className="invite-modal-card__aside-dot" />
                <div>
                  <strong>Más aire visual</strong>
                  <span>El layout usa dos columnas en desktop para evitar la sensación de estrechez.</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <div className="invite-modal-card__footer">
          <button type="button" className="shadcn-btn ghost invite-modal-card__secondary" onClick={onClose}>Cerrar</button>
          <button type="button" className="shadcn-btn primary invite-modal-card__primary" onClick={submit} disabled={busy || !form.email || !form.tenantKey || selectableTenants.length === 0}>{busy ? 'Enviando...' : 'Generar y enviar'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
