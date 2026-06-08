DROP POLICY "Clients see own contracts" ON public.installment_contracts;
CREATE POLICY "Clients see own contracts" ON public.installment_contracts
FOR SELECT
USING ((auth.uid() = client_id AND deleted_at IS NULL) OR is_staff(auth.uid()));