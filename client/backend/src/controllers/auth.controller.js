
const authService = require('../services/auth.service');
const { verifyGoogleToken, exchangeGoogleCode, registerGoogleToken } = require('../services/google.service');
const logger = require('../config/logger');
const axios = require('axios');
const pool = require('../config/database');
const TokenService = require('../services/token.service');
const { v4: uuidv4 } = require('uuid');

async function persistFederatedArcSession(result) {
  const loginId = uuidv4();
  const expiresInSeconds = parseInt(result?.expiresIn || '3600', 10);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  await pool.query(
    `INSERT INTO login_sessions (
      login_id,
      user_id,
      nonce,
      temp_token,
      status,
      created_at,
      expires_at,
      provider,
      arc_level,
      arc_session_id
    ) VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9)`,
    [
      loginId,
      null,
      result?.arcSessionId || null,
      null,
      'completed',
      expiresAt,
      'google',
      result?.arc || null,
      result?.arcSessionId || null,
    ]
  );
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    
    // Decodificar token para extraer login_id y nonce (necesarios para Flutter)
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(result.token);
    
    res.status(200).json({
      access_token: result.token,
      token_type: 'Bearer',
      arc: '0.5',
      userId: result.user.id,
      expires_in: parseInt(process.env.TEMP_TOKEN_TTL_SECONDS || '120', 10),
      login_id: decoded.login_id,  // Para vincular con step-up
      nonce: decoded.nonce          // Para validar assertion biométrico
    });
  } catch (err) {
    next(err);
  }
}

async function stepUp(req, res, next) {
  try {
    const bypassEnabled = process.env.BYPASS_CLOUD_ASSERTION === 'true';
    const { signedAssertion } = req.body;

    if (!bypassEnabled && !signedAssertion) return res.status(400).json({ error: 'signedAssertion required' });

    const payload = bypassEnabled
      ? { signedAssertion: req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null }
      : { signedAssertion };

    const finalToken = await authService.stepUp(payload);
    res.status(200).json({
      access_token: finalToken,
      token_type: 'Bearer',
      arc: bypassEnabled ? '1.0' : '1.0',
      expires_in: parseInt(process.env.FINAL_TOKEN_TTL_SECONDS || '900', 10),
    });
  } catch (err) {
    next(err);
  }
}

async function devStepUp(req, res, next) {
  if (process.env.NODE_ENV !== 'development') return res.status(403).json({ error: 'Not allowed' });
  try {
    const { login_id, score, confidence } = req.body;
    if (!login_id) return res.status(400).json({ error: 'login_id required' });

    const finalToken = await authService.devStepUp({ login_id, score, confidence });
    res.json({ access_token: finalToken, token_type: 'Bearer', arc: '2', expires_in: parseInt(process.env.FINAL_TOKEN_TTL_SECONDS || '900', 10) });
  } catch (err) {
    next(err);
  }
}

/**
 * Verifica Google id_token y delega a Cloud Service (vía SDK)
 * 
 * Flujo:
 * 1. Flutter envía id_token de Google
 * 2. Backend delega a SDK (ApiContainer)
 * 3. SDK delega a Cloud Service
 * 4. Cloud Service verifica con Google y retorna ARC 0.5
 */
async function googleVerify(req, res, next) {
  try {
    const { id_token, access_token } = req.body;

    if (!id_token && !access_token) {
      return res.status(400).json({
        error: 'token_required',
        message: 'Debes proporcionar id_token o access_token de Google'
      });
    }

    logger.info('[Auth Controller] Verificando Google token desde Flutter');

    // Delegar a SDK (que a su vez delega a Cloud Service)
    const tokenToVerify = id_token || access_token;
    const tokenType = id_token ? 'id_token' : 'access_token';
    const result = await verifyGoogleToken(tokenToVerify, tokenType, { action: 'login' });

    try {
      await persistFederatedArcSession(result);
    } catch (sessionErr) {
      logger.warn(`[Auth Controller] No se pudo persistir login_sessions federada: ${sessionErr.message}`);
    }

    logger.info(`[Auth Controller] ✓ ARC ${result.arc} token retornado a Flutter`);

    // Retornar a Flutter
    res.status(200).json({
      success: true,
      access_token: result.access_token,
      token_type: 'Bearer',
      arc: result.arc,                    // "0.5"
      amr: result.amr,                    // ["federated"]
      user: result.user,                  // { sub, email, name, ... }
      arcSessionId: result.arcSessionId,
      expires_in: result.expiresIn
    });

  } catch (err) {
    logger.error(`[Auth Controller] Error en googleVerify: ${err.message}`);
    res.status(err.statusCode || 500).json({
      error: err.message,
      details: err.details || err.response?.data?.details
    });
  }
}

/**
 * Registro inicial con Google + tenantKey.
 * El backend externo no firma token local: confía en el token firmado por Cloud Service.
 */
