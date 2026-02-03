-- Runtime sessions: one isolated runtime (VNC + SSH containers) per user per exam.
-- Each runtime_session is bound to (user_id, exam_session_id) and stores container IDs.

CREATE TABLE IF NOT EXISTS runtime_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_session_id UUID NOT NULL,
  vnc_container_id VARCHAR(255),
  ssh_container_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'terminated')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (exam_session_id)
);

CREATE INDEX IF NOT EXISTS idx_runtime_sessions_exam_session_id ON runtime_sessions(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_user_id ON runtime_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_status ON runtime_sessions(status);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_expires_at ON runtime_sessions(expires_at) WHERE status = 'active';

COMMENT ON TABLE runtime_sessions IS 'One isolated runtime (VNC + SSH containers) per user per exam; never shared across users';
