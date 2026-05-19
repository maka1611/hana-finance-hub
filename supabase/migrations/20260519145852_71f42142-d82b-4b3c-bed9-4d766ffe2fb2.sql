
CREATE TYPE public.application_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.installment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  product_name text NOT NULL,
  product_description text,
  product_image_url text,
  product_price numeric NOT NULL,
  down_payment numeric NOT NULL DEFAULT 0,
  term_months integer NOT NULL,
  first_payment_date date,
  client_full_name text,
  client_telegram text,
  client_phone text,
  client_comment text,
  status public.application_status NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  contract_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.installment_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients insert own applications"
ON public.installment_applications FOR INSERT
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients see own applications"
ON public.installment_applications FOR SELECT
USING (auth.uid() = client_id OR public.is_staff(auth.uid()));

CREATE POLICY "Clients update own pending applications"
ON public.installment_applications FOR UPDATE
USING (auth.uid() = client_id AND status = 'pending');

CREATE POLICY "Staff updates applications"
ON public.installment_applications FOR UPDATE
USING (public.is_staff(auth.uid()));

CREATE TRIGGER touch_installment_applications
BEFORE UPDATE ON public.installment_applications
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_applications_client ON public.installment_applications(client_id);
CREATE INDEX idx_applications_status ON public.installment_applications(status);

CREATE TABLE public.user_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_phones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own phones"
ON public.user_phones FOR SELECT
USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

CREATE POLICY "Users insert own phones"
ON public.user_phones FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own phones"
ON public.user_phones FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_user_phones_user ON public.user_phones(user_id);
