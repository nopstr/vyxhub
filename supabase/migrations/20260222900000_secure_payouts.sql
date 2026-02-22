-- 1. Secure request_payout RPC against race conditions and partial withdrawal bugs
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
  -- Auth check
  IF auth.uid() != p_creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get wallet with FOR UPDATE lock to prevent concurrent payout requests
  SELECT * INTO v_wallet FROM wallets WHERE creator_id = p_creator_id FOR UPDATE;
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'No wallet found';
  END IF;

  -- Check monthly cooldown
  IF v_wallet.last_payout_at IS NOT NULL AND v_wallet.last_payout_at > NOW() - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'Payouts are limited to once per month. Next payout available: %', 
      TO_CHAR(v_wallet.last_payout_at + INTERVAL '30 days', 'Mon DD, YYYY');
  END IF;

  -- Check no pending payout
  SELECT EXISTS(
    SELECT 1 FROM payout_requests
    WHERE creator_id = p_creator_id AND status IN ('pending', 'processing')
  ) INTO v_pending;

  IF v_pending THEN
    RAISE EXCEPTION 'You already have a pending payout request';
  END IF;

  -- Calculate withdrawable
  SELECT COALESCE(SUM(net_amount), 0) INTO v_withdrawable
  FROM wallet_transactions
  WHERE creator_id = p_creator_id
    AND status = 'available';

  IF v_withdrawable <= 0 THEN
    RAISE EXCEPTION 'No funds available for withdrawal';
  END IF;

  -- Get payout details from profile
  SELECT payout_method, payout_email INTO v_profile
  FROM profiles WHERE id = p_creator_id;

  IF v_profile.payout_method IS NULL OR v_profile.payout_email IS NULL OR v_profile.payout_email = '' THEN
    RAISE EXCEPTION 'Please configure your payout method and email in Settings first';
  END IF;

  -- Create payout request for ALL available funds
  INSERT INTO payout_requests (creator_id, wallet_id, amount, payout_method, payout_email, status)
  VALUES (p_creator_id, v_wallet.id, v_withdrawable, v_profile.payout_method, v_profile.payout_email, 'pending')
  RETURNING id INTO v_payout_id;

  -- Mark ALL available wallet transactions as withdrawn
  UPDATE wallet_transactions
  SET status = 'withdrawn',
      updated_at = NOW()
  WHERE creator_id = p_creator_id
    AND status = 'available';

  -- Deduct from wallet balance
  UPDATE wallets
  SET balance = balance - v_withdrawable,
      total_withdrawn = total_withdrawn + v_withdrawable,
      last_payout_at = NOW(),
      updated_at = NOW()
  WHERE id = v_wallet.id;

  -- Record withdrawal transaction
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
