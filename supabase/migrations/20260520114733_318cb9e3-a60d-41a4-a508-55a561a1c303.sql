ALTER TABLE public.user_phones
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT '{}';