const pool = require('../config/database');

async function createLoginSession({ login_id, user_id, nonce, temp_token, expires_at }) {
  const { rows } = await pool.query(
    `INSERT INTO login_sessions (login_id, user_id, nonce, temp_token, status, created_at, expires_at)
     VALUES ($1, $2, $3, $4, 'pending', NOW(), $5)
     RETURNING *`,
    [login_id, user_id, nonce, temp_token, expires_at]
  );
  return rows[0];
}

async function getSessionByLoginId(login_id) {
  const { rows } = await pool.query(
    'SELECT * FROM login_sessions WHERE login_id = $1',
    [login_id]
  );
  return rows[0];
}

async function markSessionCompleted(login_id, final_token) {
  await pool.query(
    `UPDATE login_sessions
     SET final_token = $1, status = 'completed', completed_at = NOW()
     WHERE login_id = $2`,
    [final_token, login_id]
  );
}

async function expireSession(login_id) {
  await pool.query(
    `UPDATE login_sessions SET status = 'expired' WHERE login_id = $1`,
    [login_id]
  );
}

module.exports = {
  createLoginSession,
  getSessionByLoginId,
  markSessionCompleted,
  expireSession
};
