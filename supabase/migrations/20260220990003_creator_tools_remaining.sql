-- ============================================================================
-- Creator Tools: Scheduled Messages, Promotional Pricing, Referral System
-- ============================================================================

-- ─── 1. SCHEDULED MESSAGES ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL CHECK (LENGTH(TRIM(content)) > 0 AND LENGTH(content) <= 2000),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'voice')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'sent', 'failed')),
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_creator ON scheduled_messages(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending ON scheduled_messages(status, scheduled_at)
  WHERE status = 'pending';

ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view own scheduled messages" ON scheduled_messages
  FOR SELECT USING (auth.uid() = creator_id);

CREATE POLICY "Creators can insert scheduled messages" ON scheduled_messages
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators can update own scheduled messages" ON scheduled_messages
  FOR UPDATE USING (auth.uid() = creator_id);

-- Schedule a mass message for later delivery
CREATE OR REPLACE FUNCTION schedule_mass_message(
  p_creator_id UUID,
  p_content TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_message_type TEXT DEFAULT 'text'
) RETURNS JSONB AS $$
DECLARE
  v_is_creator BOOLEAN;
BEGIN
  SELECT is_creator INTO v_is_creator FROM profiles WHERE id = p_creator_id;
  IF NOT v_is_creator THEN
    RAISE EXCEPTION 'Only creators can schedule mass messages';
  END IF;

  IF p_scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'Scheduled time must be in the future';
  END IF;

  IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
    RAISE EXCEPTION 'Message content cannot be empty';
  END IF;

  INSERT INTO scheduled_messages (creator_id, content, message_type, scheduled_at)
  VALUES (p_creator_id, TRIM(p_content), p_message_type, p_scheduled_at);

  RETURN jsonb_build_object('success', true, 'scheduled_at', p_scheduled_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Process due scheduled messages (called by cron or edge function)
CREATE OR REPLACE FUNCTION process_scheduled_messages()
RETURNS JSONB AS $$
DECLARE
  v_msg RECORD;
  v_result JSONB;
  v_total_processed INTEGER := 0;
BEGIN
  FOR v_msg IN
    SELECT id, creator_id, content, message_type
    FROM scheduled_messages
    WHERE status = 'pending'
      AND scheduled_at <= NOW()
    ORDER BY scheduled_at ASC
    LIMIT 50 -- process max 50 per invocation
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Use existing mass message logic
      SELECT send_mass_message(v_msg.creator_id, v_msg.content, v_msg.message_type)
      INTO v_result;

      UPDATE scheduled_messages
      SET status = 'sent',
          sent_count = (v_result->>'sent')::INTEGER,
          failed_count = (v_result->>'failed')::INTEGER,
          sent_at = NOW()
      WHERE id = v_msg.id;

      v_total_processed := v_total_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE scheduled_messages
      SET status = 'failed'
      WHERE id = v_msg.id;
      v_total_processed := v_total_processed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('processed', v_total_processed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. PROMOTIONAL PRICING / DISCOUNTS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  discount_percent INTEGER NOT NULL CHECK (discount_percent >= 5 AND discount_percent <= 90),
  promo_price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER, -- NULL means unlimited
  used_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_promotions_active ON creator_promotions(creator_id, active)
  WHERE active = true;

ALTER TABLE creator_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active promotions" ON creator_promotions
  FOR SELECT USING (true);

CREATE POLICY "Creators can manage own promotions" ON creator_promotions
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators can update own promotions" ON creator_promotions
  FOR UPDATE USING (auth.uid() = creator_id);

-- Create a promotion
CREATE OR REPLACE FUNCTION create_promotion(
  p_creator_id UUID,
  p_discount_percent INTEGER,
  p_duration_days INTEGER DEFAULT 7
) RETURNS JSONB AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_promo_price DECIMAL(10,2);
  v_promo_id UUID;
BEGIN
  -- Only creators
  SELECT subscription_price INTO v_price
  FROM profiles
  WHERE id = p_creator_id AND is_creator = true;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Creator not found or no subscription price set';
  END IF;

  IF p_discount_percent < 5 OR p_discount_percent > 90 THEN
    RAISE EXCEPTION 'Discount must be between 5%% and 90%%';
  END IF;

  IF p_duration_days < 1 OR p_duration_days > 90 THEN
    RAISE EXCEPTION 'Duration must be between 1 and 90 days';
  END IF;

  -- Deactivate any existing active promos
  UPDATE creator_promotions
  SET active = false
  WHERE creator_id = p_creator_id AND active = true;

  v_promo_price := ROUND(v_price * (100 - p_discount_percent) / 100, 2);

  INSERT INTO creator_promotions (creator_id, discount_percent, promo_price, original_price, starts_at, expires_at)
  VALUES (p_creator_id, p_discount_percent, v_promo_price, v_price, NOW(), NOW() + (p_duration_days || ' days')::INTERVAL)
  RETURNING id INTO v_promo_id;

  RETURN jsonb_build_object(
    'success', true,
    'promo_id', v_promo_id,
    'original_price', v_price,
    'promo_price', v_promo_price,
    'discount_percent', p_discount_percent,
    'expires_at', NOW() + (p_duration_days || ' days')::INTERVAL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get active promotion for a creator
CREATE OR REPLACE FUNCTION get_active_promotion(p_creator_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_promo RECORD;
BEGIN
  SELECT * INTO v_promo
  FROM creator_promotions
  WHERE creator_id = p_creator_id
    AND active = true
    AND starts_at <= NOW()
    AND expires_at > NOW()
    AND (max_uses IS NULL OR used_count < max_uses)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_promo IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_promo.id,
    'discount_percent', v_promo.discount_percent,
    'promo_price', v_promo.promo_price,
    'original_price', v_promo.original_price,
    'expires_at', v_promo.expires_at,
    'used_count', v_promo.used_count,
    'max_uses', v_promo.max_uses
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Deactivate a promotion
CREATE OR REPLACE FUNCTION deactivate_promotion(
  p_creator_id UUID,
  p_promo_id UUID
) RETURNS JSONB AS $$
BEGIN
  UPDATE creator_promotions
  SET active = false
  WHERE id = p_promo_id AND creator_id = p_creator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion not found';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update subscribe_to_creator to support promotional pricing and referral tracking
CREATE OR REPLACE FUNCTION subscribe_to_creator(
  p_subscriber_id UUID,
  p_creator_id UUID,
  p_price DECIMAL,
  p_referrer_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_existing RECORD;
  v_expires_at TIMESTAMPTZ;
  v_promo RECORD;
  v_actual_price DECIMAL(10,2);
  v_sub_id UUID;
BEGIN
  -- Verify creator exists and is a creator
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_creator_id AND is_creator = true) THEN
    RAISE EXCEPTION 'Creator not found';
  END IF;

  -- Cannot subscribe to yourself
  IF p_subscriber_id = p_creator_id THEN
    RAISE EXCEPTION 'Cannot subscribe to yourself';
  END IF;

  v_expires_at := NOW() + INTERVAL '30 days';

  -- Check for active promotion on this creator
  SELECT * INTO v_promo
  FROM creator_promotions
  WHERE creator_id = p_creator_id
    AND active = true
    AND starts_at <= NOW()
    AND expires_at > NOW()
    AND (max_uses IS NULL OR used_count < max_uses)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_promo IS NOT NULL THEN
    v_actual_price := v_promo.promo_price;
    -- Increment promo usage
    UPDATE creator_promotions SET used_count = used_count + 1 WHERE id = v_promo.id;
  ELSE
    v_actual_price := p_price;
  END IF;

  -- Check for existing subscription row
  SELECT * INTO v_existing FROM subscriptions
  WHERE subscriber_id = p_subscriber_id AND creator_id = p_creator_id;

  IF v_existing IS NOT NULL THEN
    -- Re-activate or extend existing subscription
    UPDATE subscriptions
    SET status = 'active',
        price_paid = v_actual_price,
        starts_at = NOW(),
        expires_at = CASE
          WHEN status = 'active' AND expires_at > NOW() THEN expires_at + INTERVAL '30 days'
          ELSE v_expires_at
        END
    WHERE id = v_existing.id
    RETURNING id INTO v_sub_id;
  ELSE
    -- New subscription
    INSERT INTO subscriptions (subscriber_id, creator_id, price_paid, status, starts_at, expires_at)
    VALUES (p_subscriber_id, p_creator_id, v_actual_price, 'active', NOW(), v_expires_at)
    RETURNING id INTO v_sub_id;
  END IF;

  -- Record referral if a referrer brought this user
  IF p_referrer_id IS NOT NULL AND p_referrer_id != p_subscriber_id THEN
    INSERT INTO referrals (referrer_id, referred_user_id, subscription_id, creator_id, subscription_amount)
    VALUES (p_referrer_id, p_subscriber_id, v_sub_id, p_creator_id, v_actual_price)
    ON CONFLICT DO NOTHING; -- don't fail if referral already recorded
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_expires_at,
    'price_paid', v_actual_price,
    'promotion_applied', v_promo IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 3. REFERRAL SYSTEM ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,  -- creator who's profile was visited
  referred_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,  -- user who signed up via cookie
  subscription_id UUID,  -- optional: filled when referred user subscribes   
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- creator they subscribed to
  subscription_amount DECIMAL(10,2) DEFAULT 0,
  commission_amount DECIMAL(10,2) DEFAULT 0,  -- will be calculated: subscription_amount * 0.10
  status TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'subscribed', 'earned')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referrer_id, referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view referrals they're part of" ON referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

-- Record a referral when a new user signs up
CREATE OR REPLACE FUNCTION record_referral(
  p_referrer_id UUID,
  p_referred_user_id UUID
) RETURNS JSONB AS $$
BEGIN
  -- Don't allow self-referral
  IF p_referrer_id = p_referred_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'self_referral');
  END IF;

  -- Only record if referrer exists and is a creator
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_referrer_id AND is_creator = true) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'referrer_not_creator');
  END IF;

  INSERT INTO referrals (referrer_id, referred_user_id)
  VALUES (p_referrer_id, p_referred_user_id)
  ON CONFLICT (referrer_id, referred_user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get referral stats for a creator's dashboard
CREATE OR REPLACE FUNCTION get_referral_stats(p_creator_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_total_referrals INTEGER;
  v_total_subscribed INTEGER;
  v_total_commission DECIMAL(10,2);
BEGIN
  SELECT COUNT(*) INTO v_total_referrals
  FROM referrals WHERE referrer_id = p_creator_id;

  SELECT COUNT(*) INTO v_total_subscribed
  FROM referrals WHERE referrer_id = p_creator_id AND status IN ('subscribed', 'earned');

  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_commission
  FROM referrals WHERE referrer_id = p_creator_id;

  RETURN jsonb_build_object(
    'total_referrals', v_total_referrals,
    'total_subscribed', v_total_subscribed,
    'total_commission', v_total_commission
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
