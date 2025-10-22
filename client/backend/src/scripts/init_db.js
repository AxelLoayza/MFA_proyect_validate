const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const logger = require('../config/logger');

async function run() {
  const sqlPath = path.join(__dirname, '..', 'migrations', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await pool.connect();
    logger.info('Connected to DB, running migrations...');


  const idTypeRes = await pool.query("SELECT data_type FROM information_schema.columns WHERE lower(table_name)='users' AND column_name='id' AND table_schema='public'");
  const idType = idTypeRes.rows[0] && idTypeRes.rows[0].data_type;
    logger.info('Detected users.id type: ' + idType);

    if (idType === 'integer') {

      const createInt = `CREATE TABLE IF NOT EXISTS login_sessions (
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
      try {
        await pool.query(createInt);
        logger.info('Created/ensured integer login_sessions');
      } catch (e) {
        logger.warn('Failed creating integer login_sessions: ' + e.message);
      }
    } else {
 
      const statements = sql
        .split(/;\s*\n/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        try {
          await pool.query(stmt);
        } catch (e) {
          logger.warn('Migration statement failed (continuing): ' + e.message);
        }
      }
    }

    logger.info('Migrations applied');
    process.exit(0);
  } catch (err) {
    logger.error('Migration failed: ' + err.message);
    process.exit(1);
  }
}

if (require.main === module) run();

module.exports = { run };
