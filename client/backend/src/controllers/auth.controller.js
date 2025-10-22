
const authService = require('../services/auth.service');
const logger = require('../config/logger');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.status(200).json({
      access_token: result.token,
      token_type: 'Bearer',
      arc: '0.5',
      userId: result.user.id,
      expires_in: parseInt(process.env.TEMP_TOKEN_TTL_SECONDS || '120', 10),
    });
  } catch (err) {
    next(err);
  }
}

async function stepUp(req, res, next) {
  try {
    const { signedAssertion } = req.body;
    if (!signedAssertion) return res.status(400).json({ error: 'signedAssertion required' });

    const finalToken = await authService.stepUp({ signedAssertion });
    res.status(200).json({
      access_token: finalToken,
      token_type: 'Bearer',
      arc: '1.0',
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

module.exports = { login, stepUp, devStepUp };
