
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS markup_rate numeric NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_markup_rate_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_markup_rate_check
  CHECK (markup_rate IS NULL OR (markup_rate >= 0 AND markup_rate <= 1));

CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true,
  default_markup_rate numeric NOT NULL DEFAULT 0.045,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = true),
  CONSTRAINT app_settings_default_markup_rate_check
    CHECK (default_markup_rate >= 0 AND default_markup_rate <= 1)
);

INSERT INTO public.app_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated reads settings" ON public.app_settings;
CREATE POLICY "Authenticated reads settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Staff updates settings" ON public.app_settings;
CREATE POLICY "Staff updates settings"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS app_settings_touch_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_touch_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
