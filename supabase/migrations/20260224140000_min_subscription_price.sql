-- Enforce minimum subscription price of $4.99
-- Fix any existing profiles with price below minimum

-- First fix any existing profiles with price below 4.99
UPDATE profiles 
SET subscription_price = 9.99 
WHERE is_creator = true AND (subscription_price IS NULL OR subscription_price < 4.99);

-- Add CHECK constraint to enforce minimum
ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS chk_subscription_price_minimum;

ALTER TABLE profiles 
  ADD CONSTRAINT chk_subscription_price_minimum 
  CHECK (subscription_price IS NULL OR subscription_price >= 4.99);

-- Also set default to 9.99 for the column
ALTER TABLE profiles 
  ALTER COLUMN subscription_price SET DEFAULT 9.99;
