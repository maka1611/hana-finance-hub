import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyInvestorOfFundedContract } from "@/lib/email/server-send.server";

async function assertStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ok = (data ?? []).some(
    (r) => r.role === "manager" || r.role === "admin" || r.role === "owner",
  );
  if (!ok) throw new Error("Forbidden: staff role required");
}

function computeDueDate(startISO: string, termMonths: number | null): string | null {
  if (!termMonths) return null;
  const [y, m, d] = startISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + termMonths);
  return dt.toISOString().slice(0, 10);
}

type ContractRow = {
  id: string;
  investor_id: string | null;
  principal: number | string;
  markup_amount: number | string;
  total_sale_price: number | string;
  status: string;
  product_name: string;
  client_id: string;
  created_at: string;
};

type ScheduleRow = {
  id: string;
  contract_id: string;
  status: string;
  amount: number | string;
  due_date: string;
  seq: number;
};

type PaymentRow = {
  id: string;
  contract_id: string;
  amount: number | string;
  paid_at: string;
};

function summarizeInvestor(
  invested: number,
  shareRate: number,
  contracts: ContractRow[],
  schedules: ScheduleRow[],
  payments: PaymentRow[],
  capitalizeProfit: boolean = false,
) {
  const today = new Date().toISOString().slice(0, 10);
  const activeContracts = contracts.filter((c) => c.status !== "closed");
  const placed = activeContracts.reduce((s, c) => s + Number(c.principal), 0);
  const totalMarkup = contracts.reduce((s, c) => s + Number(c.markup_amount), 0);
  const expectedProfit = totalMarkup * shareRate;
  const contractIds = new Set(contracts.map((c) => c.id));
  const ownPayments = payments.filter((p) => contractIds.has(p.contract_id));
  // Принципиально: считаем, что каждый платёж пропорционально распределяется
  // на тело и наценку контракта. Доля инвестора = (markup/total) * shareRate.
  let receivedProfit = 0;
  let returnedPrincipal = 0;
  const byContract = new Map<string, ContractRow>(contracts.map((c) => [c.id, c]));
  for (const p of ownPayments) {
    const c = byContract.get(p.contract_id);
    if (!c) continue;
    const total = Number(c.principal) + Number(c.markup_amount);
    if (total <= 0) continue;
    const markupShare = Number(c.markup_amount) / total;
    const amt = Number(p.amount);
    receivedProfit += amt * markupShare * shareRate;
    returnedPrincipal += amt * (1 - markupShare);
  }
  const ownSched = schedules.filter((s) => contractIds.has(s.contract_id));
  const overdueSchedules = ownSched.filter(
    (s) => s.status === "overdue" || (s.status === "pending" && s.due_date < today),
  );
  const overdueAmount = overdueSchedules.reduce((s, x) => s + Number(x.amount), 0);
  const free =
    invested - placed + returnedPrincipal + (capitalizeProfit ? receivedProfit : 0);
  return {
    invested,
    placed,
    free,
    totalMarkup,
    expectedProfit,
    receivedProfit,
    capitalizeProfit,
    contractsCount: contracts.length,
    activeCount: activeContracts.length,
    overdueCount: overdueSchedules.length,
    overdueAmount,
  };
}

export const listInvestors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const [{ data: investors, error: iErr }, { data: contracts }, { data: schedules }, { data: payments }] =
      await Promise.all([
        supabaseAdmin.from("investors").select("*").order("created_at", { ascending: false }),
        supabaseAdmin
          .from("installment_contracts")
          .select("id,investor_id,principal,markup_amount,total_sale_price,status,product_name,client_id,created_at"),
        supabaseAdmin.from("payment_schedules").select("id,contract_id,status,amount,due_date,seq"),
        supabaseAdmin.from("payments").select("id,contract_id,amount,paid_at"),
      ]);
    if (iErr) throw new Error(iErr.message);
    const cs = (contracts ?? []) as ContractRow[];
    const ss = (schedules ?? []) as ScheduleRow[];
    const ps = (payments ?? []) as PaymentRow[];
    return (investors ?? []).map((inv) => {
      const own = cs.filter((c) => c.investor_id === inv.id);
      const summary = summarizeInvestor(
        Number(inv.total_capital),
        Number(inv.profit_share_rate),
        own,
        ss,
        ps,
        Boolean((inv as { capitalize_profit?: boolean }).capitalize_profit),
      );
      return { ...inv, ...summary };
    });
  });

