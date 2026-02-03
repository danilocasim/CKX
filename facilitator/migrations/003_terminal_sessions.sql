-- Terminal session isolation: one terminal session per exam, bound to user_id + exam_session_id
-- exam_session_id is the exam ID (UUID) from Redis; no FK as exams are session state in Redis

CREATE TABLE IF NOT EXISTS terminal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_session_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  container_id VARCHAR(255),
  websocket_endpoint VARCHAR(512),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'terminated')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (exam_session_id)
);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_exam_session_id ON terminal_sessions(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_user_id ON terminal_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_status ON terminal_sessions(status);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_expires_at ON terminal_sessions(expires_at) WHERE status = 'active';

COMMENT ON TABLE terminal_sessions IS 'One terminal session per exam; bound to user_id + exam_session_id for isolation';
