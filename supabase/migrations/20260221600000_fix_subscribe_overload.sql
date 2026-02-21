-- Fix: Drop the old 3-param subscribe_to_creator overload that conflicts with
-- the newer 4-param version (p_referrer_id DEFAULT NULL).
-- PostgreSQL can't disambiguate when called with 3 args.
DROP FUNCTION IF EXISTS subscribe_to_creator(UUID, UUID, DECIMAL);
