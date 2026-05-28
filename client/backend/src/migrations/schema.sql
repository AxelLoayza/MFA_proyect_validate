CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Minimal schema for external-token flow.
-- Cloud Service remains identity authority; this DB keeps local session coordination.

-- Usuarios locales (fallback/compatibilidad)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    mfa_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Políticas (compatibles con policy.models.js)
CREATE TABLE IF NOT EXISTS policies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    arc_required NUMERIC(2,1),
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE
);

-- Auditoría biométrica de step-up
CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        login_session_id UUID,
        validation_id TEXT,
        nonce TEXT,
        decision VARCHAR(20),
        confidence_score NUMERIC(5,4),
        assertion_jws TEXT,
        assertion_claims JSONB,
        device_fingerprint TEXT,
        ip_address TEXT,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    success BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_validation_id ON audit_events(validation_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);

-- Función esperada por auth.service.js
CREATE OR REPLACE FUNCTION register_biometric_validation(
    p_user_id UUID,
    p_login_session_id UUID,
    p_validation_id TEXT,
    p_nonce TEXT,
    p_decision VARCHAR,
    p_confidence_score NUMERIC,
    p_assertion_jws TEXT,
    p_assertion_claims JSONB,
    p_device_fingerprint TEXT,
    p_ip_address TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO audit_events (
        user_id,
        login_session_id,
        validation_id,
        nonce,
        decision,
        confidence_score,
        assertion_jws,
        assertion_claims,
        device_fingerprint,
        ip_address,
        event_type,
        event_data,
        success,
        created_at
    ) VALUES (
        p_user_id,
        p_login_session_id,
        p_validation_id,
        p_nonce,
        p_decision,
        p_confidence_score,
        p_assertion_jws,
        p_assertion_claims,
        p_device_fingerprint,
        p_ip_address,
        'biometric_validation',
        jsonb_build_object('validation_id', p_validation_id, 'decision', p_decision),
        CASE WHEN p_decision = 'accepted' THEN TRUE ELSE FALSE END,
        NOW()
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Coordinación de sesiones ARC temporales/finales
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

CREATE INDEX IF NOT EXISTS idx_login_sessions_login_id ON login_sessions(login_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_status ON login_sessions(status);
CREATE INDEX IF NOT EXISTS idx_login_sessions_expires_at ON login_sessions(expires_at);


