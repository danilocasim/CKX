-- CKX Access Passes Schema
-- Phase 4: Payment MVP with Time-Based Access Passes

-- Pass type definitions
CREATE TABLE IF NOT EXISTS pass_types (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  duration_hours INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  features JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed pass types
INSERT INTO pass_types (id, name, duration_hours, price_cents, features) VALUES
  ('38_hours', '38 Hours Access Pass', 38, 499, '{"full_access": true, "instant_feedback": true, "unlimited_retakes": true}'),
  ('1_week', '1 Week Access Pass', 168, 1999, '{"full_access": true, "instant_feedback": true, "unlimited_retakes": true}'),
  ('2_weeks', '2 Weeks Access Pass', 336, 2999, '{"full_access": true, "instant_feedback": true, "unlimited_retakes": true, "priority_support": true}')
ON CONFLICT (id) DO NOTHING;

-- Access passes (time-based, not subscription)
CREATE TABLE IF NOT EXISTS access_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pass_type VARCHAR(20) NOT NULL REFERENCES pass_types(id),
  duration_hours INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  stripe_payment_id VARCHAR(100),
  stripe_checkout_session_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'purchased',  -- purchased, activated, expired
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activated_at TIMESTAMP WITH TIME ZONE,            -- NULL until user starts first exam
  expires_at TIMESTAMP WITH TIME ZONE,              -- Calculated: activated_at + duration
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_passes_user_status ON access_passes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_access_passes_expires ON access_passes(expires_at) WHERE status = 'activated';
CREATE INDEX IF NOT EXISTS idx_access_passes_stripe_session ON access_passes(stripe_checkout_session_id);

-- Add access_pass_id and exam_type to exam_attempts (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exam_attempts' AND column_name = 'access_pass_id'
  ) THEN
    ALTER TABLE exam_attempts ADD COLUMN access_pass_id UUID REFERENCES access_passes(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exam_attempts' AND column_name = 'exam_type'
  ) THEN
    ALTER TABLE exam_attempts ADD COLUMN exam_type VARCHAR(10) DEFAULT 'mock';
  END IF;
END $$;
