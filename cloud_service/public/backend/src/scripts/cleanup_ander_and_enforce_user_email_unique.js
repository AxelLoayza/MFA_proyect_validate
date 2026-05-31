require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Tenant = require('../models/tenant');
const User = require('../models/user');
const BiometricProfile = require('../models/biometricProfile');
const ArcSession = require('../models/arcSession');
const TenantInvite = require('../models/tenantInvite');

function matchesAnder(value) {
  return typeof value === 'string' && /ander/i.test(value);
}

function normalizeEmail(value) {
  return value ? String(value).trim().toLowerCase() : null;
}

function isAnderTenant(tenant) {
  return [tenant?.tenantKey, tenant?.companyName, tenant?.domain].some(matchesAnder);
}

function isAnderUser(user, allowedTenantIds) {
  if (!user) return false;
  if (allowedTenantIds.has(String(user.tenantId))) return true;
  if ([user.googleId, user.email, user.name, user.tenantKey].some(matchesAnder)) return true;
  const tenant = user.tenant || {};
  return [tenant.key, tenant.tenantKey].some(matchesAnder) || allowedTenantIds.has(String(tenant._id || tenant.tenantId || ''));
}

function isAnderInvite(invite, allowedTenantIds) {
  if (!invite) return false;
  if (allowedTenantIds.has(String(invite.tenantId))) return true;
  return [invite.email, invite.name, invite.tenantKey].some(matchesAnder);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME || 'mfa_biometric'
  });

  const tenants = await Tenant.find().lean();
  const allowedTenants = tenants.filter(isAnderTenant);
  const allowedTenantIds = new Set(allowedTenants.map((tenant) => String(tenant._id)));

  const users = await User.find().lean();
  const allowedUsers = users.filter((user) => isAnderUser(user, allowedTenantIds));
  const allowedUserIds = new Set(allowedUsers.map((user) => String(user._id)));

  for (const user of allowedUsers) {
    const email = normalizeEmail(user.email);
    if (email && email !== user.email) {
      await User.updateOne({ _id: user._id }, { $set: { email } });
    }
  }

  const keepUserIdsByEmail = new Map();
  const usersByEmail = new Map();
  for (const user of allowedUsers) {
    const email = normalizeEmail(user.email);
    if (!email) continue;
    const bucket = usersByEmail.get(email) || [];
    bucket.push(user);
    usersByEmail.set(email, bucket);
  }

  for (const [email, bucket] of usersByEmail.entries()) {
    const sorted = bucket
      .map((user) => ({
        user,
        priority: isAnderUser(user, allowedTenantIds) ? 1 : 0,
        createdAt: user.createdAt ? new Date(user.createdAt).getTime() : 0,
      }))
      .sort((left, right) => {
        if (right.priority !== left.priority) return right.priority - left.priority;
        return right.createdAt - left.createdAt;
      });

    keepUserIdsByEmail.set(email, String(sorted[0].user._id));
    for (const entry of sorted.slice(1)) {
      allowedUserIds.delete(String(entry.user._id));
    }
  }

  const keepUserIdSet = new Set([...allowedUserIds, ...keepUserIdsByEmail.values()].map(String));
  const keepTenantIdSet = new Set([...allowedTenantIds].map(String));

  const tenantDeleteResult = await Tenant.deleteMany({ _id: { $nin: [...keepTenantIdSet] } });
  const userDeleteResult = await User.deleteMany({ _id: { $nin: [...keepUserIdSet] } });
  const biometricDeleteResult = await BiometricProfile.deleteMany({
    $and: [
      { tenantId: { $nin: [...keepTenantIdSet] } },
      { userId: { $nin: [...keepUserIdSet] } }
    ]
  });
  const sessionDeleteResult = await ArcSession.deleteMany({
    $and: [
      { tenantId: { $nin: [...keepTenantIdSet] } },
      { userId: { $nin: [...keepUserIdSet] } }
    ]
  });
  const inviteDeleteResult = await TenantInvite.deleteMany({
    $and: [
      { tenantId: { $nin: [...keepTenantIdSet] } },
      {
        $and: [
          { email: { $not: /ander/i } },
          { name: { $not: /ander/i } },
          { tenantKey: { $not: /ander/i } }
        ]
      }
    ]
  });

  const existingIndexes = await User.collection.indexes();
  if (existingIndexes.some((index) => index.name === 'email_1')) {
    await User.collection.dropIndex('email_1');
  }
  await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'uniq_user_email_sparse' });

  const summary = {
    tenantsDeleted: tenantDeleteResult.deletedCount || 0,
    usersDeleted: userDeleteResult.deletedCount || 0,
    biometricProfilesDeleted: biometricDeleteResult.deletedCount || 0,
    arcSessionsDeleted: sessionDeleteResult.deletedCount || 0,
    invitesDeleted: inviteDeleteResult.deletedCount || 0,
    keptTenants: keepTenantIdSet.size,
    keptUsers: keepUserIdSet.size
  };

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
