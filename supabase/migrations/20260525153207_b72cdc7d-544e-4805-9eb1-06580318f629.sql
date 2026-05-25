ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_term_months integer;

ALTER TABLE public.investor_contributions
  ADD COLUMN IF NOT EXISTS operation_date date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS term_months integer,
  ADD COLUMN IF NOT EXISTS due_date date;

UPDATE public.investor_contributions
SET operation_date = created_at::date
WHERE operation_date = current_date AND created_at::date <> current_date;