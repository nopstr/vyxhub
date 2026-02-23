-- ═══════════════════════════════════════════════════════════════════════
-- EXTEND SYSTEM ROLES: Support Lead + Management Lead
-- Must be in its own migration so enum values are committed
-- before being used in subsequent migrations.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TYPE system_role ADD VALUE IF NOT EXISTS 'support_lead';
ALTER TYPE system_role ADD VALUE IF NOT EXISTS 'management_lead';
