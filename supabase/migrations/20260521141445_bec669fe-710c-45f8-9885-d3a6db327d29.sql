-- 1. Client secrets table (admin-visible initial password)
CREATE TABLE public.client_secrets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  initial_password text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff reads client secrets"
  ON public.client_secrets FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff inserts client secrets"
  ON public.client_secrets FOR INSERT
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff updates client secrets"
  ON public.client_secrets FOR UPDATE
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff deletes client secrets"
  ON public.client_secrets FOR DELETE
  USING (public.is_staff(auth.uid()));

CREATE TRIGGER trg_client_secrets_touch
  BEFORE UPDATE ON public.client_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Guarantors
CREATE TABLE public.contract_guarantors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.installment_contracts(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contract_guarantors_contract ON public.contract_guarantors(contract_id);
ALTER TABLE public.contract_guarantors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages guarantors"
  ON public.contract_guarantors FOR ALL
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.guarantor_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guarantor_id uuid NOT NULL REFERENCES public.contract_guarantors(id) ON DELETE CASCADE,
  phone text NOT NULL,
  label text,
  channels text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_guarantor_phones_guarantor ON public.guarantor_phones(guarantor_id);
ALTER TABLE public.guarantor_phones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages guarantor phones"
  ON public.guarantor_phones FOR ALL
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.guarantor_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guarantor_id uuid NOT NULL REFERENCES public.contract_guarantors(id) ON DELETE CASCADE,
  email text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_guarantor_emails_guarantor ON public.guarantor_emails(guarantor_id);
ALTER TABLE public.guarantor_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manages guarantor emails"
  ON public.guarantor_emails FOR ALL
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));