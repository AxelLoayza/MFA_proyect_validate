
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const logger = require('../config/logger');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

async function findByEmail(emailOrUsername) {

  let res = await pool.query("SELECT * FROM users WHERE email = $1", [emailOrUsername]).catch(() => null);
  if (res && res.rows && res.rows[0]) return res.rows[0];

  res = await pool.query("SELECT * FROM users WHERE username = $1", [emailOrUsername]).catch(() => null);
  return res && res.rows ? res.rows[0] : null;
}

async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
}

async function createUser({ email, password, role = 'user', mfa_enabled = false }) {
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role, mfa_enabled, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *`,
      [email, password_hash, role, mfa_enabled]
    );
    logger.info(`Usuario creado: ${email}`);
    return rows[0];
  } catch (e) {

    const username = email;
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, role, mfa_enabled) VALUES ($1,$2,$3,$4) RETURNING *`,
      [username, password_hash, role, mfa_enabled]
    );
    logger.info(`Usuario creado (fallback username): ${username}`);
    return rows[0];
  }
}

async function validatePassword(email, password) {
  const user = await findByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}

module.exports = { findByEmail, findById, createUser, validatePassword };
