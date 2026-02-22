-- 1. Add FOR UPDATE lock to admin_process_payout to prevent race conditions
CREATE OR REPLACE FUNCTION admin_process_payout(
  p_payout_id UUID,
  p_action TEXT, -- 'approve' | 'reject'
  p_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_payout RECORD;
  v_admin RECORD;
BEGIN
  SELECT system_role INTO v_admin FROM profiles WHERE id = auth.uid();
  IF v_admin.system_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Lock the payout request row to prevent concurrent processing
  SELECT * INTO v_payout FROM payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'Payout request not found';
  END IF;

  IF v_payout.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'Payout already processed';
  END IF;

  IF p_action = 'approve' THEN
    UPDATE payout_requests
    SET status = 'completed',
        admin_note = p_note,
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payout_id;
  ELSIF p_action = 'reject' THEN
    -- Refund: restore wallet balance and mark transactions as available again
    UPDATE wallets
    SET balance = balance + v_payout.amount,
        total_withdrawn = total_withdrawn - v_payout.amount,
        last_payout_at = NULL, -- allow retry
        updated_at = NOW()
    WHERE id = v_payout.wallet_id;

    -- Re-mark wallet transactions back to available
    UPDATE wallet_transactions
    SET status = 'available',
        updated_at = NOW()
    WHERE creator_id = v_payout.creator_id
      AND status = 'withdrawn'
      AND updated_at >= v_payout.created_at;

    UPDATE payout_requests
    SET status = 'rejected',
        admin_note = p_note,
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payout_id;

    -- Remove the withdrawal transaction
    DELETE FROM transactions
    WHERE reference_id = p_payout_id AND transaction_type = 'withdrawal';
  ELSE
    RAISE EXCEPTION 'Invalid action. Use approve or reject';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payout_id', p_payout_id,
    'action', p_action,
    'status', CASE WHEN p_action = 'approve' THEN 'completed' ELSE 'rejected' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
