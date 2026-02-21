-- ============================================================================
-- NOTIFICATION SYSTEM V2
-- Fixes: tip notification bug, preference enforcement, pagination support
-- Adds: push subscriptions, email notification queue, rich metadata
-- ============================================================================

-- ─── 1. FIX TIP NOTIFICATION (wrong column names in send_tip) ──────────────

-- The send_tip function in 20260221000000 inserted into notifications with
-- wrong column names (type, from_user_id, post_id, metadata). We need to
-- recreate it with the correct columns.

CREATE OR REPLACE FUNCTION send_tip(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_amount DECIMAL,
  p_post_id UUID DEFAULT NULL,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fee DECIMAL;
  v_net DECIMAL;
  v_tx_id UUID;
  v_creator_exists BOOLEAN;
BEGIN
  -- Validate
  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot tip yourself';
  END IF;
  IF p_amount < 1 OR p_amount > 200 THEN
    RAISE EXCEPTION 'Tip must be between $1 and $200';
  END IF;

  SELECT is_creator INTO v_creator_exists FROM profiles WHERE id = p_to_user_id;
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

  -- Create notification (FIXED: correct column names)
  INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
  VALUES (
    p_to_user_id,
    p_from_user_id,
    'tip',
    p_post_id,
    CASE
      WHEN p_message IS NOT NULL AND p_message <> ''
        THEN format('tipped you $%s — %s', p_amount, p_message)
      ELSE format('tipped you $%s', p_amount)
    END
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


-- ─── 2. ENFORCE NOTIFICATION PREFERENCES IN TRIGGERS ───────────────────────

-- Helper: check if user wants this notification type
CREATE OR REPLACE FUNCTION should_notify(p_user_id UUID, p_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_prefs JSONB;
  v_pref_key TEXT;
BEGIN
  SELECT notification_preferences INTO v_prefs FROM profiles WHERE id = p_user_id;

  -- Map notification_type to preference key
  v_pref_key := CASE p_type
    WHEN 'like' THEN 'likes'
    WHEN 'comment' THEN 'comments'
    WHEN 'follow' THEN 'follows'
    WHEN 'message' THEN 'messages'
    WHEN 'subscription' THEN 'subscriptions'
    WHEN 'tip' THEN 'tips'
    WHEN 'mention' THEN 'mentions'
    WHEN 'new_post' THEN 'promotions'
    ELSE NULL
  END;

  -- Default to true if no prefs exist or key not found
  IF v_prefs IS NULL OR v_pref_key IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN COALESCE((v_prefs ->> v_pref_key)::boolean, TRUE);
END;
$$;

-- Recreate ALL trigger functions with preference checks

CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.follower_id = NEW.following_id THEN RETURN NEW; END IF;
  IF NOT should_notify(NEW.following_id, 'follow') THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
  VALUES (NEW.following_id, NEW.follower_id, 'follow', NEW.id, 'started following you');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post_author UUID;
BEGIN
  SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;
  IF NEW.user_id = v_post_author THEN RETURN NEW; END IF;
  IF NOT should_notify(v_post_author, 'like') THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
  VALUES (v_post_author, NEW.user_id, 'like', NEW.post_id, 'reacted to your post');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post_author UUID;
  v_parent_author UUID;
BEGIN
  SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;

  IF NEW.author_id <> v_post_author AND should_notify(v_post_author, 'comment') THEN
    INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
    VALUES (v_post_author, NEW.author_id, 'comment', NEW.post_id, 'commented on your post');
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT author_id INTO v_parent_author FROM comments WHERE id = NEW.parent_id;
    IF v_parent_author IS NOT NULL AND v_parent_author <> NEW.author_id
       AND v_parent_author <> v_post_author AND should_notify(v_parent_author, 'comment') THEN
      INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
      VALUES (v_parent_author, NEW.author_id, 'comment', NEW.post_id, 'replied to your comment');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_on_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.subscriber_id = NEW.creator_id THEN RETURN NEW; END IF;
  IF NOT should_notify(NEW.creator_id, 'subscription') THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
  VALUES (NEW.creator_id, NEW.subscriber_id, 'subscription', NEW.id, 'subscribed to you');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_on_purchase()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post_author UUID;
BEGIN
  SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;
  IF NEW.buyer_id = v_post_author THEN RETURN NEW; END IF;
  IF NOT should_notify(v_post_author, 'subscription') THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
  VALUES (v_post_author, NEW.buyer_id, 'subscription', NEW.post_id, 'purchased your content');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT user_id FROM conversation_participants
    WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id
  LOOP
    IF should_notify(r.user_id, 'message') THEN
      INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
      VALUES (r.user_id, NEW.sender_id, 'message', NEW.conversation_id, 'sent you a message');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;


-- ─── 3. PUSH NOTIFICATION SUBSCRIPTIONS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── 4. EMAIL NOTIFICATION QUEUE ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  email_type TEXT NOT NULL CHECK (email_type IN (
    'notification_digest', 'new_subscriber', 'new_tip',
    'custom_request', 'account_alert', 'marketing'
  )),
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_pending ON email_queue(status, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_user ON email_queue(user_id);

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- Only system can insert/update (via SECURITY DEFINER functions)
-- Users can view their own email history
CREATE POLICY "Users can view own email history"
  ON email_queue FOR SELECT
  USING (auth.uid() = user_id);


-- ─── 5. ADD EMAIL PREFERENCES COLUMNS ──────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_digest_frequency TEXT DEFAULT 'daily'
  CHECK (email_digest_frequency IN ('realtime', 'daily', 'weekly', 'never'));


-- ─── 6. QUEUE EMAIL ON HIGH-VALUE NOTIFICATIONS ────────────────────────────

-- Function to queue an email when notable events happen
CREATE OR REPLACE FUNCTION queue_notification_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user RECORD;
  v_actor RECORD;
  v_subject TEXT;
  v_body TEXT;
BEGIN
  -- Only queue for high-value notification types
  IF NEW.notification_type NOT IN ('subscription', 'tip', 'follow') THEN
    RETURN NEW;
  END IF;

  -- Check if user has email notifications enabled
  SELECT id, email, display_name, email_notifications, email_digest_frequency
    INTO v_user FROM profiles JOIN auth.users au ON au.id = profiles.id
    WHERE profiles.id = NEW.user_id;

  IF v_user IS NULL OR NOT COALESCE(v_user.email_notifications, TRUE) THEN
    RETURN NEW;
  END IF;

  -- Skip if user wants digest only (not realtime)
  IF COALESCE(v_user.email_digest_frequency, 'daily') <> 'realtime' THEN
    RETURN NEW;
  END IF;

  -- Get actor info
  SELECT display_name, username INTO v_actor FROM profiles WHERE id = NEW.actor_id;

  -- Build email
  v_subject := CASE NEW.notification_type
    WHEN 'subscription' THEN format('New subscriber: %s', COALESCE(v_actor.display_name, 'Someone'))
    WHEN 'tip' THEN format('%s sent you a tip!', COALESCE(v_actor.display_name, 'Someone'))
    WHEN 'follow' THEN format('%s followed you', COALESCE(v_actor.display_name, 'Someone'))
    ELSE 'New notification on VyxHub'
  END;

  v_body := format(
    '<div style="font-family:system-ui;max-width:500px;margin:0 auto;padding:20px;">'
    '<h2 style="color:#6366f1;">VyxHub</h2>'
    '<p style="font-size:16px;color:#333;">%s</p>'
    '<p style="color:#666;">%s</p>'
    '<a href="https://vyxhub.vercel.app/notifications" style="display:inline-block;padding:10px 20px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;margin-top:10px;">View on VyxHub</a>'
    '<p style="font-size:12px;color:#999;margin-top:20px;">You can manage email preferences in Settings.</p>'
    '</div>',
    v_subject,
    COALESCE(NEW.message, '')
  );

  INSERT INTO email_queue (user_id, email_type, subject, body_html, body_text)
  VALUES (
    NEW.user_id,
    CASE NEW.notification_type
      WHEN 'subscription' THEN 'new_subscriber'
      WHEN 'tip' THEN 'new_tip'
      ELSE 'notification_digest'
    END,
    v_subject,
    v_body,
    format('%s — %s. View at https://vyxhub.vercel.app/notifications', v_subject, COALESCE(NEW.message, ''))
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_notification_email
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION queue_notification_email();


-- ─── 7. PAGINATED NOTIFICATION FETCH ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_notifications_paginated(
  p_user_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 30,
  p_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  actor_id UUID,
  notification_type notification_type,
  reference_id UUID,
  message TEXT,
  is_read BOOLEAN,
  priority TEXT,
  created_at TIMESTAMPTZ,
  actor_username TEXT,
  actor_display_name TEXT,
  actor_avatar_url TEXT,
  post_preview_text TEXT,
  post_preview_media TEXT,
  post_type TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.user_id,
    n.actor_id,
    n.notification_type,
    n.reference_id,
    n.message,
    n.is_read,
    n.priority,
    n.created_at,
    p.username AS actor_username,
    p.display_name AS actor_display_name,
    p.avatar_url AS actor_avatar_url,
    -- Rich preview: fetch post content snippet if reference is a post
    CASE
      WHEN n.notification_type IN ('like', 'comment', 'new_post')
        THEN LEFT((SELECT content FROM posts WHERE posts.id = n.reference_id), 120)
      ELSE NULL
    END AS post_preview_text,
    CASE
      WHEN n.notification_type IN ('like', 'comment', 'new_post')
        THEN (SELECT media_urls[1] FROM posts WHERE posts.id = n.reference_id)
      ELSE NULL
    END AS post_preview_media,
    CASE
      WHEN n.notification_type IN ('like', 'comment', 'new_post')
        THEN (SELECT posts.post_type::text FROM posts WHERE posts.id = n.reference_id)
      ELSE NULL
    END AS post_type
  FROM notifications n
  LEFT JOIN profiles p ON p.id = n.actor_id
  WHERE n.user_id = p_user_id
    AND (p_cursor IS NULL OR n.created_at < p_cursor)
    AND (p_type IS NULL OR n.notification_type::text = p_type)
  ORDER BY
    CASE n.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
    n.created_at DESC
  LIMIT p_limit;
END;
$$;


-- ─── 8. NOTIFICATION SUMMARY/COUNTS BY TYPE ────────────────────────────────

CREATE OR REPLACE FUNCTION get_notification_counts(p_user_id UUID)
RETURNS TABLE (notification_type TEXT, total BIGINT, unread BIGINT)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.notification_type::text,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE NOT n.is_read)::bigint AS unread
  FROM notifications n
  WHERE n.user_id = p_user_id
    AND n.created_at > NOW() - INTERVAL '30 days'
  GROUP BY n.notification_type;
END;
$$;


-- ─── 9. DAILY EMAIL DIGEST FUNCTION ────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_daily_digests()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER := 0;
  v_user RECORD;
  v_notifs RECORD;
  v_body TEXT;
  v_unread_count INTEGER;
BEGIN
  FOR v_user IN
    SELECT p.id, p.display_name, p.email_digest_frequency
    FROM profiles p
    WHERE p.email_notifications = TRUE
      AND p.email_digest_frequency = 'daily'
  LOOP
    -- Count unread notifications from last 24h
    SELECT COUNT(*) INTO v_unread_count
    FROM notifications
    WHERE user_id = v_user.id
      AND is_read = FALSE
      AND created_at > NOW() - INTERVAL '24 hours';

    IF v_unread_count > 0 THEN
      v_body := format(
        '<div style="font-family:system-ui;max-width:500px;margin:0 auto;padding:20px;">'
        '<h2 style="color:#6366f1;">VyxHub Daily Digest</h2>'
        '<p style="font-size:16px;color:#333;">Hey %s, you have %s unread notification%s!</p>'
        '<a href="https://vyxhub.vercel.app/notifications" style="display:inline-block;padding:10px 20px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;margin-top:10px;">View Notifications</a>'
        '<p style="font-size:12px;color:#999;margin-top:20px;">You can change digest frequency in Settings.</p>'
        '</div>',
        COALESCE(v_user.display_name, 'there'),
        v_unread_count,
        CASE WHEN v_unread_count = 1 THEN '' ELSE 's' END
      );

      INSERT INTO email_queue (user_id, email_type, subject, body_html, body_text, scheduled_for)
      VALUES (
        v_user.id,
        'notification_digest',
        format('You have %s unread notifications', v_unread_count),
        v_body,
        format('Hey %s, you have %s unread notifications. View at https://vyxhub.vercel.app/notifications',
          COALESCE(v_user.display_name, 'there'), v_unread_count),
        NOW()
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Schedule daily digest at 9am UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('daily-email-digest', '0 9 * * *', 'SELECT generate_daily_digests();');
  ELSE
    RAISE NOTICE 'pg_cron not enabled. Enable it for daily email digests.';
  END IF;
END $$;


-- ─── 10. ADDITIONAL INDEX FOR CURSOR PAGINATION ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notifications_cursor
  ON notifications(user_id, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type_filter
  ON notifications(user_id, notification_type, created_at DESC);
