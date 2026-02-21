-- ============================================================================
-- MONETIZATION FEATURES: Tipping, Subscription Expiry, Promo Codes, Tax, Ads
-- Date: February 21, 2026
-- ============================================================================

-- ─── 1. TIPPING ─────────────────────────────────────────────────────────────

-- send_tip RPC: handles tip from fan to creator with platform fee
CREATE OR REPLACE FUNCTION send_tip(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_amount DECIMAL,
  p_post_id UUID DEFAULT NULL,
  p_message TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fee DECIMAL(12,2);
  v_net DECIMAL(12,2);
  v_tx_id UUID;
  v_creator profiles%ROWTYPE;
BEGIN
  -- Validate caller
  IF auth.uid() IS NULL OR auth.uid() != p_from_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- Can't tip yourself
  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot tip yourself';
  END IF;
  
  -- Validate amount
  IF p_amount < 1 OR p_amount > 200 THEN
    RAISE EXCEPTION 'Tip must be between $1 and $200';
  END IF;
  
  -- Validate creator exists
  SELECT * INTO v_creator FROM profiles WHERE id = p_to_user_id AND is_creator = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator not found';
  END IF;
  
  -- Calculate fee
  v_fee := ROUND(p_amount * 0.30, 2);
  v_net := p_amount - v_fee;
  
  -- Record transaction
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_from_user_id, p_to_user_id, 'tip', p_amount, v_fee, v_net, p_post_id, 'completed')
  RETURNING id INTO v_tx_id;
  
  -- Create notification
  INSERT INTO notifications (user_id, type, from_user_id, post_id, metadata)
  VALUES (
    p_to_user_id, 
    'tip', 
    p_from_user_id, 
    p_post_id,
    jsonb_build_object('amount', p_amount, 'message', COALESCE(p_message, ''), 'transaction_id', v_tx_id::text)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'amount', p_amount,
    'fee', v_fee,
    'net', v_net
  );
END;
$$;


-- ─── 2. SUBSCRIPTION AUTO-RENEWAL / EXPIRY CRON ────────────────────────────

-- Function to expire overdue subscriptions
CREATE OR REPLACE FUNCTION process_expired_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Schedule cron job to run every hour
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('expire-subscriptions', '0 * * * *', 'SELECT process_expired_subscriptions();');
  ELSE
    RAISE NOTICE 'pg_cron not enabled. Enable it to auto-expire subscriptions.';
  END IF;
END $$;

-- Function to auto-renew subscriptions (when payment processor is ready)
-- For now, just extends by 30 days for active subscriptions nearing expiry
CREATE OR REPLACE FUNCTION process_subscription_renewals()
RETURNS TABLE(renewed INTEGER, failed INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_renewed INTEGER := 0;
  v_failed INTEGER := 0;
  v_sub RECORD;
BEGIN
  -- Find subscriptions expiring in next 24h that haven't been cancelled
  FOR v_sub IN
    SELECT s.*, p.subscription_price
    FROM subscriptions s
    JOIN profiles p ON p.id = s.creator_id
    WHERE s.status = 'active'
      AND s.expires_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
  LOOP
    BEGIN
      -- Extend subscription by 30 days
      UPDATE subscriptions
      SET expires_at = expires_at + INTERVAL '30 days'
      WHERE id = v_sub.id;
      
      -- Record renewal transaction
      INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, status)
      VALUES (
        v_sub.subscriber_id, v_sub.creator_id, 'subscription',
        v_sub.price_paid,
        ROUND(v_sub.price_paid * 0.30, 2),
        v_sub.price_paid - ROUND(v_sub.price_paid * 0.30, 2),
        'completed'
      );
      
      v_renewed := v_renewed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_renewed, v_failed;
END;
$$;

-- Schedule renewal check every 6 hours
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('renew-subscriptions', '0 */6 * * *', 'SELECT * FROM process_subscription_renewals();');
  ELSE
    RAISE NOTICE 'pg_cron not enabled. Enable it to auto-renew subscriptions.';
  END IF;
END $$;


-- ─── 3. PROMO CODES ────────────────────────────────────────────────────────

