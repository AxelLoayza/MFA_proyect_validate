-- migrations/alter_sessions.sql
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS login_id UUID,
  ADD COLUMN IF NOT EXISTS nonce TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
