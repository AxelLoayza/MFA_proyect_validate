import React from 'react'

export default function OrganizationsView() {
  return (
    <div className="view-card shadcn-card view-card--orgs">
      <h2 className="view-card__title">Organizaciones</h2>
      <p className="muted">Listado de tenants asociados (diseño estático por ahora).</p>
      <div className="orgs-grid">
        <article className="org-card">
          <h3>tenant_alpha</h3>
          <p className="muted">Acme Corp — activo</p>
        </article>
        <article className="org-card">
          <h3>tenant_beta</h3>
          <p className="muted">Beta Ltd — activo</p>
        </article>
      </div>
    </div>
  )
}