-- Table for redeemable promo codes (distinct from creator_promotions)
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL = platform-wide
  discount_percent INTEGER NOT NULL CHECK (discount_percent >= 5 AND discount_percent <= 100),
  max_uses INTEGER,  -- NULL = unlimited
  used_count INTEGER DEFAULT 0,
  min_spend DECIMAL(10,2) DEFAULT 0,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which users have redeemed which codes
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID REFERENCES promo_codes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  original_amount DECIMAL(10,2) NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(code_id, user_id)  -- Each user can only redeem a code once
);

-- RLS
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Creators can see their own promo codes, admins can see all
CREATE POLICY "promo_codes_select" ON promo_codes FOR SELECT USING (
  creator_id = auth.uid() 
  OR auth.uid() IN (SELECT id FROM profiles WHERE system_role IN ('admin', 'manager'))
  OR active = true  -- anyone can validate active codes
);
CREATE POLICY "promo_codes_insert" ON promo_codes FOR INSERT WITH CHECK (
  creator_id = auth.uid()
  OR auth.uid() IN (SELECT id FROM profiles WHERE system_role IN ('admin', 'manager'))
);
CREATE POLICY "promo_codes_update" ON promo_codes FOR UPDATE USING (
  creator_id = auth.uid()
  OR auth.uid() IN (SELECT id FROM profiles WHERE system_role IN ('admin', 'manager'))
);

CREATE POLICY "promo_redemptions_select" ON promo_code_redemptions FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY "promo_redemptions_insert" ON promo_code_redemptions FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

-- RPC to validate and apply a promo code
CREATE OR REPLACE FUNCTION validate_promo_code(
  p_code TEXT,
  p_creator_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
  v_already_used BOOLEAN;
BEGIN
  -- Find the code
  SELECT * INTO v_promo FROM promo_codes
  WHERE UPPER(code) = UPPER(TRIM(p_code))
    AND active = true
    AND valid_from <= NOW()
    AND valid_until > NOW()
    AND (max_uses IS NULL OR used_count < max_uses);
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid or expired promo code');
  END IF;
  
  -- Check if creator-specific and matches
  IF v_promo.creator_id IS NOT NULL AND p_creator_id IS NOT NULL AND v_promo.creator_id != p_creator_id THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This code is not valid for this creator');
  END IF;
  
  -- Check if user already redeemed
  SELECT EXISTS(
    SELECT 1 FROM promo_code_redemptions WHERE code_id = v_promo.id AND user_id = auth.uid()
  ) INTO v_already_used;
  
  IF v_already_used THEN
    RETURN jsonb_build_object('valid', false, 'error', 'You have already used this promo code');
  END IF;
  
  RETURN jsonb_build_object(
    'valid', true,
    'code_id', v_promo.id,
    'discount_percent', v_promo.discount_percent,
    'creator_id', v_promo.creator_id,
    'min_spend', v_promo.min_spend
  );
END;
$$;

-- RPC to redeem a promo code (called during subscription/purchase)
CREATE OR REPLACE FUNCTION redeem_promo_code(
  p_code_id UUID,
  p_original_amount DECIMAL,
  p_discount_amount DECIMAL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Record redemption
  INSERT INTO promo_code_redemptions (code_id, user_id, discount_amount, original_amount)
  VALUES (p_code_id, auth.uid(), p_discount_amount, p_original_amount);
  
  -- Increment used_count
  UPDATE promo_codes SET used_count = used_count + 1 WHERE id = p_code_id;
  
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

-- RPC for creators to create promo codes
CREATE OR REPLACE FUNCTION create_promo_code(
  p_code TEXT,
  p_discount_percent INTEGER,
  p_duration_days INTEGER DEFAULT 30,
  p_max_uses INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
BEGIN
  -- Validate creator
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_creator = true) THEN
    RAISE EXCEPTION 'Only creators can create promo codes';
  END IF;
  
  -- Validate code format
  IF LENGTH(TRIM(p_code)) < 3 OR LENGTH(TRIM(p_code)) > 20 THEN
    RAISE EXCEPTION 'Code must be 3-20 characters';
  END IF;
  
  -- Validate discount
  IF p_discount_percent < 5 OR p_discount_percent > 100 THEN
    RAISE EXCEPTION 'Discount must be between 5%% and 100%%';
  END IF;
  
  INSERT INTO promo_codes (code, creator_id, discount_percent, max_uses, valid_until)
  VALUES (UPPER(TRIM(p_code)), auth.uid(), p_discount_percent, p_max_uses, NOW() + (p_duration_days || ' days')::INTERVAL)
  RETURNING * INTO v_promo;
  
  RETURN jsonb_build_object(
    'success', true,
    'id', v_promo.id,
    'code', v_promo.code,
    'discount_percent', v_promo.discount_percent,
    'valid_until', v_promo.valid_until
  );
END;
$$;


-- ─── 4. TAX DOCUMENTS ──────────────────────────────────────────────────────

-- Table for tax information collection
CREATE TABLE IF NOT EXISTS tax_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  tax_form_type TEXT NOT NULL CHECK (tax_form_type IN ('w9', 'w8ben', 'w8bene')),
  legal_name TEXT NOT NULL,
  business_name TEXT,
  tax_classification TEXT CHECK (tax_classification IN ('individual', 'sole_proprietor', 'llc', 'corporation', 'partnership', 'trust', 'other')),
  tax_id_number TEXT,  -- Encrypted/masked in API responses
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  zip_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  is_us_person BOOLEAN DEFAULT TRUE,
  foreign_tax_id TEXT,
  treaty_country TEXT,
  signature TEXT NOT NULL,  -- Electronic signature (typed name)
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_update')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track 1099 generation
CREATE TABLE IF NOT EXISTS tax_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tax_year INTEGER NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('1099-nec', '1099-misc', '1042-s')),
  total_earnings DECIMAL(12,2) NOT NULL,
  document_url TEXT,  -- Signed URL to generated PDF
  generated_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'sent', 'corrected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tax_year, document_type)
);

