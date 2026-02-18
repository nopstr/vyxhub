-- Model/Creator profile enhancements and subscription system

-- Add creator-specific fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS amazon_wishlist_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_accepting_customs BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_request_price DECIMAL(10,2) DEFAULT 25.00;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_activity_status BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_free_messages BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS message_price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS geoblocking_regions TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_method TEXT DEFAULT 'bank_transfer';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS creator_category TEXT DEFAULT 'other';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscriber_count INTEGER DEFAULT 0;

-- Subscription management: allow update and cancel
CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = subscriber_id);

CREATE POLICY "Users can delete own subscriptions"
  ON subscriptions FOR DELETE
  USING (auth.uid() = subscriber_id);
