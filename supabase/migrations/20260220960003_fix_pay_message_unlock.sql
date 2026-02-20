-- Update pay_message_unlock to handle null price
CREATE OR REPLACE FUNCTION pay_message_unlock(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_fee DECIMAL(10,2);
  v_net DECIMAL(10,2);
BEGIN
  -- Get message price
  SELECT COALESCE(message_price, 0) INTO v_price
  FROM profiles WHERE id = p_receiver_id;

  IF v_price <= 0 THEN
    RETURN jsonb_build_object('success', TRUE, 'amount', 0);
  END IF;

  -- Calculate platform fee (30%)
  v_fee := ROUND(v_price * 0.30, 2);
  v_net := v_price - v_fee;

  -- Record transaction
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_sender_id, p_receiver_id, 'message_unlock', v_price, v_fee, v_net, p_conversation_id, 'completed');

  RETURN jsonb_build_object('success', TRUE, 'amount', v_price);
END;
$$;
