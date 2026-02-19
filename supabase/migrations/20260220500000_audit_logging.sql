-- ============================================================================
-- AUDIT LOGGING SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only super admins can view audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND system_role = 'admin'
    )
  );

-- Helper function to log actions
CREATE OR REPLACE FUNCTION log_audit_event(
  p_actor_id UUID,
  p_action_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_logs (
    actor_id, action_type, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_actor_id, p_action_type, p_entity_type, p_entity_id, p_old_data, p_new_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS FOR SENSITIVE ACTIONS
-- ============================================================================

-- 1. Profile Verification Changes
CREATE OR REPLACE FUNCTION audit_profile_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.verification_status IS DISTINCT FROM NEW.verification_status THEN
    PERFORM log_audit_event(
      auth.uid(),
      'verification_status_changed',
      'profile',
      NEW.id,
      jsonb_build_object('status', OLD.verification_status),
      jsonb_build_object('status', NEW.verification_status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_profile_verification
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_profile_verification();

-- 2. System Role Changes (Admin promotions/demotions)
CREATE OR REPLACE FUNCTION audit_system_role()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.system_role IS DISTINCT FROM NEW.system_role THEN
    PERFORM log_audit_event(
      auth.uid(),
      'system_role_changed',
      'profile',
      NEW.id,
      jsonb_build_object('role', OLD.system_role),
      jsonb_build_object('role', NEW.system_role)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_system_role
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_system_role();

-- 3. Financial Transactions (Purchases)
CREATE OR REPLACE FUNCTION audit_purchase()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_audit_event(
    NEW.buyer_id,
    'purchase_created',
    'purchase',
    NEW.id,
    NULL,
    jsonb_build_object('amount', NEW.amount, 'post_id', NEW.post_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_purchase
  AFTER INSERT ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION audit_purchase();
