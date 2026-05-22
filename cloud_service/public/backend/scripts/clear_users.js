// Script to delete all users from the configured MongoDB database.
// Usage: NODE_ENV=production MONGO_URI="mongodb://..." MONGO_DB_NAME="db" node scripts/clear_users.js

const mongoose = require('mongoose')
const path = require('path')

// load env from project root .env if present
try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') })
} catch (e) {
  // dotenv optional
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017'
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'local'

async function main() {
  console.log('Connecting to', MONGO_URI, 'dbName=', MONGO_DB_NAME)
  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME })

  // require User model from project
  const User = require(path.resolve(__dirname, '..', 'src', 'models', 'user'))

  const before = await User.countDocuments()
  console.log('Users before:', before)

  const res = await User.deleteMany({})
  console.log('Delete result:', res)

  const after = await User.countDocuments()
  console.log('Users after:', after)

  await mongoose.disconnect()
  console.log('Done')
}

main().catch(err => {
  console.error('Error clearing users:', err)
  process.exit(1)
})
