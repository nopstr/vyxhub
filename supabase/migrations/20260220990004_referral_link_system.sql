-- Referral link system: resolve referrer by username instead of UUID
-- This supports the /r/@username referral link pattern

CREATE OR REPLACE FUNCTION record_referral_by_username(
  p_referrer_username TEXT,
  p_referred_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  -- Look up the referrer's profile by username
  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE username = LOWER(TRIM(p_referrer_username))
    AND is_creator = true;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'referrer_not_found');
  END IF;

  -- Don't allow self-referral
  IF v_referrer_id = p_referred_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'self_referral');
  END IF;

  INSERT INTO referrals (referrer_id, referred_user_id)
  VALUES (v_referrer_id, p_referred_user_id)
  ON CONFLICT (referrer_id, referred_user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'referrer_id', v_referrer_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
