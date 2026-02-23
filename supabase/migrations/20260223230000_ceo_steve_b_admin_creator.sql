-- Make ceo_steve_b an admin and a creator
UPDATE profiles
SET system_role = 'admin',
    is_creator = TRUE
WHERE username = 'ceo_steve_b';
