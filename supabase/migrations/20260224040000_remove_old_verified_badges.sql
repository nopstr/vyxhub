-- Remove old is_verified badges from mock profiles that have partner tiers
UPDATE public.profiles
SET is_verified = false
WHERE id IN (
  'a1111111-1111-1111-1111-111111111111', -- Luna Vyx
  'a2222222-2222-2222-2222-222222222222', -- Jade Rivers
  'a3333333-3333-3333-3333-333333333333'  -- Marcus Steel
);

-- Refresh trending views to reflect the removed badges
SELECT refresh_trending();
