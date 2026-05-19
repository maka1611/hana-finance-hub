
-- 1. Новые поля договора
ALTER TABLE public.installment_contracts
  ADD COLUMN IF NOT EXISTS client_full_name text,
  ADD COLUMN IF NOT EXISTS client_telegram text,
  ADD COLUMN IF NOT EXISTS client_comment text,
  ADD COLUMN IF NOT EXISTS product_description text;

-- 2. RLS на user_roles: разрешить owner/admin управлять ролями
CREATE POLICY "Admins insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins delete roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 3. Индексы для платежей
CREATE INDEX IF NOT EXISTS idx_payment_schedules_due_date
  ON public.payment_schedules (due_date);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_status
  ON public.payment_schedules (status);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_contract
  ON public.payment_schedules (contract_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client
  ON public.installment_contracts (client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status
  ON public.installment_contracts (status);
