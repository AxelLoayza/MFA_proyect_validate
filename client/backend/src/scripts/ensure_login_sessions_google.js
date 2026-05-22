const pool = require('../config/database');
const logger = require('../config/logger');

async function ensure() {
  try {
    await pool.connect();
    logger.info('Connected to DB, ensuring login_sessions table (Google ARC compatibility)');

    const cols = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='login_sessions'"
    );

    if (cols.rows.length === 0) {
      const createSql = `CREATE TABLE IF NOT EXISTS login_sessions (
        login_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        nonce TEXT,
        temp_token TEXT,
        final_token TEXT,
        role VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        provider VARCHAR(30) DEFAULT 'local',
        google_sub TEXT,
        google_email VARCHAR(255),
        google_client_id TEXT,
        arc_level VARCHAR(20),
        arc_session_id TEXT
      );`;

      await pool.query(createSql);
      logger.info('Created login_sessions table with Google-compatible columns');
      process.exit(0);
    }

    const getType = (name) => cols.rows.find((row) => row.column_name === name)?.data_type;
    const userIdType = getType('user_id');

    if (userIdType && userIdType !== 'uuid') {
      logger.error(`login_sessions.user_id type is ${userIdType}, expected uuid. Manual migration required.`);
      process.exit(1);
    }

    const alterSql = [
      'ALTER TABLE login_sessions ALTER COLUMN user_id DROP NOT NULL',
      "ALTER TABLE login_sessions ADD COLUMN IF NOT EXISTS provider VARCHAR(30) DEFAULT 'local'",
      'ALTER TABLE login_sessions ADD COLUMN IF NOT EXISTS google_sub TEXT',
      'ALTER TABLE login_sessions ADD COLUMN IF NOT EXISTS google_email VARCHAR(255)',
      'ALTER TABLE login_sessions ADD COLUMN IF NOT EXISTS google_client_id TEXT',
      'ALTER TABLE login_sessions ADD COLUMN IF NOT EXISTS arc_level VARCHAR(20)',
      'ALTER TABLE login_sessions ADD COLUMN IF NOT EXISTS arc_session_id TEXT',
      "ALTER TABLE login_sessions ALTER COLUMN status SET DEFAULT 'pending'",
      "ALTER TABLE login_sessions ALTER COLUMN created_at SET DEFAULT NOW()",
    ];

    for (const statement of alterSql) {
      await pool.query(statement);
    }

    logger.info('login_sessions table is Google-compatible');
    process.exit(0);
  } catch (err) {
    logger.error('ensure_login_sessions_google failed: ' + err.message);
    process.exit(1);
  }
}

if (require.main === module) ensure();

module.exports = { ensure };
