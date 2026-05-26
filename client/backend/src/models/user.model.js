const mongoose = require('mongoose');
const pool = require('../config/database');

const UserMongoSchema = new mongoose.Schema({}, {
  collection: 'users',
  strict: false,
  versionKey: false
});

const UserMongo = mongoose.models.UserMongo || mongoose.model('UserMongo', UserMongoSchema);

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

function objectIdCandidate(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function idCandidates(value) {
  const candidates = [String(value)];
  const objectId = objectIdCandidate(value);
  if (objectId) candidates.push(objectId);
  return candidates;
}

async function findActiveMongoUserByTenant({ userId, tenantId, tenantKey }) {
  const tenantOr = [];
  if (tenantId) {
    tenantOr.push({ tenantId: { $in: idCandidates(tenantId) } });
    tenantOr.push({ 'tenant._id': { $in: idCandidates(tenantId) } });
  }
  if (tenantKey) {
    tenantOr.push({ tenantKey });
    tenantOr.push({ 'tenant.key': tenantKey });
  }

  const query = {
    _id: { $in: idCandidates(userId) },
    $and: [
      {
        $or: [
          { status: { $in: ['Active', 'active', 'ACTIVE', 1, '1', true] } },
          { active: true },
          { isActive: true }
        ]
      }
    ]
  };

  if (tenantOr.length > 0) {
    query.$and.push({ $or: tenantOr });
  }

  return UserMongo.findOne(query).lean();
}

module.exports = {
  findByEmail,
  createUser,
  UserMongo,
  findActiveMongoUserByTenant,
  idCandidates
};
