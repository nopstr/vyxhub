-- Extend post_type enum with 'set' and 'video'
-- Must run outside a transaction (each migration is its own transaction)
ALTER TYPE post_type ADD VALUE IF NOT EXISTS 'set';
ALTER TYPE post_type ADD VALUE IF NOT EXISTS 'video';
