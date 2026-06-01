
-- Extend payment_status enum
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'partial';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'carried_over';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'rescheduled';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'closed_manual';
