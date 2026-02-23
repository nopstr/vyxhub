-- Rebrand 'red' partner tier to 'red'

-- 1. Drop the existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_partner_tier_check;

-- 2. Update existing 'red' partners to 'red'
UPDATE profiles SET partner_tier = 'red' WHERE partner_tier = 'red';

-- 3. Add the new constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_partner_tier_check
  CHECK (partner_tier IN ('verified', 'red', 'gold'));
