-- ═══════════════════════════════════════════════════════════════════════════
-- PAYOUT AUTOMATION SCHEMA
-- 
-- Adds wallet address support for crypto payouts and NOWPayments tracking
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add payout_wallet_address column to profiles for crypto payouts
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_wallet_address TEXT;

-- 2. Add NOWPayments payout tracking columns to payout_requests
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS nowpayments_payout_id TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS nowpayments_withdrawal_id TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS payout_hash TEXT;        -- blockchain tx hash
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS payout_currency TEXT;    -- e.g. usdttrc20
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS payout_wallet_address TEXT; -- snapshot of address at time of request

-- 3. Add index for NOWPayments withdrawal ID lookups (webhook)
CREATE INDEX IF NOT EXISTS idx_payout_requests_np_withdrawal 
  ON payout_requests(nowpayments_withdrawal_id) 
  WHERE nowpayments_withdrawal_id IS NOT NULL;

-- 4. RPC: Admin get pending payouts (for the admin queue)
CREATE OR REPLACE FUNCTION admin_get_pending_payouts()
RETURNS TABLE (
  id UUID,
  creator_id UUID,
  creator_username TEXT,
  creator_display_name TEXT,
  creator_avatar TEXT,
  amount NUMERIC(12,2),
  payout_method TEXT,
  payout_email TEXT,
  payout_wallet_address TEXT,
  status TEXT,
  nowpayments_payout_id TEXT,
  payout_hash TEXT,
  payout_currency TEXT,
  created_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  admin_note TEXT
) AS $$
BEGIN
  -- Auth check: admin or manager only
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    pr.id,
    pr.creator_id,
    p.username AS creator_username,
    p.display_name AS creator_display_name,
    p.avatar_url AS creator_avatar,
    pr.amount,
    pr.payout_method,
    pr.payout_email,
    pr.payout_wallet_address,
    pr.status,
    pr.nowpayments_payout_id,
    pr.payout_hash,
    pr.payout_currency,
    pr.created_at,
    pr.processed_at,
    pr.admin_note
  FROM payout_requests pr
  JOIN profiles p ON p.id = pr.creator_id
  ORDER BY 
    CASE pr.status
      WHEN 'pending' THEN 1
      WHEN 'processing' THEN 2
      WHEN 'completed' THEN 3
      WHEN 'rejected' THEN 4
    END,
    pr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: Update payout with NOWPayments tracking info (service_role only from API)
