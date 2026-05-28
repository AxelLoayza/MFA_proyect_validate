import React, { useEffect, useMemo, useState } from 'react'
import InviteModal from '../InviteModal'
import { getManagedUsers } from '../../sdk'

function formatDate(value) {
  if (!value) return 'Sin sesiones'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Sin sesiones'

  return parsed.toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default function UserManagementView({ user }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedTenant, setSelectedTenant] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const tenantOptions = useMemo(() => {
    const memberships = user?.tenant?.memberships || user?.tenants || []

    return memberships
      .map((membership) => ({
        _id: membership?._id || membership?.tenantId || null,
        tenantKey: membership?.tenantKey || null,
        companyName: membership?.key || membership?.companyName || membership?.tenantKey || 'Tenant',
        role: membership?.role || user?.role || 'user',
        isPrimary: Boolean(membership?.isPrimary)
      }))
      .filter((membership) => membership._id || membership.tenantKey)
  }, [user])

  const selectedTenantLabel = useMemo(() => {
    const currentTenant = tenantOptions.find((item) => item._id === selectedTenant || item.tenantKey === selectedTenant)
    return currentTenant?.companyName || currentTenant?.tenantKey || 'Tenant activo'
  }, [selectedTenant, tenantOptions])

  useEffect(() => {
    const nextPrimaryTenant = tenantOptions.find((item) => item.isPrimary)?._id || tenantOptions[0]?._id || tenantOptions[0]?.tenantKey || ''
    if (nextPrimaryTenant) {
      setSelectedTenant(nextPrimaryTenant)
    }
  }, [tenantOptions])

  useEffect(() => {
    let isMounted = true

    async function loadUsers() {
      if (!selectedTenant) return

      setLoadingUsers(true)
      setErrorMessage('')

      try {
        const data = await getManagedUsers(selectedTenant)
        if (!isMounted) return

        setUsers(Array.isArray(data?.users) ? data.users : [])
      } catch (error) {
        if (isMounted) {
          setUsers([])
          setErrorMessage(error?.message || 'No se pudieron cargar los usuarios')
        }
      } finally {
        if (isMounted) setLoadingUsers(false)
      }
    }

    loadUsers()

    return () => {
      isMounted = false
    }
  }, [selectedTenant])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return users

    return users.filter((item) => {
      const tenantName = item?.tenant?.companyName || item?.tenant?.tenantKey || ''
      const lastSessionText = item?.lastSession?.createdAt || ''

      return [item?.name, item?.email, item?.role, tenantName, lastSessionText]
        .filter(Boolean)
        .some((value) => value.toString().toLowerCase().includes(query))
    })
  }, [search, users])

  return (
    <div className="view-card shadcn-card view-card--users">
      <h2 className="view-card__title">Gestión de usuarios</h2>

      {/* Search and filter row */}
      <div className="search-panel">
        <div className="search-row">
          <input
            className="shadcn-input"
            placeholder="Buscar por nombre, email, rol o empresa..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="select shadcn-input"
            value={selectedTenant}
            onChange={(event) => setSelectedTenant(event.target.value)}
          >
            {tenantOptions.map((tenant) => (
              <option key={tenant._id || tenant.tenantKey} value={tenant._id || tenant.tenantKey}>
                {tenant.companyName || tenant.tenantKey}
              </option>
            ))}
          </select>
          <span className="view-card__subtitle" style={{ margin: 0 }}>
            {selectedTenantLabel}
          </span>
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
              <th>Last sesión</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loadingUsers ? (
              <tr className="muted-row"><td colSpan="6">Cargando usuarios...</td></tr>
            ) : errorMessage ? (
              <tr className="muted-row"><td colSpan="6">{errorMessage}</td></tr>
            ) : filteredUsers.length ? (
              filteredUsers.map((item) => (
                <tr key={item._id}>
                  <td>{item.name || 'Sin nombre'}</td>
                  <td>{item.email || 'Sin email'}</td>
                  <td>{item.role || 'user'}</td>
                  <td>{selectedTenantLabel}</td>
                  <td>{formatDate(item?.lastSession?.createdAt)}</td>
                  <td>Aceptado</td>
                </tr>
              ))
            ) : (
              <tr className="muted-row"><td colSpan="6">No hay usuarios para el tenant seleccionado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <InviteModal open={modalOpen} onClose={() => setModalOpen(false)} tenantOptions={tenantOptions} />
    </div>
  )
}
