-- Enable custom requests for Luna Vyx
UPDATE profiles
SET accepts_custom_requests = true, custom_request_min_price = 25.00
WHERE username = 'lunavyx';