CREATE OR REPLACE FUNCTION update_payout_nowpayments_info(
  p_payout_id UUID,
  p_nowpayments_payout_id TEXT,
  p_nowpayments_withdrawal_id TEXT,
  p_payout_currency TEXT
) RETURNS JSONB AS $$
BEGIN
  -- This should only be called by service_role (from API endpoint)
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  UPDATE payout_requests
  SET nowpayments_payout_id = p_nowpayments_payout_id,
      nowpayments_withdrawal_id = p_nowpayments_withdrawal_id,
      payout_currency = p_payout_currency,
      status = 'processing',
      updated_at = NOW()
  WHERE id = p_payout_id
    AND status IN ('pending', 'processing');

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Update payout status from webhook (service_role only)
CREATE OR REPLACE FUNCTION update_payout_from_webhook(
  p_withdrawal_id TEXT,
  p_status TEXT,
  p_hash TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_payout RECORD;
BEGIN
  -- Service role only
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO v_payout FROM payout_requests 
  WHERE nowpayments_withdrawal_id = p_withdrawal_id
  FOR UPDATE;

  IF v_payout IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
  END IF;

  -- Map NOWPayments status to our status
  IF p_status IN ('FINISHED', 'finished') THEN
    UPDATE payout_requests
    SET status = 'completed',
        payout_hash = COALESCE(p_hash, payout_hash),
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_payout.id;
  ELSIF p_status IN ('FAILED', 'REJECTED', 'failed', 'rejected') THEN
    -- Refund on failure
    UPDATE wallets
    SET balance = balance + v_payout.amount,
        total_withdrawn = total_withdrawn - v_payout.amount,
        last_payout_at = NULL,
        updated_at = NOW()
    WHERE id = v_payout.wallet_id;

    UPDATE wallet_transactions
    SET status = 'available', updated_at = NOW()
    WHERE creator_id = v_payout.creator_id
      AND status = 'withdrawn'
      AND updated_at >= v_payout.created_at;

    UPDATE payout_requests
    SET status = 'rejected',
        admin_note = COALESCE(admin_note || ' | ', '') || 'NOWPayments: ' || p_status,
        payout_hash = COALESCE(p_hash, payout_hash),
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_payout.id;

    DELETE FROM transactions
    WHERE reference_id = v_payout.id AND transaction_type = 'withdrawal';
  ELSE
    -- Status update only (WAITING, PROCESSING, SENDING, etc.)
    UPDATE payout_requests
    SET status = 'processing',
        updated_at = NOW()
    WHERE id = v_payout.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'payout_id', v_payout.id, 'new_status', p_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Update request_payout to also capture wallet address
CREATE OR REPLACE FUNCTION request_payout(
  p_creator_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_wallet RECORD;
  v_withdrawable NUMERIC(12,2);
  v_profile RECORD;
  v_pending BOOLEAN;
  v_payout_id UUID;
BEGIN
  IF auth.uid() != p_creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE creator_id = p_creator_id FOR UPDATE;
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'No wallet found';
  END IF;

  IF v_wallet.last_payout_at IS NOT NULL AND v_wallet.last_payout_at > NOW() - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'Payouts are limited to once per month. Next payout available: %', 
      TO_CHAR(v_wallet.last_payout_at + INTERVAL '30 days', 'Mon DD, YYYY');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM payout_requests
    WHERE creator_id = p_creator_id AND status IN ('pending', 'processing')
  ) INTO v_pending;

  IF v_pending THEN
    RAISE EXCEPTION 'You already have a pending payout request';
  END IF;

  SELECT COALESCE(SUM(net_amount), 0) INTO v_withdrawable
  FROM wallet_transactions
  WHERE creator_id = p_creator_id AND status = 'available';

  IF v_withdrawable <= 0 THEN
    RAISE EXCEPTION 'No funds available for withdrawal';
  END IF;

  SELECT payout_method, payout_email, payout_wallet_address 
  INTO v_profile FROM profiles WHERE id = p_creator_id;

  -- For crypto payouts, require wallet address; for others require email
  IF v_profile.payout_method = 'crypto' THEN
    IF v_profile.payout_wallet_address IS NULL OR v_profile.payout_wallet_address = '' THEN
      RAISE EXCEPTION 'Please configure your USDT wallet address in Settings first';
    END IF;
  ELSE
    IF v_profile.payout_method IS NULL OR v_profile.payout_email IS NULL OR v_profile.payout_email = '' THEN
      RAISE EXCEPTION 'Please configure your payout method and email in Settings first';
    END IF;
  END IF;

  INSERT INTO payout_requests (creator_id, wallet_id, amount, payout_method, payout_email, payout_wallet_address, status)
  VALUES (p_creator_id, v_wallet.id, v_withdrawable, v_profile.payout_method, 
          v_profile.payout_email, v_profile.payout_wallet_address, 'pending')
  RETURNING id INTO v_payout_id;

  UPDATE wallet_transactions
  SET status = 'withdrawn', updated_at = NOW()
  WHERE creator_id = p_creator_id AND status = 'available';

  UPDATE wallets
  SET balance = balance - v_withdrawable,
      total_withdrawn = total_withdrawn + v_withdrawable,
      last_payout_at = NOW(),
      updated_at = NOW()
  WHERE id = v_wallet.id;

  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_creator_id, NULL, 'withdrawal', v_withdrawable, 0, v_withdrawable, v_payout_id, 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'payout_id', v_payout_id,
    'amount', v_withdrawable,
    'method', v_profile.payout_method,
    'status', 'pending'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
