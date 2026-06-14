
-- 1) Lock down privileged column updates on profiles via trigger.
CREATE OR REPLACE FUNCTION public.prevent_privileged_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.markup_rate IS DISTINCT FROM OLD.markup_rate
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.deleted_reason IS DISTINCT FROM OLD.deleted_reason THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privileged_profile_updates ON public.profiles;
CREATE TRIGGER trg_prevent_privileged_profile_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_privileged_profile_updates();

-- 2) Set immutable search_path on email queue functions.
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pg_temp;
