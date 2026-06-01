import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { calcInstallment, buildSchedule, DEFAULT_MARKUP_RATE } from "@/lib/installment";
import { notifyInvestorOfFundedContract } from "@/lib/email/server-send.server";

const CreateSchema = z.object({
  productName: z.string().min(1).max(200),
  productImageUrl: z.string().url().max(500).optional().nullable(),
  productPrice: z.number().positive().max(1_000_000_000),
  downPayment: z.number().min(0).max(1_000_000_000),
  termMonths: z.number().int().min(1).max(24),
  productDescription: z.string().max(2000).optional().nullable(),
  clientFullName: z.string().min(1).max(200).optional().nullable(),
  clientTelegram: z.string().max(100).optional().nullable(),
  clientComment: z.string().max(2000).optional().nullable(),
  firstPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    // Дата первого платежа: если указана — используем её, иначе сегодня+1 месяц
    const startDate = data.firstPaymentDate
      ? new Date(data.firstPaymentDate + "T00:00:00")
      : (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + 1);
          return d;
        })();

    // Обновим профиль если ФИО/телефон переданы (мягко)
    if (data.clientFullName) {
      await supabase
        .from("profiles")
        .update({ full_name: data.clientFullName })
        .eq("id", userId);
    }

    // Контракт и график создаём через сервисный клиент: финансовые поля
    // не должны быть редактируемы со стороны клиента (RLS INSERT-политика
    // снята). client_id жёстко привязан к авторизованному пользователю.
    const { data: contract, error } = await supabaseAdmin
      .from("installment_contracts")
      .insert({
        client_id: userId,
        product_name: data.productName,
        product_description: data.productDescription ?? null,
        client_full_name: data.clientFullName ?? null,
        client_telegram: data.clientTelegram ?? null,
        client_comment: data.clientComment ?? null,
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

    // График строим начиная с указанной даты первого платежа (платежи N, N+1мес, ...)
    const scheduleStart = new Date(startDate);
    scheduleStart.setMonth(scheduleStart.getMonth() - 1);
    const schedule = buildSchedule(scheduleStart, calc.termMonths, calc.monthlyPayment).map((s) => ({
      contract_id: contract.id,
      seq: s.seq,
      due_date: s.dueDate.toISOString().slice(0, 10),
      amount: s.amount,
      status: "pending" as const,
    }));
    const { error: schedErr } = await supabaseAdmin.from("payment_schedules").insert(schedule);
    if (schedErr) throw new Error(schedErr.message);
    // Уведомление инвестору (если контракт назначен) — best-effort.
    if ((contract as { investor_id?: string | null }).investor_id) {
      await notifyInvestorOfFundedContract(contract.id);
    }
    return { id: contract.id };
  });

export const listMyInstallments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("installment_contracts")
      .select("*")
      .eq("client_id", userId)
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
    const scheduleIds = (s.data ?? []).map((r) => r.id);
    type HistoryRow = {
      id: string;
      schedule_id: string;
      old_due_date: string;
      new_due_date: string;
      reason: string | null;
      comment: string | null;
      changed_by: string;
      changed_at: string;
    };
    type CarryoverRow = {
      id: string;
      from_schedule_id: string;
      to_schedule_id: string | null;
      amount: number;
      mode: string;
      note: string | null;
      created_by: string;
      created_at: string;
    };
    let history: HistoryRow[] = [];
    let carryovers: CarryoverRow[] = [];
    if (scheduleIds.length > 0) {
      const [h, co] = await Promise.all([
        supabase
          .from("payment_schedule_history")
          .select("*")
          .in("schedule_id", scheduleIds)
          .order("changed_at", { ascending: false }),
        supabase
          .from("payment_carryovers")
          .select("*")
          .in("from_schedule_id", scheduleIds)
          .order("created_at", { ascending: false }),
      ]);
      history = (h.data ?? []) as HistoryRow[];
      carryovers = (co.data ?? []) as CarryoverRow[];
    }
    return { contract: c.data, schedule: s.data ?? [], payments: p.data ?? [], history, carryovers };
  });

export const getMyDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [contractsRes, applicationsRes] = await Promise.all([
      supabase
        .from("installment_contracts")
        .select("id, product_name, product_image_url, status, term_months, monthly_payment, start_date, created_at")
        .eq("client_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("installment_applications")
        .select("id", { count: "exact", head: true })
        .eq("client_id", userId)
        .eq("status", "pending"),
    ]);

    if (contractsRes.error) throw new Error(contractsRes.error.message);
    if (applicationsRes.error) throw new Error(applicationsRes.error.message);

    const contracts = contractsRes.data ?? [];
    const activeContracts = contracts.filter((c) => c.status === "active");
    const activeIds = activeContracts.map((c) => c.id);

    type ScheduleRow = {
      id: string;
      contract_id: string;
      seq: number;
      due_date: string;
      amount: number;
      status: string;
    };
    let schedules: ScheduleRow[] = [];
    if (activeIds.length > 0) {
      const { data: sched, error: schedErr } = await supabase
        .from("payment_schedules")
        .select("id, contract_id, seq, due_date, amount, status")
        .in("contract_id", activeIds)
        .order("due_date", { ascending: true });
      if (schedErr) throw new Error(schedErr.message);
      schedules = (sched ?? []) as ScheduleRow[];
    }

    const today = new Date().toISOString().slice(0, 10);
    const pendingOrOverdue = schedules.filter(
      (s) => s.status === "pending" || s.status === "overdue",
    );
    const totalRemaining = pendingOrOverdue.reduce((sum, s) => sum + Number(s.amount), 0);

    const contractNameById = new Map(activeContracts.map((c) => [c.id, c.product_name]));
    const upcomingPayments = pendingOrOverdue.slice(0, 5).map((s) => ({
      id: s.id,
      contractId: s.contract_id,
      productName: contractNameById.get(s.contract_id) ?? "—",
      seq: s.seq,
      dueDate: s.due_date,
      amount: Number(s.amount),
      status: s.status,
      overdue: s.status === "overdue" || s.due_date < today,
    }));

    const nextPayment = upcomingPayments[0] ?? null;

    // Прогресс по активным контрактам (оплачено N из M)
    const contractProgress = activeContracts.map((c) => {
      const own = schedules.filter((s) => s.contract_id === c.id);
      const paid = own.filter((s) => s.status === "paid").length;
      return {
        id: c.id,
        productName: c.product_name,
        productImageUrl: c.product_image_url,
        monthlyPayment: Number(c.monthly_payment),
        termMonths: c.term_months,
        paid,
        total: own.length || c.term_months,
      };
    });

    return {
      nextPayment,
      totalRemaining,
      activeCount: activeContracts.length,
      pendingApplicationsCount: applicationsRes.count ?? 0,
      upcomingPayments,
      activeContracts: contractProgress,
    };
  });
