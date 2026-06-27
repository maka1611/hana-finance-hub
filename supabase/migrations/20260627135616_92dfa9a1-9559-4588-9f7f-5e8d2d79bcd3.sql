ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS investor_allocation_policy text NOT NULL DEFAULT 'suggest'
    CHECK (investor_allocation_policy IN ('manual','suggest','enforce'));