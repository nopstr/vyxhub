-- 1. Add FOR UPDATE lock to complete_custom_request to prevent race conditions
CREATE OR REPLACE FUNCTION complete_custom_request(
  p_request_id UUID,
  p_delivery_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
  v_fee_rate NUMERIC(5,4);
  v_fee NUMERIC;
  v_net NUMERIC;
  v_tx_id UUID;
BEGIN
  -- Lock the request row to prevent concurrent completions
  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF auth.uid() != v_request.creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status != 'paid' THEN
    RAISE EXCEPTION 'Request must be paid before completing';
  END IF;

  -- Use per-creator fee rate
  v_fee_rate := get_creator_fee_rate(v_request.creator_id);
  v_fee := ROUND(v_request.price * v_fee_rate, 2);
  v_net := v_request.price - v_fee;

  -- Update request status
  UPDATE custom_requests
  SET status = 'completed',
      delivery_url = p_delivery_url,
      updated_at = NOW()
  WHERE id = p_request_id;

  -- Credit creator wallet
  INSERT INTO wallet_transactions (
    wallet_id,
    creator_id,
    transaction_type,
    gross_amount,
    platform_fee,
    net_amount,
    fee_rate,
    from_user_id,
    is_withdrawable,
    withdrawable_at,
    status
  )
  SELECT 
    id,
    v_request.creator_id,
    'custom_request',
    v_request.price,
    v_fee,
    v_net,
    v_fee_rate,
    v_request.requester_id,
    FALSE,
    NOW() + INTERVAL '30 days',
    'held'
  FROM wallets
  WHERE creator_id = v_request.creator_id
  RETURNING id INTO v_tx_id;

  -- Update wallet balance
  UPDATE wallets
  SET balance = balance + v_net,
      total_earned = total_earned + v_net,
      updated_at = NOW()
  WHERE creator_id = v_request.creator_id;

  -- Notify requester
  INSERT INTO notifications (
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    message
  ) VALUES (
    v_request.requester_id,
    v_request.creator_id,
    'custom_request_completed',
    'custom_request',
    p_request_id,
    'Your custom request has been completed!'
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'transaction_id', v_tx_id,
    'net_earned', v_net
  );
END;
$$;
