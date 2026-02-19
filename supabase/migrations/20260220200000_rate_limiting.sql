-- Rate limiting for posts
CREATE OR REPLACE FUNCTION check_post_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_posts_count INT;
  daily_posts_count INT;
BEGIN
  -- Check for posts in the last 10 seconds (spam prevention)
  SELECT COUNT(*) INTO recent_posts_count
  FROM posts
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '10 seconds';

  IF recent_posts_count > 0 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before posting again.';
  END IF;

  -- Check for posts in the last 24 hours (abuse prevention)
  SELECT COUNT(*) INTO daily_posts_count
  FROM posts
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '24 hours';

  IF daily_posts_count >= 100 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Daily post limit reached.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_post_rate_limit
  BEFORE INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION check_post_rate_limit();

-- Rate limiting for messages
CREATE OR REPLACE FUNCTION check_message_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_messages_count INT;
  daily_messages_count INT;
BEGIN
  -- Check for messages in the last 2 seconds (spam prevention)
  SELECT COUNT(*) INTO recent_messages_count
  FROM messages
  WHERE sender_id = NEW.sender_id
    AND created_at > NOW() - INTERVAL '2 seconds';

  IF recent_messages_count > 0 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before sending another message.';
  END IF;

  -- Check for messages in the last 24 hours (abuse prevention)
  SELECT COUNT(*) INTO daily_messages_count
  FROM messages
  WHERE sender_id = NEW.sender_id
    AND created_at > NOW() - INTERVAL '24 hours';

  IF daily_messages_count >= 500 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Daily message limit reached.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_message_rate_limit
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION check_message_rate_limit();
