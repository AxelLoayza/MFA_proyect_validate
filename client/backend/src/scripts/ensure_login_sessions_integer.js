const pool = require('../config/database');
const logger = require('../config/logger');

async function ensure() {
  try {
    await pool.connect();
    logger.info('Connected to DB, ensuring login_sessions table (integer user_id)');

    const cols = await pool.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='login_sessions'");
    if (cols.rows.length === 0) {
      const createSql = `CREATE TABLE IF NOT EXISTS login_sessions (
        login_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        nonce TEXT,
        temp_token TEXT,
        final_token TEXT,
        role VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      );`;
      await pool.query(createSql);
      logger.info('Created login_sessions with integer user_id');
      process.exit(0);
    } else {
      const uid = cols.rows.find(r => r.column_name === 'user_id');
      if (!uid) {
        logger.warn('login_sessions exists but has no user_id column');
        process.exit(1);
      }
      logger.info('login_sessions.user_id type: ' + uid.data_type);
      if (uid.data_type === 'integer') {
        logger.info('login_sessions already compatible (integer user_id)');
        process.exit(0);
      } else {
        logger.error('login_sessions exists with user_id type ' + uid.data_type + '. Manual migration required.');
        process.exit(1);
      }
    }
  } catch (err) {
    logger.error('ensure_login_sessions_integer failed: ' + err.message);
    process.exit(1);
  }
}

if (require.main === module) ensure();

module.exports = { ensure };