export const getInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const [{ data: inv, error }, { data: contracts }, { data: contributions }] = await Promise.all([
      supabaseAdmin.from("investors").select("*").eq("id", data.id).single(),
      supabaseAdmin
        .from("installment_contracts")
        .select("id,investor_id,principal,markup_amount,total_sale_price,status,product_name,client_id,created_at,term_months,start_date")
        .eq("investor_id", data.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("investor_contributions")
        .select("*")
        .eq("investor_id", data.id)
        .order("created_at", { ascending: false }),
    ]);
    if (error) throw new Error(error.message);
    const cs = (contracts ?? []) as ContractRow[];
    const ids = cs.map((c) => c.id);
    const clientIds = [...new Set(cs.map((c) => c.client_id))];
    const [{ data: schedules }, { data: payments }, { data: profiles }] = await Promise.all([
      ids.length > 0
        ? supabaseAdmin
            .from("payment_schedules")
            .select("id,contract_id,status,amount,due_date,seq")
            .in("contract_id", ids)
        : Promise.resolve({ data: [] as ScheduleRow[] }),
      ids.length > 0
        ? supabaseAdmin
            .from("payments")
            .select("id,contract_id,amount,paid_at,method")
            .in("contract_id", ids)
            .order("paid_at", { ascending: false })
        : Promise.resolve({ data: [] as PaymentRow[] }),
      clientIds.length > 0
        ? supabaseAdmin.from("profiles").select("id,full_name,email,phone").in("id", clientIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }> }),
    ]);
    const summary = summarizeInvestor(
      Number(inv.total_capital),
      Number(inv.profit_share_rate),
      cs,
      (schedules ?? []) as ScheduleRow[],
      (payments ?? []) as PaymentRow[],
      Boolean((inv as { capitalize_profit?: boolean }).capitalize_profit),
    );
    const today = new Date().toISOString().slice(0, 10);
    const overdueSchedules = ((schedules ?? []) as ScheduleRow[]).filter(
      (s) => s.status === "overdue" || (s.status === "pending" && s.due_date < today),
    );
    const profilesMap = new Map(
      (profiles ?? []).map((p) => [p.id, p]),
    );
    return {
      investor: inv,
      summary,
      contracts: cs.map((c) => ({ ...c, profile: profilesMap.get(c.client_id) ?? null })),
      schedules: schedules ?? [],
      payments: payments ?? [],
      contributions: contributions ?? [],
      overdueSchedules: overdueSchedules.map((s) => {
        const c = cs.find((x) => x.id === s.contract_id);
        return {
          ...s,
          contract: c ? { id: c.id, product_name: c.product_name, client_id: c.client_id } : null,
          profile: c ? profilesMap.get(c.client_id) ?? null : null,
        };
      }),
    };
  });

export const getInvestorsAggregate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const [{ data: investors }, { data: contracts }, { data: schedules }, { data: payments }] =
      await Promise.all([
        supabaseAdmin.from("investors").select("*").in("id", data.ids),
        supabaseAdmin
          .from("installment_contracts")
          .select("id,investor_id,principal,markup_amount,total_sale_price,status,product_name,client_id,created_at")
          .in("investor_id", data.ids),
        supabaseAdmin
          .from("payment_schedules")
          .select("id,contract_id,status,amount,due_date,seq"),
        supabaseAdmin.from("payments").select("id,contract_id,amount,paid_at"),
      ]);
    const cs = (contracts ?? []) as ContractRow[];
    const ss = (schedules ?? []) as ScheduleRow[];
    const ps = (payments ?? []) as PaymentRow[];
    const totals = {
      invested: 0,
      placed: 0,
      free: 0,
      totalMarkup: 0,
      expectedProfit: 0,
      receivedProfit: 0,
      contractsCount: 0,
      activeCount: 0,
      overdueCount: 0,
      overdueAmount: 0,
    };
    const perInvestor = (investors ?? []).map((inv) => {
      const own = cs.filter((c) => c.investor_id === inv.id);
      const s = summarizeInvestor(
        Number(inv.total_capital),
        Number(inv.profit_share_rate),
        own,
        ss,
        ps,
        Boolean((inv as { capitalize_profit?: boolean }).capitalize_profit),
      );
      totals.invested += s.invested;
      totals.placed += s.placed;
      totals.free += s.free;
      totals.totalMarkup += s.totalMarkup;
      totals.expectedProfit += s.expectedProfit;
      totals.receivedProfit += s.receivedProfit;
      totals.contractsCount += s.contractsCount;
      totals.activeCount += s.activeCount;
      totals.overdueCount += s.overdueCount;
      totals.overdueAmount += s.overdueAmount;
      return { id: inv.id, full_name: inv.full_name, ...s };
    });
    return { totals, perInvestor };
  });