-- RLS
ALTER TABLE tax_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_info_own" ON tax_info FOR ALL USING (
  user_id = auth.uid()
  OR auth.uid() IN (SELECT id FROM profiles WHERE system_role IN ('admin', 'manager'))
);

CREATE POLICY "tax_docs_own" ON tax_documents FOR ALL USING (
  user_id = auth.uid()
  OR auth.uid() IN (SELECT id FROM profiles WHERE system_role IN ('admin', 'manager'))
);

-- RPC to submit/update tax info
CREATE OR REPLACE FUNCTION submit_tax_info(
  p_form_type TEXT,
  p_legal_name TEXT,
  p_business_name TEXT DEFAULT NULL,
  p_tax_classification TEXT DEFAULT 'individual',
  p_tax_id TEXT DEFAULT NULL,
  p_address1 TEXT DEFAULT NULL,
  p_address2 TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'US',
  p_is_us BOOLEAN DEFAULT TRUE,
  p_signature TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_info tax_info%ROWTYPE;
BEGIN
  INSERT INTO tax_info (
    user_id, tax_form_type, legal_name, business_name, tax_classification,
    tax_id_number, address_line1, address_line2, city, state, zip_code,
    country, is_us_person, signature, status
  ) VALUES (
    auth.uid(), p_form_type, p_legal_name, p_business_name, p_tax_classification,
    p_tax_id, p_address1, p_address2, p_city, p_state, p_zip,
    p_country, p_is_us, p_signature, 'pending'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tax_form_type = EXCLUDED.tax_form_type,
    legal_name = EXCLUDED.legal_name,
    business_name = EXCLUDED.business_name,
    tax_classification = EXCLUDED.tax_classification,
    tax_id_number = EXCLUDED.tax_id_number,
    address_line1 = EXCLUDED.address_line1,
    address_line2 = EXCLUDED.address_line2,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    zip_code = EXCLUDED.zip_code,
    country = EXCLUDED.country,
    is_us_person = EXCLUDED.is_us_person,
    signature = EXCLUDED.signature,
    signed_at = NOW(),
    status = 'pending',
    updated_at = NOW()
  RETURNING * INTO v_info;
  
  RETURN jsonb_build_object('success', true, 'status', v_info.status);
END;
$$;


-- ─── 5. ADS / CONTENT PROMOTION SYSTEM ─────────────────────────────────────

-- Add 'ad' to transaction types
DO $$
BEGIN
  ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'ad';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Promotion/Ads table
CREATE TABLE IF NOT EXISTS content_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  promotion_type TEXT NOT NULL CHECK (promotion_type IN ('post', 'profile')),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,  -- NULL for profile promotions
  status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'paused', 'completed', 'cancelled')),
  budget DECIMAL(10,2) NOT NULL CHECK (budget >= 5),
  spent DECIMAL(10,2) DEFAULT 0,
  daily_budget DECIMAL(10,2),
  duration_hours INTEGER NOT NULL CHECK (duration_hours >= 12),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  target_audience JSONB DEFAULT '{}',  -- Future: age range, interests, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track ad impressions for billing
