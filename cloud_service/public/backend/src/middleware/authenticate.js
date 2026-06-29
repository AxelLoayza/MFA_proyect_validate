const fs = require('fs');
const jwt = require('jsonwebtoken');

function loadPublicKey() {
  const path = process.env.JWT_PUBLIC_KEY_PATH;
  if (!path) throw new Error('JWT_PUBLIC_KEY_PATH must be set');
  return fs.readFileSync(path, 'utf8');
}

const publicKey = (() => {
  try {
    return loadPublicKey();
  } catch (e) {
    console.warn('Could not load public key for JWT verification:', e.message);
    return null;
  }
})();

function authenticateMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_token' });
  const token = auth.slice('Bearer '.length);
  if (!publicKey) return res.status(500).json({ error: 'server_misconfigured' });
  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    req.serverJwt = decoded;
    next();
  } catch (err) {
    console.error('JWT verification failed', err.message);
    return res.status(401).json({ error: 'invalid_token', details: err.message });
  }
}

module.exports = authenticateMiddleware;
