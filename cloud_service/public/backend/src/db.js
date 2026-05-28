const mongoose = require('mongoose');

function inferDbNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    const pathname = parsed.pathname ? parsed.pathname.replace(/^\//, '') : '';
    return pathname || null;
  } catch (error) {
    return null;
  }
}

const rawMongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_URI = rawMongoUri.trim();
const MONGO_DB_NAME = (process.env.MONGO_DB_NAME || inferDbNameFromUri(MONGO_URI) || 'local').trim();

async function connect() {
  console.log('Connecting to MongoDB', MONGO_URI, 'dbName=', MONGO_DB_NAME);
  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });
  console.log('Connected to MongoDB', MONGO_DB_NAME);
}

module.exports = { connect };
