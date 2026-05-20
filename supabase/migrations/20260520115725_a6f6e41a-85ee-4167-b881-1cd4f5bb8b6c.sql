
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS passport_series TEXT,
  ADD COLUMN IF NOT EXISTS passport_number TEXT,
  ADD COLUMN IF NOT EXISTS passport_issued_by TEXT,
  ADD COLUMN IF NOT EXISTS passport_issued_at DATE,
  ADD COLUMN IF NOT EXISTS passport_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS driver_license_number TEXT,
  ADD COLUMN IF NOT EXISTS driver_license_categories TEXT,
  ADD COLUMN IF NOT EXISTS driver_license_issued_at DATE,
  ADD COLUMN IF NOT EXISTS driver_license_photo_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Staff full access to client documents" ON storage.objects;
CREATE POLICY "Staff full access to client documents"
ON storage.objects FOR ALL
USING (bucket_id = 'client-documents' AND public.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'client-documents' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Users view own client documents" ON storage.objects;
CREATE POLICY "Users view own client documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