const InvestorInput = z.object({
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().max(200).optional().nullable(),
  comment: z.string().trim().max(2000).optional().nullable(),
  total_capital: z.number().min(0).max(1_000_000_000_000),
  profit_share_rate: z.number().min(0).max(1),
  is_active: z.boolean().optional(),
  contract_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  contract_term_months: z.number().int().min(1).max(600).optional().nullable(),
  capitalize_profit: z.boolean().optional(),
});

export const createInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InvestorInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: inv, error } = await supabaseAdmin
      .from("investors")
      .insert({
        full_name: data.full_name,
        phone: data.phone || null,
        email: data.email || null,
        comment: data.comment || null,
        total_capital: data.total_capital,
        profit_share_rate: data.profit_share_rate,
        is_active: data.is_active ?? true,
        contract_start_date: data.contract_start_date || null,
        contract_term_months: data.contract_term_months ?? null,
        capitalize_profit: data.capitalize_profit ?? false,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (data.total_capital > 0) {
      await supabaseAdmin.from("investor_contributions").insert({
        investor_id: (inv as { id: string }).id,
        amount: data.total_capital,
        note: "Начальный капитал",
        operation_date: data.contract_start_date || new Date().toISOString().slice(0, 10),
        term_months: data.contract_term_months ?? null,
        due_date: computeDueDate(
          data.contract_start_date || new Date().toISOString().slice(0, 10),
          data.contract_term_months ?? null,
        ),
      } as never);
    }
    return inv;
  });

export const updateInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), patch: InvestorInput.partial() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("investors")
      .update(data.patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addInvestorContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        investor_id: z.string().uuid(),
        amount: z.number().refine((n) => n !== 0, "Сумма не может быть 0"),
        note: z.string().trim().max(500).optional().nullable(),
        operation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        term_months: z.number().int().min(1).max(600).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const opDate = data.operation_date || new Date().toISOString().slice(0, 10);
    const dueDate = computeDueDate(opDate, data.term_months ?? null);
    const { error: cErr } = await supabaseAdmin.from("investor_contributions").insert({
      investor_id: data.investor_id,
      amount: data.amount,
      note: data.note || null,
      operation_date: opDate,
      term_months: data.term_months ?? null,
      due_date: dueDate,
    } as never);
    if (cErr) throw new Error(cErr.message);
    // Обновляем total_capital
    const { data: inv } = await supabaseAdmin
      .from("investors")
      .select("total_capital")
      .eq("id", data.investor_id)
      .single();
    const next = Number(inv?.total_capital ?? 0) + data.amount;
    await supabaseAdmin
      .from("investors")
      .update({ total_capital: next } as never)
      .eq("id", data.investor_id);
    return { ok: true, total_capital: next };
  });

export const setContractInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ contract_id: z.string().uuid(), investor_id: z.string().uuid().nullable() })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("installment_contracts")
      .update({ investor_id: data.investor_id } as never)
      .eq("id", data.contract_id);
    if (error) throw new Error(error.message);
    if (data.investor_id) {
      await notifyInvestorOfFundedContract(data.contract_id);
    }
    return { ok: true };
  });

export const listInvestorsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data: investors } = await supabaseAdmin
      .from("investors")
      .select("id,full_name,total_capital,profit_share_rate,is_active")
      .eq("is_active", true)
      .order("full_name");
    const { data: contracts } = await supabaseAdmin
      .from("installment_contracts")
      .select("investor_id,principal,status");
    const placedMap = new Map<string, number>();
    for (const c of (contracts ?? []) as Array<{ investor_id: string | null; principal: number | string; status: string }>) {
      if (!c.investor_id || c.status === "closed") continue;
      placedMap.set(c.investor_id, (placedMap.get(c.investor_id) ?? 0) + Number(c.principal));
    }
    return (investors ?? []).map((inv) => ({
      ...inv,
      placed: placedMap.get(inv.id) ?? 0,
      free: Number(inv.total_capital) - (placedMap.get(inv.id) ?? 0),
    }));
  });

export const listClientsForInvestor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const [{ data: profiles }, { data: investors }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,full_name,email,phone")
        .order("full_name", { ascending: true }),
      supabaseAdmin.from("investors").select("email"),
    ]);
    const taken = new Set(
      ((investors ?? []) as Array<{ email: string | null }>)
        .map((i) => (i.email ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    return ((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }>)
      .map((p) => ({
        id: p.id,
        full_name: p.full_name ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        already_investor: !!p.email && taken.has(p.email.trim().toLowerCase()),
      }));
  });