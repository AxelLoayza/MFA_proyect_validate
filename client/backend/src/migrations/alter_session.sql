-- migrations/alter_session.sql
-- Compatibility migration for the external-client login flow.
-- Keeps PostgreSQL focused on session coordination, not on Mongo authority.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS login_sessions (
  login_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  nonce TEXT,
  temp_token TEXT,
  final_token TEXT,
  role VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  provider VARCHAR(30) DEFAULT 'local',
  arc_level VARCHAR(20),
  arc_session_id TEXT
);

ALTER TABLE login_sessions
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE login_sessions
  ADD COLUMN IF NOT EXISTS temp_token TEXT,
  ADD COLUMN IF NOT EXISTS final_token TEXT,
  ADD COLUMN IF NOT EXISTS role VARCHAR(50),
  ADD COLUMN IF NOT EXISTS provider VARCHAR(30) DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS arc_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS arc_session_id TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_status ON login_sessions(status);
CREATE INDEX IF NOT EXISTS idx_login_sessions_expires_at ON login_sessions(expires_at);
