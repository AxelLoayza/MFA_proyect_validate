const express = require('express');
const router = express.Router();
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const mongoose = require('mongoose');
const crypto = require('crypto');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const User = require('../models/user');
const ArcSession = require('../models/arcSession');

async function verifyIdToken(idToken) {
  const allowed = process.env.GOOGLE_ALLOWED_CLIENT_IDS
    ? process.env.GOOGLE_ALLOWED_CLIENT_IDS.split(',').map(s => s.trim())
    : process.env.GOOGLE_CLIENT_ID;
  const ticket = await client.verifyIdToken({ idToken, audience: allowed });
  return ticket.getPayload();
}

router.post('/google', async (req, res) => {
  try {
    const { id_token, action = 'login' } = req.body;
    if (!id_token) return res.status(400).json({ error: 'id_token required' });

    const payload = await verifyIdToken(id_token);
    const { sub: googleId, email, name } = payload;

    let user = await User.findOne({ googleId }).lean();

    if (!user && action === 'login') {
      return res.status(404).json({ error: 'needs_registration', message: 'El correo no está registrado. Debes completar el registro primero.' });
    }

    if (!user && action === 'register') {
      const { tenantKey } = req.body;
      if (!tenantKey) return res.status(400).json({ error: 'missing_tenantKey', message: 'tenantKey is required to register' });
      const Tenant = require('../models/tenant');
      const tenant = await Tenant.findOne({ tenantKey }).lean();
      if (!tenant) return res.status(404).json({ error: 'tenant_not_found', message: 'Tenant not found for tenantKey' });

      user = await User.create({
        googleId,
        email,
        name,
        role: 'superadmin',
        biometricTemplate: null,
        tenantId: tenant._id,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      user = user.toObject();
    }

    if (user && action === 'register') {
      return res.status(409).json({ error: 'already_registered', message: 'Este correo ya está registrado. Usa iniciar sesión.' });
    }

    if (!user) {
      return res.status(404).json({ error: 'needs_registration', message: 'El correo no está registrado. Debes completar el registro primero.' });
    }

    // Sign server JWT with RS256 and record session (ARC)
    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        name: user.name
      },
      privateKey,
      { algorithm: 'RS256', expiresIn: expirationSeconds, jwtid: jti }
    );

    // Persist arc session
    const amr = payload.amr || [];
    const arcSession = new ArcSession({
      jti,
      userId: user._id,
      clientId: process.env.GOOGLE_CLIENT_ID,
      acr: payload.acr || null,
      amr,
      expiresAt: new Date(Date.now() + expirationSeconds * 1000)
    });
    await arcSession.save();

    res.json({ token, user, arcSessionId: arcSession._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'auth_failed', details: err.message });
  }
});

/**
 * Endpoint para SDK: Verifica Google id_token y emite ARC 0.5
 * 
 * Flujo:
 * 1. SDK recibe id_token de Backend Node.js
 * 2. SDK lo pasa a Cloud Service aquí
 * 3. Cloud Service verifica con Google (tiene CLIENT_SECRET)
 * 4. Busca usuario en BD:
 *    a) Si existe en users → emite ARC 0.5
 *    b) Si existe en tenant_invites → crea user y emite ARC 0.5
 *    c) Si no existe → retorna error needs_registration
 * 5. Retorna ARC 0.5 token al SDK
 */
