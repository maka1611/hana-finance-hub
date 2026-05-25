
-- Investors table
CREATE TABLE public.investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  email text,
  comment text,
  total_capital numeric NOT NULL DEFAULT 0,
  profit_share_rate numeric NOT NULL DEFAULT 0.5 CHECK (profit_share_rate >= 0 AND profit_share_rate <= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages investors" ON public.investors
  FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TRIGGER investors_touch_updated_at
  BEFORE UPDATE ON public.investors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Contributions history
CREATE TABLE public.investor_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_investor_contributions_investor ON public.investor_contributions(investor_id);

ALTER TABLE public.investor_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages contributions" ON public.investor_contributions
  FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- Link contracts to investor
ALTER TABLE public.installment_contracts
  ADD COLUMN investor_id uuid REFERENCES public.investors(id) ON DELETE SET NULL;

CREATE INDEX idx_contracts_investor ON public.installment_contracts(investor_id);
