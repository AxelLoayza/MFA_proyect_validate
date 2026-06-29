import React from 'react'
import { GoogleLogin } from '@react-oauth/google'

export default function LoginButton({ onLogin }) {
  const handleSuccess = async (credentialResponse) => {
    const id_token = credentialResponse.credential
    // Send to backend to validate and create session
    const resp = await fetch('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token })
    })
    const data = await resp.json()
    if (data.token) {
      // store token and user
      localStorage.setItem('mfa_token', data.token)
      onLogin(data.user)
    } else {
      console.error('Login failed', data)
    }
  }

  const handleError = () => {
    console.error('Google Sign-In error')
  }

  return (
    <GoogleLogin onSuccess={handleSuccess} onError={handleError} />
  )
}
