import React, { useState } from 'react'
import ProfileView from './views/ProfileView'
import OrganizationsView from './views/OrganizationsView'
import UserManagementView from './views/UserManagementView'

export default function AdminPanel({ user, onLogout }) {
  const [active, setActive] = useState('profile')

  return (
    <div className="shadcn-card admin-panel">
      <div className="dashboard-card__header">
        <div>
          <p className="dashboard-card__eyebrow">Dashboard</p>
          <h1 className="dashboard-card__title">Bienvenido, {user.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="shadcn-btn ghost" onClick={onLogout}>Cerrar sesión</button>
          <span className="status-pill status-pill--success">{user.role}</span>
        </div>
      </div>

      <div className="admin-panel__body">
        <aside className="admin-panel__sidebar" aria-label="Sidebar">
          <div className="sidebar__brand">ARC</div>
          <nav className="sidebar__nav" role="tablist" aria-orientation="vertical">
            <button role="tab" aria-selected={active === 'profile'} className={`sidebar__tab ${active === 'profile' ? 'sidebar__tab--active' : ''} shadcn-btn`} onClick={() => setActive('profile')}>Perfil</button>
            {/* Organizations hidden for now */}
            <button role="tab" aria-selected={active === 'users'} className={`sidebar__tab ${active === 'users' ? 'sidebar__tab--active' : ''} shadcn-btn`} onClick={() => setActive('users')}>Gestión de usuarios</button>
          </nav>
          <div className="sidebar__foot">{user.email}</div>
        </aside>

        <section className="admin-panel__content">
          {active === 'profile' && <ProfileView user={user} />}
          {active === 'orgs' && <OrganizationsView />}
          {active === 'users' && <UserManagementView />}
        </section>
      </div>
    </div>
  )
}
