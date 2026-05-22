const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'local';

async function connect() {
  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });
  console.log('Connected to MongoDB', MONGO_DB_NAME);
}

module.exports = { connect };
