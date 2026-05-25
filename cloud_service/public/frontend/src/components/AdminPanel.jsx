import React, { useState } from 'react'
import ProfileView from './views/ProfileView'
import OrganizationsView from './views/OrganizationsView'
import UserManagementView from './views/UserManagementView'
import '../styles/components/AdminPanel.css'

export default function AdminPanel({ user, onLogout }) {
  const [active, setActive] = useState('profile')

  return (
    <div className="admin-panel">
      <div className="admin-panel__header">
        <div className="admin-panel__header-copy">
          <p className="admin-panel__eyebrow">Dashboard de administración</p>
          <h1 className="admin-panel__title">Bienvenido, {user.name}</h1>
          <p className="admin-panel__subtitle">Desde este panel puedes revisar el estado de tu cuenta, navegar entre módulos y gestionar usuarios con una vista más amplia y ordenada.</p>
        </div>
        <div className="admin-panel__status">
          <span className="admin-panel__status-pill">{user.role}</span>
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
