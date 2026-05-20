-- Таблица для нескольких фото документов клиента
CREATE TABLE IF NOT EXISTS public.client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('passport','driver_license')),
  file_path text NOT NULL,
  signed_url text NOT NULL,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid
);

CREATE INDEX IF NOT EXISTS idx_client_documents_user_kind
  ON public.client_documents(user_id, kind, created_at DESC);

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own documents"
  ON public.client_documents FOR SELECT
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

-- Журнал действий админов
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_email text,
  actor_name text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  summary text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor
  ON public.admin_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON public.admin_audit_log(entity_type, entity_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff sees audit log"
  ON public.admin_audit_log FOR SELECT
  USING (public.is_staff(auth.uid()));