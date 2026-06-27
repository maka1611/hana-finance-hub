DO $$ BEGIN
  CREATE TYPE public.company_funds_op_type AS ENUM ('deposit','withdraw','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.company_funds_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_type public.company_funds_op_type NOT NULL,
  amount numeric(14,2) NOT NULL,
  operation_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_funds_operations TO authenticated;
GRANT ALL ON public.company_funds_operations TO service_role;

ALTER TABLE public.company_funds_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages company funds ops"
ON public.company_funds_operations FOR ALL
USING (public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE INDEX IF NOT EXISTS idx_cfo_date ON public.company_funds_operations(operation_date DESC);

CREATE TRIGGER cfo_touch_updated_at
BEFORE UPDATE ON public.company_funds_operations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.company_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount numeric(14,2) NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_expenses TO authenticated;
GRANT ALL ON public.company_expenses TO service_role;

ALTER TABLE public.company_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages company expenses"
ON public.company_expenses FOR ALL
USING (public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE INDEX IF NOT EXISTS idx_ce_date ON public.company_expenses(expense_date DESC);

CREATE TRIGGER ce_touch_updated_at
BEFORE UPDATE ON public.company_expenses
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS company_funds_min_reserve numeric(14,2) NOT NULL DEFAULT 0;