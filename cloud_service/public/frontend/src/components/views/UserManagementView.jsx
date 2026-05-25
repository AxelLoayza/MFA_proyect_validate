import React, { useState, useEffect } from 'react'
import InviteModal from '../InviteModal'

export default function UserManagementView() {
  const [modalOpen, setModalOpen] = useState(false)
  const [tenantOptions, setTenantOptions] = useState([])

  useEffect(() => {
    // fetch tenants for the select (simple)
    fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'}/tenants`).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setTenantOptions(d)
      else if (d.tenants) setTenantOptions(d.tenants)
    }).catch(() => {})
  }, [])

  return (
    <div className="view-card shadcn-card view-card--users">
      <h2 className="view-card__title">Gestión de usuarios</h2>

      {/* Search and filter row */}
      <div className="search-panel">
        <div className="search-row">
          <input className="shadcn-input" placeholder="Buscar usuarios..." />
          <button className="shadcn-btn ghost">Buscar</button>
          <select className="select shadcn-input">
            <option>Todos</option>
            <option>tenant_alpha</option>
            <option>tenant_beta</option>
          </select>
          <div style={{ marginLeft: 'auto' }}>
            <button type="button" className="shadcn-btn primary" onClick={() => { setModalOpen(true) }}>Generar invitación</button>
          </div>
        </div>
      </div>

      <div className="datagrid shadcn-card">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Organización</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr className="muted-row"><td colSpan="5">No hay usuarios (placeholder)</td></tr>
          </tbody>
        </table>
      </div>

      <InviteModal open={modalOpen} onClose={() => setModalOpen(false)} tenantOptions={tenantOptions} />
    </div>
  )
}