router.post('/google/verify-arc-05', async (req, res) => {
  try {
    const { id_token } = req.body;
    
    if (!id_token) {
      return res.status(400).json({
        error: 'id_token_required',
        message: 'Google id_token is required'
      });
    }

    console.log('[Cloud Service] Verificando Google token para ARC 0.5...');

    // Paso 1: Verificar id_token con Google
    const payload = await verifyIdToken(id_token);
    const { sub: googleId, email, name } = payload;

    console.log(`[Cloud Service] Google token válido para ${email}`);

    // Paso 2: Buscar usuario en collection users
    let user = await User.findOne({ googleId }).lean();

    if (!user) {
      // Paso 2b: Si no está en users, buscar en tenant_invites
      const TenantInvite = require('../models/tenantInvite');
      const invite = await TenantInvite.findOne({
        email: email,
        status: 'pending',
        expiresAt: { $gt: new Date() }  // No expirada
      }).lean();

      if (invite) {
        // Crear nuevo usuario desde la invitación
        console.log(`[Cloud Service] Usuario en tenant_invites, creando user...`);
        
        user = await User.create({
          googleId,
          email,
          name: name || invite.name || '',
          role: invite.role || 'user',
          biometricTemplate: null,
          tenantId: invite.tenantId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        user = user.toObject();

        // Marcar invitación como aceptada
        await TenantInvite.findByIdAndUpdate(
          invite._id,
          { status: 'accepted' },
          { new: true }
        );

        console.log(`[Cloud Service] ✓ Usuario creado desde invitación`);
      } else {
        // No está ni en users ni en tenant_invites válida
        return res.status(404).json({
          error: 'needs_registration',
          message: 'Usuario no registrado. Requiere invitación válida.'
        });
      }
    }

    // Paso 3: Generar ARC 0.5 token
    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();

    // Crear token ARC 0.5 completo
    const arcToken = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId?.toString(),
        arc: {
          acr: 'urn:arc:level:0.5',
          amr: ['federated']  // Solo Google
        }
      },
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: expirationSeconds,
        jwtid: jti
      }
    );

    // Paso 4: Guardar sesión ARC
    const arcSession = new ArcSession({
      jti,
      userId: user._id,
      clientId: process.env.GOOGLE_CLIENT_ID,
      acr: 'urn:arc:level:0.5',
      amr: ['federated'],
      expiresAt: new Date(Date.now() + expirationSeconds * 1000)
    });
    await arcSession.save();

    console.log(`[Cloud Service] ✓ ARC 0.5 token generado para ${user.email}`);

    // Paso 5: Retornar a SDK
    res.status(200).json({
      success: true,
      access_token: arcToken,
      token_type: 'Bearer',
      arc: '0.5',
      amr: ['federated'],
      user: {
        sub: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role
      },
      arcSessionId: arcSession._id,
      expires_in: expirationSeconds
    });

  } catch (err) {
    console.error('[Cloud Service] Error en google/verify-arc-05:', err);
    res.status(500).json({
      error: 'verification_failed',
      message: err.message || 'Google verification failed'
    });
  }
});

/**
 * Nuevo endpoint: verificar usando Google `access_token` (cuando no hay id_token)
 * Recibe { access_token: "ya29..." }
 */
router.post('/google/verify-access', async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token) return res.status(400).json({ error: 'access_token_required', message: 'Google access_token is required' });

    console.log('[Cloud Service] Verificando Google access_token para ARC 0.5...');

    // Llamar al endpoint userinfo de Google para obtener sub/email/name
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json'
      }
    });

    if (!userinfoRes.ok) {
      const errorText = await userinfoRes.text();
      return res.status(400).json({ error: 'google_userinfo_failed', message: errorText || 'Google userinfo request failed' });
    }

    const payload = await userinfoRes.json(); // contiene sub, email, name, etc.
    const { sub: googleId, email, name } = payload;

    if (!googleId || !email) {
      return res.status(400).json({ error: 'invalid_token', message: 'Google access_token did not return valid profile' });
    }

    console.log(`[Cloud Service] Google access_token válido para ${email}`);

    // Buscar usuario en collection users
    let user = await User.findOne({ googleId }).lean();

    if (!user) {
      const TenantInvite = require('../models/tenantInvite');
      const invite = await TenantInvite.findOne({
        email: email,
        status: 'pending',
        expiresAt: { $gt: new Date() }
      }).lean();

      if (invite) {
        user = await User.create({
          googleId,
          email,
          name: name || invite.name || '',
          role: invite.role || 'user',
          biometricTemplate: null,
          tenantId: invite.tenantId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        user = user.toObject();
        await TenantInvite.findByIdAndUpdate(invite._id, { status: 'accepted' }, { new: true });
        console.log(`[Cloud Service] ✓ Usuario creado desde invitación (access_token flow)`);
      } else {
        return res.status(404).json({ error: 'needs_registration', message: 'Usuario no registrado. Requiere invitación válida.' });
      }
    }

    // Generar ARC 0.5 token
    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();

    const arcToken = jwt.sign({
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId?.toString(),
      arc: { acr: 'urn:arc:level:0.5', amr: ['federated'] }
    }, privateKey, { algorithm: 'RS256', expiresIn: expirationSeconds, jwtid: jti });

    const arcSession = new ArcSession({ jti, userId: user._id, clientId: process.env.GOOGLE_CLIENT_ID, acr: 'urn:arc:level:0.5', amr: ['federated'], expiresAt: new Date(Date.now() + expirationSeconds * 1000) });
    await arcSession.save();

    console.log(`[Cloud Service] ✓ ARC 0.5 token (access_token flow) generado para ${user.email}`);

    res.status(200).json({ success: true, access_token: arcToken, token_type: 'Bearer', arc: '0.5', amr: ['federated'], user: { sub: user._id.toString(), email: user.email, name: user.name, role: user.role }, arcSessionId: arcSession._id, expires_in: expirationSeconds });

  } catch (err) {
    console.error('[Cloud Service] Error en google/verify-access:', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'verification_failed', message: err.message || 'Google verification failed' });
  }
});

