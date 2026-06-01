
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS investments_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS investments_min_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.investor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  amount numeric NOT NULL,
  desired_monthly_rate numeric NOT NULL,
  term_months integer,
  comment text,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.investor_applications TO authenticated;
GRANT ALL ON public.investor_applications TO service_role;

ALTER TABLE public.investor_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own investor applications" ON public.investor_applications;
CREATE POLICY "Users insert own investor applications"
  ON public.investor_applications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own investor applications" ON public.investor_applications;
CREATE POLICY "Users see own investor applications"
  ON public.investor_applications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff updates investor applications" ON public.investor_applications;
CREATE POLICY "Staff updates investor applications"
  ON public.investor_applications FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS touch_investor_applications ON public.investor_applications;
CREATE TRIGGER touch_investor_applications
  BEFORE UPDATE ON public.investor_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
