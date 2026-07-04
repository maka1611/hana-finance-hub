ALTER TABLE public.installment_contracts
  ADD COLUMN IF NOT EXISTS investor_profit_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS investor_profit_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.installment_contracts.investor_profit_amount IS
  'Fixed profit for investor in RUB for this specific deal. Used when investor_profit_locked = true; allows giving client discount at company expense while keeping investor payout intact.';
COMMENT ON COLUMN public.installment_contracts.investor_profit_locked IS
  'When true, use investor_profit_amount as-is; otherwise compute investor profit dynamically from markup_amount * investors.profit_share_rate.';