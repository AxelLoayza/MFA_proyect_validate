
const { verifyToken } = require('../services/token.service');

async function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = await verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
  
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expirado' });
    return res.status(err.statusCode || 401).json({ error: 'Token inválido', details: err.message });
  }
}

module.exports = verifyJWT;