CREATE TABLE IF NOT EXISTS ad_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID REFERENCES content_promotions(id) ON DELETE CASCADE NOT NULL,
  viewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  impression_type TEXT DEFAULT 'view' CHECK (impression_type IN ('view', 'click')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE content_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promotions_own_select" ON content_promotions FOR SELECT USING (
  creator_id = auth.uid()
  OR auth.uid() IN (SELECT id FROM profiles WHERE system_role IN ('admin', 'manager'))
);
CREATE POLICY "promotions_own_insert" ON content_promotions FOR INSERT WITH CHECK (
  creator_id = auth.uid()
);
CREATE POLICY "promotions_own_update" ON content_promotions FOR UPDATE USING (
  creator_id = auth.uid()
);

-- Impressions: anyone can insert (on view), only owner or admin can read
CREATE POLICY "impressions_insert" ON ad_impressions FOR INSERT WITH CHECK (true);
CREATE POLICY "impressions_select" ON ad_impressions FOR SELECT USING (
  promotion_id IN (SELECT id FROM content_promotions WHERE creator_id = auth.uid())
  OR auth.uid() IN (SELECT id FROM profiles WHERE system_role IN ('admin'))
);

-- Indexes for ad serving
CREATE INDEX IF NOT EXISTS idx_content_promotions_active ON content_promotions (status, starts_at, ends_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_content_promotions_creator ON content_promotions (creator_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_promo ON ad_impressions (promotion_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_promo_codes_creator ON promo_codes (creator_id);
CREATE INDEX IF NOT EXISTS idx_tax_info_user ON tax_info (user_id);

-- Dynamic pricing: base cost per hour increases with concurrent active ads
CREATE OR REPLACE FUNCTION get_ad_pricing()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_active_count INTEGER;
  v_base_rate DECIMAL;
  v_multiplier DECIMAL;
BEGIN
  -- Count currently active promotions
  SELECT COUNT(*) INTO v_active_count
  FROM content_promotions
  WHERE status = 'active'
    AND starts_at <= NOW()
    AND ends_at > NOW();
  
  -- Base rate: $0.50 per hour 
  v_base_rate := 0.50;
  
  -- Price multiplier: increases with competition
  -- 0-10 ads: 1x, 10-25: 1.5x, 25-50: 2x, 50-100: 3x, 100+: 5x
  v_multiplier := CASE
    WHEN v_active_count < 10 THEN 1.0
    WHEN v_active_count < 25 THEN 1.5
    WHEN v_active_count < 50 THEN 2.0
    WHEN v_active_count < 100 THEN 3.0
    ELSE 5.0
  END;
  
  RETURN jsonb_build_object(
    'base_rate_per_hour', v_base_rate,
    'multiplier', v_multiplier,
    'effective_rate_per_hour', ROUND(v_base_rate * v_multiplier, 2),
    'active_ads', v_active_count,
    'min_hours', 12,
    'durations', jsonb_build_array(
      jsonb_build_object('hours', 12, 'label', '12 Hours', 'cost', ROUND(12 * v_base_rate * v_multiplier, 2)),
      jsonb_build_object('hours', 24, 'label', '1 Day', 'cost', ROUND(24 * v_base_rate * v_multiplier, 2)),
      jsonb_build_object('hours', 72, 'label', '3 Days', 'cost', ROUND(72 * v_base_rate * v_multiplier, 2)),
      jsonb_build_object('hours', 168, 'label', '7 Days', 'cost', ROUND(168 * v_base_rate * v_multiplier, 2)),
      jsonb_build_object('hours', 336, 'label', '14 Days', 'cost', ROUND(336 * v_base_rate * v_multiplier, 2)),
      jsonb_build_object('hours', 720, 'label', '30 Days', 'cost', ROUND(720 * v_base_rate * v_multiplier, 2))
    )
  );
END;
$$;

-- RPC to create a content promotion (ad)
CREATE OR REPLACE FUNCTION create_content_promotion(
  p_type TEXT,
  p_post_id UUID DEFAULT NULL,
  p_duration_hours INTEGER DEFAULT 24
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pricing JSONB;
  v_cost DECIMAL;
  v_promo content_promotions%ROWTYPE;
BEGIN
  -- Validate creator
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_creator = true) THEN
    RAISE EXCEPTION 'Only creators can create promotions';
  END IF;
  
  -- Validate type
  IF p_type NOT IN ('post', 'profile') THEN
    RAISE EXCEPTION 'Invalid promotion type. Must be post or profile';
  END IF;
  
  -- Post promotions require a post_id that belongs to the creator
  IF p_type = 'post' THEN
    IF p_post_id IS NULL THEN
      RAISE EXCEPTION 'Post ID required for post promotions';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM posts WHERE id = p_post_id AND author_id = auth.uid()) THEN
      RAISE EXCEPTION 'Post not found or not owned by you';
    END IF;
  END IF;
  
  -- Get pricing  
  v_pricing := get_ad_pricing();
  v_cost := ROUND(p_duration_hours * (v_pricing->>'effective_rate_per_hour')::DECIMAL, 2);
  
  IF v_cost < 5 THEN
    v_cost := 5;  -- Minimum $5
  END IF;
  
  -- Create the promotion
  INSERT INTO content_promotions (
    creator_id, promotion_type, post_id, budget, duration_hours,
    starts_at, ends_at, status
  ) VALUES (
    auth.uid(), p_type, p_post_id, v_cost, p_duration_hours,
    NOW(), NOW() + (p_duration_hours || ' hours')::INTERVAL, 'active'
  ) RETURNING * INTO v_promo;
  
  -- Record transaction
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (auth.uid(), NULL, 'ad', v_cost, v_cost, 0, v_promo.id, 'completed');
  
  RETURN jsonb_build_object(
    'success', true,
    'promotion_id', v_promo.id,
    'cost', v_cost,
    'starts_at', v_promo.starts_at,
    'ends_at', v_promo.ends_at
  );
END;
$$;

-- RPC to get promoted content for feed injection
CREATE OR REPLACE FUNCTION get_promoted_posts(p_limit INTEGER DEFAULT 3)
RETURNS SETOF JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'promotion_id', cp.id,
    'post_id', cp.post_id,
    'creator_id', cp.creator_id,
    'promotion_type', cp.promotion_type,
    'is_promoted', true
  )
  FROM content_promotions cp
  WHERE cp.status = 'active'
    AND cp.starts_at <= NOW()
    AND cp.ends_at > NOW()
    AND cp.promotion_type = 'post'
    AND cp.post_id IS NOT NULL
    -- Don't show own promoted content
    AND cp.creator_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000')
  ORDER BY cp.budget DESC, RANDOM()
  LIMIT p_limit;
END;
$$;

-- RPC to get promoted profiles for explore injection
CREATE OR REPLACE FUNCTION get_promoted_profiles(p_limit INTEGER DEFAULT 5)
RETURNS SETOF JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'promotion_id', cp.id,
    'creator_id', cp.creator_id,
    'is_promoted', true
  )
  FROM content_promotions cp
  WHERE cp.status = 'active'
    AND cp.starts_at <= NOW()
    AND cp.ends_at > NOW()
    AND cp.promotion_type = 'profile'
    AND cp.creator_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000')
  ORDER BY cp.budget DESC, RANDOM()
  LIMIT p_limit;
END;
$$;

-- Cron to complete expired promotions
CREATE OR REPLACE FUNCTION complete_expired_promotions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE content_promotions
  SET status = 'completed'
  WHERE status = 'active'
    AND ends_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('complete-expired-promotions', '*/15 * * * *', 'SELECT complete_expired_promotions();');
  ELSE
    RAISE NOTICE 'pg_cron not enabled. Enable it to auto-complete expired promotions.';
  END IF;
END $$;

-- Also ensure 'tip' notification type exists
DO $$
BEGIN
  -- The notification_type enum should already include 'tip' but let's be safe
  ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'tip';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
