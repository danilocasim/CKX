#!/bin/bash
# Run migration 005_exam_sessions.sql
# This creates the exam_sessions table required by Sailor-Client

echo "Running migration 005_exam_sessions.sql..."

docker compose exec postgres psql -U ckx -d ckx <<EOF
-- Exam Sessions Table (owned by Sailor-Client Control Plane)
-- This table stores exam session records created by Sailor-Client
-- CKX Execution Engine does NOT create records here - it only reads runtime metadata

CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_id VARCHAR(255) NOT NULL,
  exam_type VARCHAR(20) NOT NULL CHECK (exam_type IN ('mock', 'full')),
  status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'active', 'terminated', 'completed')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_user_id ON exam_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_sessions(status);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_expires_at ON exam_sessions(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user_status ON exam_sessions(user_id, status) WHERE status = 'active';

COMMENT ON TABLE exam_sessions IS 'Exam session records owned by Sailor-Client. CKX Execution Engine does not create records here.';
EOF

echo "Migration completed!"
