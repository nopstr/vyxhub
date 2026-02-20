-- ============================================================================
-- Creator Tools V2: Analytics, Mass Messaging, Custom Requests, Earnings Export
-- ============================================================================

-- 1. Add 'custom_request' to transaction_type enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'custom_request'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
  ) THEN
    ALTER TYPE transaction_type ADD VALUE 'custom_request';
  END IF;
END$$;

-- 2. Custom Requests table
CREATE TABLE IF NOT EXISTS custom_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 5 AND price <= 10000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  creator_note TEXT,
  delivery_url TEXT,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_requests_creator ON custom_requests(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_custom_requests_requester ON custom_requests(requester_id, status);

-- RLS
ALTER TABLE custom_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests" ON custom_requests
  FOR SELECT USING (auth.uid() = creator_id OR auth.uid() = requester_id);

CREATE POLICY "Users can create requests" ON custom_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Creator can update own requests" ON custom_requests
  FOR UPDATE USING (auth.uid() = creator_id OR auth.uid() = requester_id);

-- 3. Creator Analytics RPC - comprehensive dashboard data in one call
CREATE OR REPLACE FUNCTION get_creator_analytics(
  p_creator_id UUID,
  p_period TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_prev_start TIMESTAMPTZ;
  v_prev_end TIMESTAMPTZ;
  v_result JSONB;
  v_earnings_current NUMERIC;
  v_earnings_prev NUMERIC;
  v_subs_current INTEGER;
  v_subs_prev INTEGER;
  v_views_current BIGINT;
  v_likes_current BIGINT;
  v_comments_current BIGINT;
BEGIN
  -- Only creators can view their own analytics
  IF auth.uid() != p_creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Determine date ranges
  CASE p_period
    WHEN '7d' THEN v_start_date := NOW() - INTERVAL '7 days';
    WHEN '30d' THEN v_start_date := NOW() - INTERVAL '30 days';
    WHEN '90d' THEN v_start_date := NOW() - INTERVAL '90 days';
    WHEN '1y' THEN v_start_date := NOW() - INTERVAL '1 year';
    WHEN 'all' THEN v_start_date := '2020-01-01'::TIMESTAMPTZ;
    ELSE v_start_date := NOW() - INTERVAL '30 days';
  END CASE;

  v_prev_end := v_start_date;
  v_prev_start := v_start_date - (NOW() - v_start_date);

  -- Current period earnings
  SELECT COALESCE(SUM(net_amount), 0) INTO v_earnings_current
  FROM transactions
  WHERE to_user_id = p_creator_id AND created_at >= v_start_date;

  -- Previous period earnings (for trend)
  SELECT COALESCE(SUM(net_amount), 0) INTO v_earnings_prev
  FROM transactions
  WHERE to_user_id = p_creator_id AND created_at >= v_prev_start AND created_at < v_prev_end;

  -- Current subscribers
  SELECT COUNT(*) INTO v_subs_current
  FROM subscriptions
  WHERE creator_id = p_creator_id AND status = 'active';

  -- Previous period subscribers
  SELECT COUNT(*) INTO v_subs_prev
  FROM subscriptions
  WHERE creator_id = p_creator_id AND status = 'active' AND created_at < v_prev_end;

  -- Views in period
  SELECT COALESCE(SUM(view_count), 0) INTO v_views_current
  FROM posts WHERE author_id = p_creator_id;

  -- Likes in period
  SELECT COUNT(*) INTO v_likes_current
  FROM likes l JOIN posts p ON l.post_id = p.id
  WHERE p.author_id = p_creator_id AND l.created_at >= v_start_date;

  -- Comments in period
  SELECT COUNT(*) INTO v_comments_current
  FROM comments c JOIN posts p ON c.post_id = p.id
  WHERE p.author_id = p_creator_id AND c.created_at >= v_start_date;

  -- Build earnings breakdown by type
  v_result := jsonb_build_object(
    'summary', jsonb_build_object(
      'earnings', v_earnings_current,
      'earnings_prev', v_earnings_prev,
      'earnings_trend', CASE WHEN v_earnings_prev > 0 
        THEN ROUND(((v_earnings_current - v_earnings_prev) / v_earnings_prev * 100)::NUMERIC, 1) 
        ELSE 0 END,
      'subscribers', v_subs_current,
      'subscribers_prev', v_subs_prev,
      'views', v_views_current,
      'likes', v_likes_current,
      'comments', v_comments_current
    ),
    'earnings_by_type', (
      SELECT jsonb_object_agg(transaction_type, total)
      FROM (
        SELECT transaction_type::TEXT, COALESCE(SUM(net_amount), 0) AS total
        FROM transactions
        WHERE to_user_id = p_creator_id AND created_at >= v_start_date
        GROUP BY transaction_type
      ) sub
    ),
    'earnings_daily', (
      SELECT COALESCE(jsonb_agg(day_data ORDER BY d), '[]'::JSONB)
      FROM (
        SELECT d, jsonb_build_object('date', d::TEXT, 'amount', COALESCE(SUM(t.net_amount), 0)) AS day_data
        FROM generate_series(v_start_date::DATE, CURRENT_DATE, '1 day') d
        LEFT JOIN transactions t ON t.to_user_id = p_creator_id
          AND t.created_at::DATE = d
        GROUP BY d
      ) days
    ),
    'top_posts', (
      SELECT COALESCE(jsonb_agg(post_data), '[]'::JSONB)
      FROM (
        SELECT jsonb_build_object(
          'id', p.id,
          'content', LEFT(p.content, 100),
          'post_type', p.post_type::TEXT,
          'like_count', p.like_count,
          'comment_count', p.comment_count,
          'view_count', p.view_count,
          'created_at', p.created_at,
          'revenue', COALESCE((
            SELECT SUM(t.net_amount) FROM transactions t 
            WHERE t.reference_id = p.id AND t.to_user_id = p_creator_id
          ), 0)
        ) AS post_data
        FROM posts p
        WHERE p.author_id = p_creator_id AND p.created_at >= v_start_date
        ORDER BY p.like_count + p.comment_count + p.view_count DESC
        LIMIT 10
      ) top
    ),
    'subscriber_growth', (
      SELECT COALESCE(jsonb_agg(growth_data ORDER BY d), '[]'::JSONB)
      FROM (
        SELECT d, jsonb_build_object('date', d::TEXT, 'count', (
          SELECT COUNT(*) FROM subscriptions
          WHERE creator_id = p_creator_id AND status = 'active' AND created_at <= d + INTERVAL '1 day'
        )) AS growth_data
        FROM generate_series(v_start_date::DATE, CURRENT_DATE, '1 day') d
      ) growth
    ),
    'engagement_rate', CASE 
      WHEN v_views_current > 0 
      THEN ROUND((v_likes_current + v_comments_current)::NUMERIC / v_views_current * 100, 2)
      ELSE 0
    END
  );

  RETURN v_result;
END;
$$;

-- 4. Mass Message RPC - send to all active subscribers
CREATE OR REPLACE FUNCTION send_mass_message(
  p_creator_id UUID,
  p_content TEXT,
  p_message_type TEXT DEFAULT 'text'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub RECORD;
  v_conv_id UUID;
  v_sent INTEGER := 0;
  v_failed INTEGER := 0;
  v_creator_is_creator BOOLEAN;
BEGIN
  -- Only creators can mass message
  SELECT is_creator INTO v_creator_is_creator
  FROM profiles WHERE id = p_creator_id;
  
  IF NOT v_creator_is_creator THEN
    RAISE EXCEPTION 'Only creators can send mass messages';
  END IF;

  IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
    RAISE EXCEPTION 'Message content cannot be empty';
  END IF;

  -- Loop through active subscribers
  FOR v_sub IN
    SELECT s.subscriber_id 
    FROM subscriptions s
    WHERE s.creator_id = p_creator_id 
      AND s.status = 'active'
      AND s.expires_at > NOW()
  LOOP
    BEGIN
      -- Get or create conversation
      SELECT c.id INTO v_conv_id
      FROM conversations c
      JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = p_creator_id
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = v_sub.subscriber_id
      LIMIT 1;

      IF v_conv_id IS NULL THEN
        INSERT INTO conversations DEFAULT VALUES RETURNING id INTO v_conv_id;
        INSERT INTO conversation_participants (conversation_id, user_id) VALUES (v_conv_id, p_creator_id);
        INSERT INTO conversation_participants (conversation_id, user_id) VALUES (v_conv_id, v_sub.subscriber_id);
      END IF;

      -- Send message
      INSERT INTO messages (conversation_id, sender_id, content, message_type)
      VALUES (v_conv_id, p_creator_id, p_content, p_message_type);

      -- Update conversation timestamp
      UPDATE conversations SET updated_at = NOW() WHERE id = v_conv_id;

      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('sent', v_sent, 'failed', v_failed);
END;
$$;

-- 5. Export Earnings RPC - returns transaction data for CSV export
CREATE OR REPLACE FUNCTION export_creator_earnings(
  p_creator_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID,
  transaction_date TIMESTAMPTZ,
  type TEXT,
  from_user TEXT,
  gross_amount NUMERIC,
  platform_fee NUMERIC,
  net_amount NUMERIC,
  status TEXT,
  reference_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() != p_creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    t.id AS transaction_id,
    t.created_at AS transaction_date,
    t.transaction_type::TEXT AS type,
    COALESCE(p.display_name, p.username, 'Anonymous') AS from_user,
    t.amount AS gross_amount,
    t.platform_fee,
    t.net_amount,
    t.status,
    t.reference_id
  FROM transactions t
  LEFT JOIN profiles p ON p.id = t.from_user_id
  WHERE t.to_user_id = p_creator_id
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date)
  ORDER BY t.created_at DESC;
END;
$$;

-- 6. Custom Request management RPCs

-- Creator responds to a request (accept/decline)
CREATE OR REPLACE FUNCTION respond_to_custom_request(
  p_request_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL,
  p_price NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF auth.uid() != v_request.creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending';
  END IF;

  IF p_action = 'accept' THEN
    UPDATE custom_requests 
    SET status = 'accepted', 
        creator_note = p_note,
        price = COALESCE(p_price, v_request.price),
        updated_at = NOW()
    WHERE id = p_request_id;
  ELSIF p_action = 'decline' THEN
    UPDATE custom_requests 
    SET status = 'declined', 
        creator_note = p_note,
        updated_at = NOW()
    WHERE id = p_request_id;
  ELSE
    RAISE EXCEPTION 'Invalid action. Use accept or decline.';
  END IF;

  RETURN jsonb_build_object('success', true, 'action', p_action);
END;
$$;

-- Creator marks a request as completed (with optional delivery)
CREATE OR REPLACE FUNCTION complete_custom_request(
  p_request_id UUID,
  p_delivery_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
  v_fee NUMERIC;
  v_net NUMERIC;
BEGIN
  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF auth.uid() != v_request.creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status != 'accepted' THEN
    RAISE EXCEPTION 'Request must be accepted before completing';
  END IF;

  -- Calculate fees
  v_fee := ROUND(v_request.price * 0.30, 2); -- 30% platform fee
  v_net := v_request.price - v_fee;

  -- Record transaction
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (v_request.requester_id, v_request.creator_id, 'custom_request', v_request.price, v_fee, v_net, p_request_id, 'completed');

  -- Mark request as completed
  UPDATE custom_requests 
  SET status = 'completed', 
      delivery_url = p_delivery_url,
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'net_amount', v_net);
END;
$$;

-- User cancels own pending request
CREATE OR REPLACE FUNCTION cancel_custom_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF auth.uid() != v_request.requester_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'Cannot cancel this request';
  END IF;

  UPDATE custom_requests SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Add custom_requests to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE custom_requests;

-- 7. Add accepts_custom_requests field to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepts_custom_requests BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_request_min_price DECIMAL(10,2) DEFAULT 25.00;
