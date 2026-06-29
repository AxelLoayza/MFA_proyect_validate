
const userService = require('../services/user.service');

async function register(req, res, next) {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' });

    const existing = await userService.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Usuario ya existe' });

    const user = await userService.createUser({ email, password, role });
    res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const userId = req.user && (req.user.sub || req.user.userId);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const user = await userService.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ id: user.id, email: user.email, role: user.role, created_at: user.created_at });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, me };
