-- Update Luna Vyx to have a message paywall
UPDATE public.profiles
SET message_price = 5.00, allow_free_messages = false
WHERE username = 'luna_vyx';