async function googleRegister(req, res, next) {
  try {
    const { id_token, access_token, tenantKey } = req.body;

    if (!tenantKey) {
      return res.status(400).json({ error: 'tenantKey required', message: 'tenantKey es obligatorio para registrar' });
    }

    if (!id_token && !access_token) {
      return res.status(400).json({
        error: 'token_required',
        message: 'Debes proporcionar id_token o access_token de Google',
      });
    }

    const tokenToVerify = id_token || access_token;
    const tokenType = id_token ? 'id_token' : 'access_token';

    logger.info(`[Auth Controller] Registrando usuario Google con tenantKey=${tenantKey}`);

    const result = await registerGoogleToken(tokenToVerify, tenantKey, tokenType);

    try {
      await persistFederatedArcSession(result);
    } catch (sessionErr) {
      logger.warn(`[Auth Controller] No se pudo persistir login_sessions federada (register): ${sessionErr.message}`);
    }

    return res.status(200).json({
      success: true,
      access_token: result.access_token,
      token_type: 'Bearer',
      arc: result.arc,
      amr: result.amr,
      user: result.user,
      arcSessionId: result.arcSessionId,
      expires_in: result.expiresIn,
    });
  } catch (err) {
    logger.error(`[Auth Controller] Error en googleRegister: ${err.message}`);
    return res.status(err.statusCode || 500).json({
      error: err.message,
      details: err.details || err.response?.data?.details,
    });
  }
}

// Start OAuth flow: redirect user to Google's authorization endpoint
async function googleStart(req, res, next) {
  try {
    const clientId = process.env.WEB_CLIENT_ID;
    const redirectUri = process.env.BACKEND_GOOGLE_REDIRECT || `https://localhost:${process.env.PORT || 4000}/api/auth/callback/google`;
    const state = uuidv4();

    // Store state in memory for demo (production: store in DB or cache)
    if (!global._oauthStates) global._oauthStates = new Set();
    global._oauthStates.add(state);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
  } catch (err) {
    next(err);
  }
}

// Callback endpoint that Google will call with ?code=...&state=...
async function googleCallback(req, res, next) {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('Missing code');
    if (!state || !global._oauthStates || !global._oauthStates.has(state)) {
      return res.status(400).send('Invalid state');
    }

    // remove state once used
    global._oauthStates.delete(state);

    const redirectUri = process.env.BACKEND_GOOGLE_REDIRECT || `https://localhost:${process.env.PORT || 4000}/api/auth/callback/google`;

    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', process.env.WEB_CLIENT_ID || '');
    params.append('client_secret', process.env.WEB_CLIENT_SECRET || '');
    params.append('redirect_uri', redirectUri);
    params.append('grant_type', 'authorization_code');

    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const tokenData = tokenRes.data; // contains access_token, id_token, refresh_token

    // Decode id_token to extract user info
    const jwt = require('jsonwebtoken');
    const idToken = tokenData.id_token;
    let decoded = {};
    try { decoded = jwt.decode(idToken); } catch (e) { /* ignore */ }

    const userSub = decoded.sub || decoded?.sub || null;
    const email = decoded.email || null;

    // Create a temporary login session and sign a temp token (arc 0.5)
    const loginId = uuidv4();
    const nonce = uuidv4();
    const tempPayload = {
      sub: userSub || email,
      email,
      login_id: loginId,
      nonce,
    };

    const tempToken = TokenService.signTempToken(tempPayload);

    // Insert into login_sessions table if Postgres is available
    try {
      const ttlSeconds = parseInt(process.env.TEMP_TOKEN_TTL_SECONDS || '120', 10);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await pool.query(
        `INSERT INTO login_sessions (login_id, user_id, nonce, temp_token, status, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [loginId, userSub || email, nonce, tempToken, 'completed', expiresAt]
      );
    } catch (e) {
      // Log but continue
      console.warn('Could not persist login_session:', e.message);
    }

    // Redirect back to frontend with temp token (dev only)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const redirectBack = new URL(frontendUrl);
    redirectBack.searchParams.set('temp_token', tempToken);

    return res.redirect(redirectBack.toString());
  } catch (err) {
    next(err);
  }
}

module.exports = { login, stepUp, devStepUp, googleVerify, googleRegister, googleExchange, enrollBiometric, googleStart, googleCallback };

async function googleExchange(req, res, next) {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        error: 'code required',
        message: 'Authorization code from Google is required'
      });
    }

    logger.info('[Auth Controller] Intercambiando authorization_code desde Flutter');
    
    // Delegar a SDK (que a su vez delega a Cloud Service)
    // Cloud Service tiene el CLIENT_SECRET y es quien intercambia con Google
    const result = await exchangeGoogleCode(code);

    logger.info(`[Auth Controller] ✓ ARC ${result.arc} token retornado a Flutter`);

    // Retornar a Flutter
    res.status(200).json({
      success: true,
      access_token: result.access_token,
      token_type: 'Bearer',
      arc: result.arc,                    // "0.5"
      amr: result.amr,                    // ["federated"]
      user: result.user,                  // { sub, email, name, ... }
      arcSessionId: result.arcSessionId,
      expires_in: result.expiresIn
    });

  } catch (err) {
    logger.error(`[Auth Controller] Error en googleExchange: ${err.message}`);
    res.status(err.statusCode || 500).json({
      error: err.message,
      details: err.details || err.response?.data?.details
    });
  }
}

async function enrollBiometric(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    const signatures = req.body?.signatures;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    if (!Array.isArray(signatures) || signatures.length !== 5) {
      return res.status(400).json({
        error: 'invalid_signatures',
        message: 'Se requieren exactamente 5 firmas para el enrolamiento'
      });
    }

    const cloudPublicBackendUrl = process.env.CLOUD_PUBLIC_BACKEND_URL || 'http://localhost:4003';

    logger.info('[Auth Controller] Delegando enrolamiento biométrico a Cloud Service público');

    const response = await axios.post(
      `${cloudPublicBackendUrl}/auth/enroll`,
      { signatures },
      {
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return res.status(response.status).json(response.data);
  } catch (err) {
    logger.error(`[Auth Controller] Error en enrollBiometric: ${err.message}`);

    if (err.response?.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }

    next(err);
  }
}
