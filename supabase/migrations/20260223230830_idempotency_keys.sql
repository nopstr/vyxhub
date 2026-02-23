-- ═══════════════════════════════════════════════════════════════════════════
-- ADD IDEMPOTENCY KEY UNIQUE CONSTRAINTS
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add unique index to payment_sessions for idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_sessions_idempotency_key 
ON payment_sessions (user_id, (metadata->>'idempotency_key')) 
WHERE metadata->>'idempotency_key' IS NOT NULL;

-- 2. Add unique index to crypto_payments for idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_payments_idempotency_key 
ON crypto_payments (user_id, (payment_metadata->>'idempotency_key')) 
WHERE payment_metadata->>'idempotency_key' IS NOT NULL;
