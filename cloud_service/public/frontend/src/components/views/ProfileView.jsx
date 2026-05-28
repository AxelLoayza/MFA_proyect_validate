import React from 'react'

export default function ProfileView({ user }) {
  const memberships = user?.tenant?.memberships || []
  const primaryTenant = user?.tenant?.key || user?.tenant?.tenantKey || user?.tenantId || '—'

  return (
    <div className="view-card shadcn-card view-card--profile">
      <h2 className="view-card__title">Perfil</h2>
      <div className="profile-grid">
        <div className="profile-card">
          <div className="avatar-placeholder">{user.name ? user.name.charAt(0) : '?'}</div>
        </div>
        <div className="profile-info">
          <div className="profile-row"><strong>Nombre:</strong> {user.name}</div>
          <div className="profile-row"><strong>Email:</strong> {user.email}</div>
          <div className="profile-row"><strong>Rol:</strong> {user.role}</div>
          <div className="profile-row"><strong>Tenant principal:</strong> {primaryTenant}</div>
          <div className="profile-row"><strong>Membresías:</strong> {memberships.length}</div>
        </div>
      </div>
    </div>
  )
}
