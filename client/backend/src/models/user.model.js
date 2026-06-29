const pool = require('../config/database');

async function findByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0];
}

async function createUser({ email, password_hash, role = 'user', mfa_enabled = false }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, mfa_enabled)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [email, password_hash, role, mfa_enabled]
  );
  return rows[0];
}

module.exports = { findByEmail, createUser };
