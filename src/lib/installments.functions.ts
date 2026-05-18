import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcInstallment, buildSchedule, DEFAULT_MARKUP_RATE } from "@/lib/installment";

const CreateSchema = z.object({
  productName: z.string().min(1).max(200),
  productImageUrl: z.string().url().max(500).optional().nullable(),
  productPrice: z.number().positive().max(1_000_000_000),
  downPayment: z.number().min(0).max(1_000_000_000),
  termMonths: z.number().int().min(1).max(24),
});

export const createInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const calc = calcInstallment({
      productPrice: data.productPrice,
      downPayment: data.downPayment,
      termMonths: data.termMonths,
    });
    const startDate = new Date();
    const { data: contract, error } = await supabase
      .from("installment_contracts")
      .insert({
        client_id: userId,
        product_name: data.productName,
        product_image_url: data.productImageUrl ?? null,
        product_price: data.productPrice,
        down_payment: data.downPayment,
        principal: calc.principal,
        markup_rate: DEFAULT_MARKUP_RATE,
        markup_amount: calc.markupAmount,
        total_sale_price: calc.totalSalePrice,
        monthly_payment: calc.monthlyPayment,
        term_months: calc.termMonths,
        start_date: startDate.toISOString().slice(0, 10),
        status: "active",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const schedule = buildSchedule(startDate, calc.termMonths, calc.monthlyPayment).map((s) => ({
      contract_id: contract.id,
      seq: s.seq,
      due_date: s.dueDate.toISOString().slice(0, 10),
      amount: s.amount,
      status: "pending" as const,
    }));
    const { error: schedErr } = await supabase.from("payment_schedules").insert(schedule);
    if (schedErr) throw new Error(schedErr.message);
    return { id: contract.id };
  });

export const listMyInstallments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("installment_contracts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const getInstallmentById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [c, s, p] = await Promise.all([
      supabase.from("installment_contracts").select("*").eq("id", data.id).single(),
      supabase.from("payment_schedules").select("*").eq("contract_id", data.id).order("seq"),
      supabase.from("payments").select("*").eq("contract_id", data.id).order("paid_at", { ascending: false }),
    ]);
    if (c.error) throw new Error(c.error.message);
    return { contract: c.data, schedule: s.data ?? [], payments: p.data ?? [] };
  });