/**
 * Endpoint para SDK: Intercambia authorization_code por ARC 0.5
 * 
 * Flujo Code Flow + PKCE:
 * 1. SDK recibe authorization_code de Backend Node.js
 * 2. Cloud Service intercambia code con Google (usa CLIENT_SECRET)
 * 3. Extrae sub, email, name del id_token resultante
 * 4. Busca/crea usuario en BD
 * 5. Firma y retorna ARC 0.5 token al SDK
 * 
 * Entrada:
 * {
 *   "code": "4/0AY0e-g...",
 *   "redirect_uri": "https://localhost:4000/api/auth/callback/google"
 * }
 * 
 * Salida:
 * {
 *   "success": true,
 *   "access_token": "arc_0.5_token",
 *   "arc": "0.5",
 *   "amr": ["federated"],
 *   "user": {...},
 *   "arcSessionId": "..."
 * }
 */
router.post('/google/exchange', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'code_required',
        message: 'Google authorization code is required'
      });
    }

    console.log('[Cloud Service] Intercambiando authorization_code con Google...');

    // Paso 1: POST a Google OAuth token endpoint usando form-urlencoded
    const tokenBody = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect_uri || `https://localhost:4000/api/auth/callback/google`,
      grant_type: 'authorization_code'
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString()
    });

    const tokenJson = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok) {
      return res.status(400).json({
        error: 'google_token_exchange_failed',
        message: tokenJson.error_description || tokenJson.error || 'Google token exchange failed'
      });
    }

    const { id_token, access_token: googleAccessToken } = tokenJson;

    if (!id_token) {
      return res.status(400).json({
        error: 'no_id_token',
        message: 'Google did not return id_token'
      });
    }

    console.log('[Cloud Service] ✓ Google retornó id_token, verificando...');

    // Paso 2: Verificar id_token con Google
    const payload = await verifyIdToken(id_token);
    const { sub: googleId, email, name } = payload;

    console.log(`[Cloud Service] Google token válido para ${email}`);

    // Paso 3: Buscar usuario en collection users
    let user = await User.findOne({ googleId }).lean();

    if (!user) {
      // Paso 3b: Si no está en users, buscar en tenant_invites
      const TenantInvite = require('../models/tenantInvite');
      const invite = await TenantInvite.findOne({
        email: email,
        status: 'pending',
        expiresAt: { $gt: new Date() }  // No expirada
      }).lean();

      if (invite) {
        // Crear nuevo usuario desde la invitación
        console.log(`[Cloud Service] Usuario en tenant_invites, creando user...`);
        
        user = await User.create({
          googleId,
          email,
          name: name || invite.name || '',
          role: invite.role || 'user',
          biometricTemplate: null,
          tenantId: invite.tenantId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        user = user.toObject();

        // Marcar invitación como aceptada
        await TenantInvite.findByIdAndUpdate(
          invite._id,
          { status: 'accepted' },
          { new: true }
        );

        console.log(`[Cloud Service] ✓ Usuario creado desde invitación`);
      } else {
        // No está ni en users ni en tenant_invites válida
        return res.status(404).json({
          error: 'needs_registration',
          message: 'Usuario no registrado. Requiere invitación válida.'
        });
      }
    }

    // Paso 4: Generar ARC 0.5 token (igual que en /google/verify-arc-05)
    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();

    const arcToken = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId?.toString(),
        arc: {
          acr: 'urn:arc:level:0.5',
          amr: ['federated']  // Google
        }
      },
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: expirationSeconds,
        jwtid: jti
      }
    );

    // Paso 5: Guardar sesión ARC
    const arcSession = new ArcSession({
      jti,
      userId: user._id,
      clientId: process.env.GOOGLE_CLIENT_ID,
      acr: 'urn:arc:level:0.5',
      amr: ['federated'],
      expiresAt: new Date(Date.now() + expirationSeconds * 1000)
    });
    await arcSession.save();

    console.log(`[Cloud Service] ✓ ARC 0.5 token generado para ${user.email}`);

    // Paso 6: Retornar a SDK
    res.status(200).json({
      success: true,
      access_token: arcToken,
      token_type: 'Bearer',
      arc: '0.5',
      amr: ['federated'],
      user: {
        sub: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role
      },
      arcSessionId: arcSession._id,
      expires_in: expirationSeconds
    });

  } catch (err) {
    console.error('[Cloud Service] Error en google/exchange:', err);
    
    // Manejo específico de errores de Google
    if (err.response?.data?.error) {
      return res.status(400).json({
        error: err.response.data.error,
        message: err.response.data.error_description || 'Google OAuth error'
      });
    }

    res.status(500).json({
      error: 'exchange_failed',
      message: err.message || 'Code exchange failed'
    });
  }
});

// Protected endpoint to get current user based on server JWT
const authenticate = require('../middleware/authenticate');
router.get('/me', authenticate, async (req, res) => {
  try {
    const sub = req.serverJwt && req.serverJwt.sub;
    if (!sub) return res.status(401).json({ error: 'invalid_token' });
    const user = await User.findById(sub).lean();
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;

