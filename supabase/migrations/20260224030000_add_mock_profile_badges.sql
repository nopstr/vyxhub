-- Add badges to specific mock profiles
UPDATE public.profiles
SET is_verified = true,
    partner_tier = 'gold'
WHERE id = 'a1111111-1111-1111-1111-111111111111'; -- Luna Vyx

UPDATE public.profiles
SET is_verified = true,
    partner_tier = 'red'
WHERE id = 'a2222222-2222-2222-2222-222222222222'; -- Jade Rivers

UPDATE public.profiles
SET is_verified = true,
    partner_tier = 'verified'
WHERE id = 'a3333333-3333-3333-3333-333333333333'; -- Marcus Steel

-- Refresh trending views to reflect the added badges
SELECT refresh_trending();
