const pool = require('../config/database');

async function getPolicyByName(name) {
  const { rows } = await pool.query(
    'SELECT * FROM policies WHERE name = $1 AND is_active = true',
    [name]
  );
  return rows[0];
}

async function listPolicies() {
  const { rows } = await pool.query(
    'SELECT * FROM policies WHERE is_active = true ORDER BY id'
  );
  return rows;
}

async function createPolicy({ name, acr_required, description, is_active = true }) {
  const { rows } = await pool.query(
    `INSERT INTO policies (name, acr_required, description, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, acr_required, description, is_active]
  );
  return rows[0];
}

module.exports = { getPolicyByName, listPolicies, createPolicy };
