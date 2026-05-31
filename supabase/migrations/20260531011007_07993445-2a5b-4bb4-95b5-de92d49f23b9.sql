
-- 1) installment_contracts: drop client INSERT policy
DROP POLICY IF EXISTS "Clients insert own contracts" ON public.installment_contracts;

-- 2) payment_schedules: drop client INSERT policy
DROP POLICY IF EXISTS "Insert schedules of own contracts" ON public.payment_schedules;

-- 3) profiles: block clients from changing markup_rate
CREATE OR REPLACE FUNCTION public.profiles_protect_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    IF NEW.markup_rate IS DISTINCT FROM OLD.markup_rate THEN
      RAISE EXCEPTION 'Only staff can change markup_rate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged_fields ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_privileged_fields();

-- 4) user_roles: admins cannot grant/remove the owner role
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
CREATE POLICY "Admins insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR (public.has_role(auth.uid(), 'admin') AND role <> 'owner')
  );

DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;
CREATE POLICY "Admins delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR (public.has_role(auth.uid(), 'admin') AND role <> 'owner')
  );

-- 5) client_secrets: remove staff access; only service_role (server) can read
DROP POLICY IF EXISTS "Staff reads client secrets" ON public.client_secrets;
DROP POLICY IF EXISTS "Staff inserts client secrets" ON public.client_secrets;
DROP POLICY IF EXISTS "Staff updates client secrets" ON public.client_secrets;
DROP POLICY IF EXISTS "Staff deletes client secrets" ON public.client_secrets;
REVOKE ALL ON public.client_secrets FROM authenticated, anon;

-- 6) Email queue helper functions: fix search_path and restrict EXECUTE
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
