
-- 1. Extend payment_schedules
ALTER TABLE public.payment_schedules
  ADD COLUMN IF NOT EXISTS original_due_date date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carried_in numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carried_out numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carried_to_schedule_id uuid;

-- 2. Add note to payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS note text;

-- 3. payment_schedule_history
CREATE TABLE IF NOT EXISTS public.payment_schedule_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid NOT NULL REFERENCES public.payment_schedules(id) ON DELETE CASCADE,
  old_due_date date NOT NULL,
  new_due_date date NOT NULL,
  reason text,
  comment text,
  changed_by uuid NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_schedule_history TO authenticated;
GRANT ALL ON public.payment_schedule_history TO service_role;

ALTER TABLE public.payment_schedule_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View schedule history of own contracts"
ON public.payment_schedule_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.payment_schedules ps
    JOIN public.installment_contracts c ON c.id = ps.contract_id
    WHERE ps.id = payment_schedule_history.schedule_id
      AND (c.client_id = auth.uid() OR public.is_staff(auth.uid()))
  )
);

-- 4. payment_carryovers
CREATE TABLE IF NOT EXISTS public.payment_carryovers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_schedule_id uuid NOT NULL REFERENCES public.payment_schedules(id) ON DELETE CASCADE,
  to_schedule_id uuid REFERENCES public.payment_schedules(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  mode text NOT NULL,
  note text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_carryovers TO authenticated;
GRANT ALL ON public.payment_carryovers TO service_role;

ALTER TABLE public.payment_carryovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View carryovers of own contracts"
ON public.payment_carryovers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.payment_schedules ps
    JOIN public.installment_contracts c ON c.id = ps.contract_id
    WHERE ps.id = payment_carryovers.from_schedule_id
      AND (c.client_id = auth.uid() OR public.is_staff(auth.uid()))
  )
);

CREATE INDEX IF NOT EXISTS idx_psh_schedule ON public.payment_schedule_history(schedule_id);
CREATE INDEX IF NOT EXISTS idx_pc_from ON public.payment_carryovers(from_schedule_id);
CREATE INDEX IF NOT EXISTS idx_pc_to ON public.payment_carryovers(to_schedule_id);
