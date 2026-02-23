-- ─── REBRAND NOTIFICATION EMAIL TEMPLATES: VyxHub → Heatly ─────────────────
-- Updates queue_notification_email() and generate_daily_digests() functions
-- to use Heatly branding and heatly.vip URLs.

-- 1. Rebrand queue_notification_email trigger function
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
    ELSE 'New notification on Heatly'
  END;

  v_body := format(
    '<div style="font-family:system-ui;max-width:500px;margin:0 auto;padding:20px;">'
    '<h2 style="color:#6366f1;">Heatly</h2>'
    '<p style="font-size:16px;color:#333;">%s</p>'
    '<p style="color:#666;">%s</p>'
    '<a href="https://heatly.vip/notifications" style="display:inline-block;padding:10px 20px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;margin-top:10px;">View on Heatly</a>'
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
    format('%s — %s. View at https://heatly.vip/notifications', v_subject, COALESCE(NEW.message, ''))
  );

  RETURN NEW;
END;
$$;


-- 2. Rebrand generate_daily_digests function
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
        '<h2 style="color:#6366f1;">Heatly Daily Digest</h2>'
        '<p style="font-size:16px;color:#333;">Hey %s, you have %s unread notification%s!</p>'
        '<a href="https://heatly.vip/notifications" style="display:inline-block;padding:10px 20px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;margin-top:10px;">View Notifications</a>'
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
        format('Hey %s, you have %s unread notifications. View at https://heatly.vip/notifications',
          COALESCE(v_user.display_name, 'there'), v_unread_count),
        NOW()
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
