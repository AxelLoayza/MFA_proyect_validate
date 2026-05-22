import React, { useState } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'

export default function InviteModal({ open, onClose, tenantOptions = [] }) {
  const [form, setForm] = useState({ name: '', email: '', tenantKey: '', role: 'user' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (!open) return null

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

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card shadcn-card">
        <div className="modal-card__header">
          <h3>Generar invitación</h3>
          <button className="shadcn-btn ghost modal-card__close" onClick={onClose}>×</button>
        </div>
        <div className="modal-card__body">
          <label className="modal-card__label">Nombre</label>
          <input className="shadcn-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />

          <label className="modal-card__label">Email</label>
          <input className="shadcn-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />

          <label className="modal-card__label">Organización</label>
          <select className="shadcn-input" value={form.tenantKey} onChange={e => setForm({ ...form, tenantKey: e.target.value })}>
            <option value="">Selecciona organización</option>
            {tenantOptions.map(t => <option key={t.tenantKey} value={t.tenantKey}>{t.companyName || t.tenantKey}</option>)}
          </select>

          <label className="modal-card__label">Rol</label>
          <select className="shadcn-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>

          {message ? <div style={{ marginTop: '0.6rem', color: '#bae6fd' }}>{message}</div> : null}
        </div>
        <div className="modal-card__footer">
          <button className="shadcn-btn ghost" onClick={onClose}>Cerrar</button>
          <button className="shadcn-btn primary" onClick={submit} disabled={busy || !form.email || !form.tenantKey}>{busy ? 'Enviando...' : 'Generar y enviar'}</button>
        </div>
      </div>
    </div>
  )
}
