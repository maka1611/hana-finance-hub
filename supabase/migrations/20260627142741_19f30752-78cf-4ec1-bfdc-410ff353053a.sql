
CREATE TABLE public.ai_api_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  endpoint text NOT NULL,
  method text NOT NULL,
  ip text,
  status int NOT NULL,
  rows_returned int,
  error text,
  meta jsonb
);
GRANT SELECT ON public.ai_api_access_log TO authenticated;
GRANT ALL ON public.ai_api_access_log TO service_role;
ALTER TABLE public.ai_api_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_ai_log" ON public.ai_api_access_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));
CREATE INDEX ai_api_access_log_created_idx ON public.ai_api_access_log(created_at DESC);
