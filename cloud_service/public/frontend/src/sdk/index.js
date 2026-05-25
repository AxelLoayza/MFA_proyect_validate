// Minimal SDK helper for frontend to call public backend

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'

export async function loginWithGoogle(id_token) {
  return authenticateWithGoogle(id_token, 'login')
}

export async function registerWithGoogle(id_token) {
  // legacy: registerWithGoogle(id_token, tenantKey)
  // support optional tenantKey
  const args = Array.from(arguments)
  const tenantKey = args[1]
  if (tenantKey) {
    const resp = await fetch(`${API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token, action: 'register', tenantKey })
    })
    const data = await resp.json()
    return { ok: resp.ok, status: resp.status, ...data }
  }
  return authenticateWithGoogle(id_token, 'register')
}

async function authenticateWithGoogle(id_token, action) {
  const resp = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token, action })
  })
  const data = await resp.json()
  return { ok: resp.ok, status: resp.status, ...data }
}

export async function createTenant({ tenantKey, companyName, domain, tier }) {
  const resp = await fetch(`${API_BASE_URL}/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantKey, companyName, domain, tier })
  })
  const data = await resp.json()
  return { ok: resp.ok, status: resp.status, ...data }
}

export async function getTenants() {
  const resp = await fetch(`${API_BASE_URL}/tenants`)
  return resp.json()
}

export async function getManagedUsers(tenantId) {
  const token = getAuthToken()
  const url = new URL(`${API_BASE_URL}/auth/users`)

  if (tenantId) {
    url.searchParams.set('tenantId', tenantId)
  }

  const resp = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  return resp.json()
}

export function getAuthToken() {
  return localStorage.getItem('mfa_token')
}

export async function getMe() {
  const token = getAuthToken()
  if (!token) return null
  const resp = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) return null
  return resp.json()
}
