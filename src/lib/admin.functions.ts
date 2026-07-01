import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_MARKUP_RATE, calcInstallment, buildSchedule, MAX_TERM } from "@/lib/installment";
import { notifyInvestorOfFundedContract } from "@/lib/email/server-send.server";

async function assertStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role);
  const ok = roles.some((r) => r === "manager" || r === "admin" || r === "owner");
  if (!ok) throw new Error("Forbidden: staff role required");
  return roles;
}

const MAX_DOCS_PER_KIND = 5;
const DOC_SIGNED_TTL = 60 * 60 * 24 * 365 * 5;

async function getActorInfo(
  userId: string,
): Promise<{ email: string | null; name: string | null }> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("email,full_name")
    .eq("id", userId)
    .maybeSingle();
  return { email: data?.email ?? null, name: data?.full_name ?? null };
}

async function logAction(params: {
  actorId: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    const info = await getActorInfo(params.actorId);
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: params.actorId,
      actor_email: info.email,
      actor_name: info.name,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      summary: params.summary ?? null,
      details: (params.details ?? null) as never,
    });
  } catch (e) {
    console.error("audit log insert failed:", e);
  }
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    return (data ?? []).map((r) => r.role as string);
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const [contracts, schedules, payments, clients] = await Promise.all([
      supabaseAdmin
        .from("installment_contracts")
        .select("id,status,total_sale_price,principal,markup_amount,investor_id"),
      supabaseAdmin.from("payment_schedules").select("status,amount,due_date"),
      supabaseAdmin.from("payments").select("amount,paid_at,contract_id"),
      supabaseAdmin.from("profiles").select("id"),
    ]);
    const { data: investorsRaw } = await supabaseAdmin
      .from("investors")
      .select("id,full_name,total_capital,profit_share_rate,is_active");
    const investors = (investorsRaw ?? []) as Array<{
      id: string;
      full_name: string;
      total_capital: number | string;
      profit_share_rate: number | string;
      is_active: boolean;
    }>;
    const invById = new Map(investors.map((i) => [i.id, i]));
    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekStr = weekEnd.toISOString().slice(0, 10);
    const cs = (contracts.data ?? []) as Array<{
      id: string;
      status: string;
      total_sale_price: number | string;
      principal: number | string;
      markup_amount: number | string;
      investor_id: string | null;
    }>;
    const ss = schedules.data ?? [];
    const ps = (payments.data ?? []) as Array<{
      amount: number | string;
      paid_at: string;
      contract_id: string;
    }>;

    // payments grouped by contract
    const paidByContract = new Map<string, number>();
    for (const p of ps) {
      paidByContract.set(
        p.contract_id,
        (paidByContract.get(p.contract_id) ?? 0) + Number(p.amount),
      );
    }

    // capital & profit split
    let capitalOwn = 0;
    let capitalInvestor = 0;
    let profitOwnExp = 0;
    let profitCompanyFromInvExp = 0;
    let profitInvestorsExp = 0;
    let profitOwnGot = 0;
    let profitCompanyFromInvGot = 0;
    let profitInvestorsGot = 0;

    const perInvestor = new Map<
      string,
      { expected: number; received: number; companyProfit: number }
    >();

    for (const c of cs) {
      const principal = Number(c.principal);
      const markup = Number(c.markup_amount);
      const total = principal + markup;
      const markupShare = total > 0 ? markup / total : 0;
      const paid = paidByContract.get(c.id) ?? 0;
      const receivedMarkup = paid * markupShare;
      if (c.investor_id && invById.has(c.investor_id)) {
        const rate = Number(invById.get(c.investor_id)!.profit_share_rate);
        capitalInvestor += principal;
        const invExp = markup * rate;
        const compExp = markup * (1 - rate);
        const invGot = receivedMarkup * rate;
        const compGot = receivedMarkup * (1 - rate);
        profitInvestorsExp += invExp;
        profitCompanyFromInvExp += compExp;
        profitInvestorsGot += invGot;
        profitCompanyFromInvGot += compGot;
        const cur = perInvestor.get(c.investor_id) ?? {
          expected: 0,
          received: 0,
          companyProfit: 0,
        };
        cur.expected += invExp;
        cur.received += invGot;
        cur.companyProfit += compExp;
        perInvestor.set(c.investor_id, cur);
      } else {
        capitalOwn += principal;
        profitOwnExp += markup;
        profitOwnGot += receivedMarkup;
      }
    }

    const totalCapital = capitalOwn + capitalInvestor;
    const topInvestors = investors
      .map((inv) => {
        const stat = perInvestor.get(inv.id) ?? {
          expected: 0,
          received: 0,
          companyProfit: 0,
        };
        return {
          id: inv.id,
          name: inv.full_name,
          isActive: inv.is_active,
          capital: Number(inv.total_capital),
          shareRate: Number(inv.profit_share_rate),
          expectedProfit: stat.expected,
          receivedProfit: stat.received,
          companyProfit: stat.companyProfit,
        };
      })
      .sort((a, b) => b.expectedProfit - a.expectedProfit)
      .slice(0, 10);

    return {
      contractsTotal: cs.length,
      contractsActive: cs.filter((c) => c.status === "active").length,
      contractsOverdue: cs.filter((c) => c.status === "overdue").length,
      contractsClosed: cs.filter((c) => c.status === "closed").length,
      portfolio: cs.reduce((s, c) => s + Number(c.principal) + Number(c.markup_amount), 0),
      totalSold: cs.reduce((s, c) => s + Number(c.total_sale_price), 0),
      totalMarkup: cs.reduce((s, c) => s + Number(c.markup_amount), 0),
      paymentsCollected: ps.reduce((s, p) => s + Number(p.amount), 0),
      clientsCount: (clients.data ?? []).length,
      duesToday: ss
        .filter((s) => s.status === "pending" && s.due_date === today)
        .reduce((s, x) => s + Number(x.amount), 0),
      duesWeek: ss
        .filter((s) => s.status === "pending" && s.due_date >= today && s.due_date <= weekStr)
        .reduce((s, x) => s + Number(x.amount), 0),
      overdueAmount: ss
        .filter((s) => s.status === "overdue" || (s.status === "pending" && s.due_date < today))
        .reduce((s, x) => s + Number(x.amount), 0),
      capital: {
        own: capitalOwn,
        investor: capitalInvestor,
        total: totalCapital,
        investorShare: totalCapital > 0 ? (capitalInvestor / totalCapital) * 100 : 0,
      },
      profitExpected: {
        own: profitOwnExp,
        companyFromInvestor: profitCompanyFromInvExp,
        investors: profitInvestorsExp,
        companyTotal: profitOwnExp + profitCompanyFromInvExp,
      },
      profitCollected: {
        own: profitOwnGot,
        companyFromInvestor: profitCompanyFromInvGot,
        investors: profitInvestorsGot,
        companyTotal: profitOwnGot + profitCompanyFromInvGot,
      },
      investorsActive: investors.filter((i) => i.is_active).length,
      investorsTotal: investors.length,
      topInvestors,
    };
  });

const analyticsSeriesInput = z.object({
  period: z.enum(["all", "year", "quarter", "month", "week", "today", "custom"]).default("month"),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

type AnalyticsRow = {
  key: string;
  label: string;
  sales: number;
  payments: number;
  markup: number;
  due: number;
  contracts: number;
  capitalOwn: number;
  capitalInvestor: number;
  profitOwnExp: number;
  profitCompanyFromInvExp: number;
  profitInvestorsExp: number;
  profitOwnGot: number;
  profitCompanyFromInvGot: number;
  profitInvestorsGot: number;
};

async function fetchAllRows<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery(from, from + 999);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

const dayMs = 24 * 60 * 60 * 1000;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * dayMs);

function resolveAnalyticsPeriod(
  period: z.infer<typeof analyticsSeriesInput>["period"],
  from?: string | null,
  to?: string | null,
) {
  const now = new Date();
  const today = startOfDay(now);
  let start: Date | null = null;
  let end = today;

  if (period === "year")
    start = startOfDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  if (period === "quarter")
    start = startOfDay(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()));
  if (period === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "week") start = addDays(today, -6);
  if (period === "today") start = today;
  if (period === "custom") {
    start = from ? startOfDay(new Date(`${from}T00:00:00`)) : null;
    end = to ? startOfDay(new Date(`${to}T00:00:00`)) : today;
  }

  if (start && start > end) [start, end] = [end, start];
  return { start, end };
}

export const adminAnalyticsSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyticsSeriesInput.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const today = startOfDay(new Date());
    const { start, end } = resolveAnalyticsPeriod(data.period, data.from, data.to);
    const startIso = start?.toISOString();
    const endExclusiveIso = addDays(end, 1).toISOString();
    const startDate = start ? dateKey(start) : null;
    const endDate = dateKey(end);

    const [contracts, payments, schedules] = await Promise.all([
      fetchAllRows<{
        id: string;
        created_at: string;
        total_sale_price: number | string;
        markup_amount: number | string;
        principal: number | string;
        investor_id: string | null;
      }>((from, to) => {
        const q = supabaseAdmin
          .from("installment_contracts")
          .select("id,created_at,total_sale_price,markup_amount,principal,investor_id")
          .order("created_at", { ascending: true });
        return (startIso ? q.gte("created_at", startIso) : q)
          .lt("created_at", endExclusiveIso)
          .range(from, to);
      }),
      fetchAllRows<{ paid_at: string; amount: number | string; contract_id: string }>((from, to) => {
        const q = supabaseAdmin
          .from("payments")
          .select("paid_at,amount,contract_id")
          .order("paid_at", { ascending: true });
        return (startIso ? q.gte("paid_at", startIso) : q)
          .lt("paid_at", endExclusiveIso)
          .range(from, to);
      }),
      fetchAllRows<{ due_date: string; amount: number | string }>((from, to) => {
        const q = supabaseAdmin
          .from("payment_schedules")
          .select("due_date,amount")
          .order("due_date", { ascending: true });
        return (startDate ? q.gte("due_date", startDate) : q)
          .lte("due_date", endDate)
          .range(from, to);
      }),
    ]);

    // Load metadata for ALL contracts referenced by payments (payments in range
    // can belong to contracts created outside the range) + investors.
    const paymentContractIds = [...new Set(payments.map((p) => p.contract_id))];
    const inRangeIds = new Set(contracts.map((c) => c.id));
    const missingIds = paymentContractIds.filter((id) => !inRangeIds.has(id));
    type ContractMeta = {
      id: string;
      markup_amount: number | string;
      principal: number | string;
      investor_id: string | null;
    };
    const extraContracts: ContractMeta[] = [];
    if (missingIds.length) {
      const { data: extra } = await supabaseAdmin
        .from("installment_contracts")
        .select("id,markup_amount,principal,investor_id")
        .in("id", missingIds);
      if (extra) extraContracts.push(...(extra as ContractMeta[]));
    }
    const contractMeta = new Map<
      string,
      { markupShare: number; investorId: string | null }
    >();
    for (const c of contracts) {
      const total = Number(c.principal) + Number(c.markup_amount);
      contractMeta.set(c.id, {
        markupShare: total > 0 ? Number(c.markup_amount) / total : 0,
        investorId: c.investor_id,
      });
    }
    for (const c of extraContracts) {
      const total = Number(c.principal) + Number(c.markup_amount);
      contractMeta.set(c.id, {
        markupShare: total > 0 ? Number(c.markup_amount) / total : 0,
        investorId: c.investor_id,
      });
    }
    const { data: invRaw } = await supabaseAdmin
      .from("investors")
      .select("id,profit_share_rate");
    const investorRate = new Map(
      ((invRaw ?? []) as Array<{ id: string; profit_share_rate: number | string }>).map(
        (i) => [i.id, Number(i.profit_share_rate)],
      ),
    );

    const allDates = [
      ...contracts.map((row) => new Date(row.created_at)),
      ...payments.map((row) => new Date(row.paid_at)),
      ...schedules.map((row) => new Date(`${row.due_date}T00:00:00`)),
    ].filter((date) => !Number.isNaN(date.getTime()));
    const rangeStart =
      start ??
      (allDates.length
        ? startOfDay(new Date(Math.min(...allDates.map((date) => date.getTime()))))
        : today);
    const rangeEnd = end;
    const days = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / dayMs) + 1);
    const granularity: "day" | "month" = data.period === "all" || days > 120 ? "month" : "day";
    const rows = new Map<string, AnalyticsRow>();

    if (granularity === "month") {
      for (
        let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
        cursor <= rangeEnd;
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      ) {
        const key = monthKey(cursor);
        rows.set(key, emptyRow(key, cursor.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" })));
      }
    } else {
      for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addDays(cursor, 1)) {
        const key = dateKey(cursor);
        rows.set(key, emptyRow(key, cursor.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })));
      }
    }

    const keyFor = (value: string, dateOnly = false) => {
      const date = dateOnly ? new Date(`${value}T00:00:00`) : new Date(value);
      return granularity === "month" ? monthKey(date) : dateKey(date);
    };

    for (const contract of contracts) {
      const row = rows.get(keyFor(contract.created_at));
      if (!row) continue;
      const principal = Number(contract.principal);
      const markup = Number(contract.markup_amount);
      row.sales += Number(contract.total_sale_price);
      row.markup += markup;
      row.contracts += 1;
      if (contract.investor_id && investorRate.has(contract.investor_id)) {
        const rate = investorRate.get(contract.investor_id)!;
        row.capitalInvestor += principal;
        row.profitInvestorsExp += markup * rate;
        row.profitCompanyFromInvExp += markup * (1 - rate);
      } else {
        row.capitalOwn += principal;
        row.profitOwnExp += markup;
      }
    }
    for (const payment of payments) {
      const row = rows.get(keyFor(payment.paid_at));
      if (!row) continue;
      const amount = Number(payment.amount);
      row.payments += amount;
      const meta = contractMeta.get(payment.contract_id);
      if (!meta) continue;
      const receivedMarkup = amount * meta.markupShare;
      if (meta.investorId && investorRate.has(meta.investorId)) {
        const rate = investorRate.get(meta.investorId)!;
        row.profitInvestorsGot += receivedMarkup * rate;
        row.profitCompanyFromInvGot += receivedMarkup * (1 - rate);
      } else {
        row.profitOwnGot += receivedMarkup;
      }
    }
    for (const schedule of schedules) {
      const row = rows.get(keyFor(schedule.due_date, true));
      if (row) row.due += Number(schedule.amount);
    }

    const chart = [...rows.values()];
    const initTotals = {
      sales: 0,
      payments: 0,
      markup: 0,
      due: 0,
      contracts: 0,
      capitalOwn: 0,
      capitalInvestor: 0,
      profitOwnExp: 0,
      profitCompanyFromInvExp: 0,
      profitInvestorsExp: 0,
      profitOwnGot: 0,
      profitCompanyFromInvGot: 0,
      profitInvestorsGot: 0,
    };
    return {
      granularity,
      from: dateKey(rangeStart),
      to: dateKey(rangeEnd),
      chart,
      totals: chart.reduce((t, r) => {
        t.sales += r.sales;
        t.payments += r.payments;
        t.markup += r.markup;
        t.due += r.due;
        t.contracts += r.contracts;
        t.capitalOwn += r.capitalOwn;
        t.capitalInvestor += r.capitalInvestor;
        t.profitOwnExp += r.profitOwnExp;
        t.profitCompanyFromInvExp += r.profitCompanyFromInvExp;
        t.profitInvestorsExp += r.profitInvestorsExp;
        t.profitOwnGot += r.profitOwnGot;
        t.profitCompanyFromInvGot += r.profitCompanyFromInvGot;
        t.profitInvestorsGot += r.profitInvestorsGot;
        return t;
      }, initTotals),
    };
  });

function emptyRow(key: string, label: string): AnalyticsRow {
  return {
    key,
    label,
    sales: 0,
    payments: 0,
    markup: 0,
    due: 0,
    contracts: 0,
    capitalOwn: 0,
    capitalInvestor: 0,
    profitOwnExp: 0,
    profitCompanyFromInvExp: 0,
    profitInvestorsExp: 0,
    profitOwnGot: 0,
    profitCompanyFromInvGot: 0,
    profitInvestorsGot: 0,
  };
}

export const adminListClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ includeDeleted: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    let pq = supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false });
    if (!data.includeDeleted) pq = pq.is("deleted_at", null);
    const { data: profiles } = await pq;
    const { data: contracts } = await supabaseAdmin
      .from("installment_contracts")
      .select("client_id,status,principal,markup_amount")
      .is("deleted_at", null);
    const byClient: Record<string, { count: number; debt: number; active: number }> = {};
    for (const c of contracts ?? []) {
      const k = c.client_id;
      byClient[k] ??= { count: 0, debt: 0, active: 0 };
      byClient[k].count++;
      if (c.status === "active") byClient[k].active++;
      byClient[k].debt += Number(c.principal) + Number(c.markup_amount);
    }
    // Платежи и графики для расчёта рейтинга и оплаченной суммы
    const [{ data: payments }, { data: schedules }] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("amount,installment_contracts!inner(client_id)") as unknown as Promise<{
        data: Array<{ amount: number; installment_contracts: { client_id: string } | null }> | null;
      }>,
      supabaseAdmin
        .from("payment_schedules")
        .select(
          "status,amount,due_date,installment_contracts!inner(client_id)",
        ) as unknown as Promise<{
        data: Array<{
          status: string;
          amount: number;
          due_date: string;
          installment_contracts: { client_id: string } | null;
        }> | null;
      }>,
    ]);
    const paidByClient: Record<string, number> = {};
    for (const p of payments ?? []) {
      const cid = p.installment_contracts?.client_id;
      if (!cid) continue;
      paidByClient[cid] = (paidByClient[cid] ?? 0) + Number(p.amount);
    }
    const today = new Date().toISOString().slice(0, 10);
    const ratingByClient: Record<string, { paid: number; overdue: number }> = {};
    for (const s of schedules ?? []) {
      const cid = s.installment_contracts?.client_id;
      if (!cid) continue;
      ratingByClient[cid] ??= { paid: 0, overdue: 0 };
      if (s.status === "paid") ratingByClient[cid].paid++;
      else if (s.status === "overdue" || (s.status === "pending" && s.due_date < today)) {
        ratingByClient[cid].overdue++;
      }
    }
    const deleterMap = await fetchActorMap((profiles ?? []).map((p) => p.deleted_by));
    return (profiles ?? []).map((p) => {
      const r = ratingByClient[p.id];
      const base = (r?.paid ?? 0) + (r?.overdue ?? 0);
      const ratingScore = !r || base === 0 ? null : Math.round((r.paid / base) * 100);
      const stars = ratingScore === null ? 0 : Math.max(1, Math.round(ratingScore / 20));
      const deleter = p.deleted_by ? deleterMap.get(p.deleted_by) ?? null : null;
      return {
        ...p,
        contracts_count: byClient[p.id]?.count ?? 0,
        active_count: byClient[p.id]?.active ?? 0,
        total_debt: byClient[p.id]?.debt ?? 0,
        paid_amount: paidByClient[p.id] ?? 0,
        overdue_count: r?.overdue ?? 0,
        rating_score: ratingScore,
        rating_stars: stars,
        deleted_by_name: deleter?.full_name ?? deleter?.email ?? null,
      };
    });
  });

export const adminListContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["all", "active", "overdue", "closed", "pending"]).default("all"),
        includeDeleted: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    let q = supabaseAdmin
      .from("installment_contracts")
      .select("*, profiles!installment_contracts_client_id_fkey(full_name,email)")
      .order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    if (!data.includeDeleted) q = q.is("deleted_at", null);
    const { data: rows, error } = await q;
    if (error) {
      // fallback without join if FK isn't named as expected
      let q2 = supabaseAdmin
        .from("installment_contracts")
        .select("*")
        .order("created_at", { ascending: false });
      if (data.status !== "all") q2 = q2.eq("status", data.status);
      if (!data.includeDeleted) q2 = q2.is("deleted_at", null);
      const { data: rows2, error: e2 } = await q2;
      if (e2) throw new Error(e2.message);
      const ids = [...new Set((rows2 ?? []).map((r) => r.client_id))];
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      const dmap = await fetchActorMap((rows2 ?? []).map((r) => r.deleted_by));
      return (rows2 ?? []).map((r) => {
        const d = r.deleted_by ? dmap.get(r.deleted_by) ?? null : null;
        return { ...r, profile: map.get(r.client_id) ?? null, deleted_by_name: d?.full_name ?? d?.email ?? null };
      });
    }
    const dmap = await fetchActorMap((rows ?? []).map((r) => r.deleted_by));
    return (rows ?? []).map((r) => {
      const d = r.deleted_by ? dmap.get(r.deleted_by) ?? null : null;
      return {
        ...r,
        profile: (r as { profiles?: unknown }).profiles ?? null,
        deleted_by_name: d?.full_name ?? d?.email ?? null,
      };
    });
  });

export const adminGetContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const [c, s, p] = await Promise.all([
      supabaseAdmin.from("installment_contracts").select("*").eq("id", data.id).single(),
      supabaseAdmin.from("payment_schedules").select("*").eq("contract_id", data.id).order("seq"),
      supabaseAdmin
        .from("payments")
        .select("*")
        .eq("contract_id", data.id)
        .order("paid_at", { ascending: false }),
    ]);
    if (c.error) throw new Error(c.error.message);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", c.data.client_id)
      .single();
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
        supabaseAdmin
          .from("payment_schedule_history")
          .select("*")
          .in("schedule_id", scheduleIds)
          .order("changed_at", { ascending: false }),
        supabaseAdmin
          .from("payment_carryovers")
          .select("*")
          .in("from_schedule_id", scheduleIds)
          .order("created_at", { ascending: false }),
      ]);
      history = (h.data ?? []) as HistoryRow[];
      carryovers = (co.data ?? []) as CarryoverRow[];
    }
    const contractRow = c.data as typeof c.data & {
      deleted_at?: string | null;
      deleted_by?: string | null;
      deleted_reason?: string | null;
    };
    let deletedByName: string | null = null;
    if (contractRow.deleted_by) {
      const m = await fetchActorMap([contractRow.deleted_by]);
      const a = m.get(contractRow.deleted_by);
      deletedByName = a?.full_name ?? a?.email ?? null;
    }
    return {
      contract: { ...contractRow, deleted_by_name: deletedByName },
      schedule: s.data ?? [],
      payments: p.data ?? [],
      profile: prof,
      history,
      carryovers,
    };
  });

export const adminRecordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scheduleId: z.string().uuid(),
        amount: z.number().positive(),
        method: z.string().min(1).max(50).default("cash"),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: sched, error: sErr } = await supabaseAdmin
      .from("payment_schedules")
      .select("*")
      .eq("id", data.scheduleId)
      .single();
    if (sErr) throw new Error(sErr.message);
    const due =
      Number(sched.amount) + Number(sched.carried_in ?? 0) - Number(sched.carried_out ?? 0);
    const alreadyPaid = Number(sched.paid_amount ?? 0);
    const remaining = Math.max(0, due - alreadyPaid);
    if (remaining <= 0) {
      throw new Error("По этому платежу уже нет остатка");
    }
    if (data.amount > remaining + 0.0001) {
      throw new Error(
        `Сумма платежа (${data.amount} ₽) превышает остаток к оплате (${remaining.toFixed(2)} ₽)`,
      );
    }
    const applied = data.amount;
    const { error: pErr } = await supabaseAdmin.from("payments").insert({
      contract_id: sched.contract_id,
      schedule_id: sched.id,
      amount: applied,
      method: data.method,
      note: data.note ?? null,
    });
    if (pErr) throw new Error(pErr.message);
    const newPaid = alreadyPaid + applied;
    const fullyPaid = newPaid + 0.0001 >= due;
    await supabaseAdmin
      .from("payment_schedules")
      .update({
        paid_amount: newPaid,
        status: fullyPaid ? "paid" : "partial",
      })
      .eq("id", data.scheduleId);
    // check if all paid -> close contract
    const { data: remainingRows } = await supabaseAdmin
      .from("payment_schedules")
      .select("status")
      .eq("contract_id", sched.contract_id);
    if ((remainingRows ?? []).every((r) => r.status === "paid" || r.status === "closed_manual")) {
      await supabaseAdmin
        .from("installment_contracts")
        .update({ status: "closed" })
        .eq("id", sched.contract_id);
    }
    await logAction({
      actorId: context.userId,
      action: "payment.record",
      entityType: "contract",
      entityId: sched.contract_id,
      summary: `Принят платёж ${applied} ₽${fullyPaid ? "" : " (частично)"}`,
      details: { scheduleId: data.scheduleId, amount: applied, method: data.method, note: data.note ?? null, partial: !fullyPaid },
    });
    return { ok: true };
  });

// === Reschedule payment date ===
export const adminReschedulePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scheduleId: z.string().uuid(),
        newDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().min(1).max(200),
        comment: z.string().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: sched, error } = await supabaseAdmin
      .from("payment_schedules")
      .select("*")
      .eq("id", data.scheduleId)
      .single();
    if (error) throw new Error(error.message);
    if (sched.status === "paid" || sched.status === "closed_manual") {
      throw new Error("Нельзя перенести закрытый платёж");
    }
    const oldDate = sched.due_date as string;
    await supabaseAdmin.from("payment_schedule_history").insert({
      schedule_id: data.scheduleId,
      old_due_date: oldDate,
      new_due_date: data.newDueDate,
      reason: data.reason,
      comment: data.comment ?? null,
      changed_by: context.userId,
    });
    const newStatus =
      sched.status === "partial" ? "partial" : "rescheduled";
    await supabaseAdmin
      .from("payment_schedules")
      .update({
        due_date: data.newDueDate,
        original_due_date: sched.original_due_date ?? oldDate,
        status: newStatus,
      })
      .eq("id", data.scheduleId);
    await logAction({
      actorId: context.userId,
      action: "payment.reschedule",
      entityType: "contract",
      entityId: sched.contract_id,
      summary: `Перенос даты платежа №${sched.seq}: ${oldDate} → ${data.newDueDate}`,
      details: { scheduleId: data.scheduleId, oldDate, newDate: data.newDueDate, reason: data.reason },
    });
    return { ok: true };
  });

// === Carry over remainder ===
export const adminCarryOverRemainder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scheduleId: z.string().uuid(),
        mode: z.enum(["next", "distribute", "keep"]),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: sched, error } = await supabaseAdmin
      .from("payment_schedules")
      .select("*")
      .eq("id", data.scheduleId)
      .single();
    if (error) throw new Error(error.message);
    const due =
      Number(sched.amount) + Number(sched.carried_in ?? 0) - Number(sched.carried_out ?? 0);
    const remainder = Math.max(0, due - Number(sched.paid_amount ?? 0));
    if (remainder <= 0) throw new Error("Остатка нет");

    if (data.mode === "keep") {
      // Просто фиксируем запись истории — статус оставляем partial
      await supabaseAdmin.from("payment_carryovers").insert({
        from_schedule_id: sched.id,
        to_schedule_id: null,
        amount: remainder,
        mode: "keep",
        note: data.note ?? null,
        created_by: context.userId,
      });
      await supabaseAdmin
        .from("payment_schedules")
        .update({ status: "partial" })
        .eq("id", sched.id);
    } else if (data.mode === "next") {
      // Найти следующий неоплаченный платёж по контракту
      const { data: nextRows } = await supabaseAdmin
        .from("payment_schedules")
        .select("*")
        .eq("contract_id", sched.contract_id)
        .gt("seq", sched.seq)
        .not("status", "in", "(paid,closed_manual)")
        .order("seq", { ascending: true })
        .limit(1);
      const next = (nextRows ?? [])[0];
      if (!next) throw new Error("Нет следующего платежа для переноса");
      await supabaseAdmin
        .from("payment_schedules")
        .update({
          carried_in: Number(next.carried_in ?? 0) + remainder,
        })
        .eq("id", next.id);
      await supabaseAdmin
        .from("payment_schedules")
        .update({
          carried_out: Number(sched.carried_out ?? 0) + remainder,
          carried_to_schedule_id: next.id,
          status: "carried_over",
        })
        .eq("id", sched.id);
      await supabaseAdmin.from("payment_carryovers").insert({
        from_schedule_id: sched.id,
        to_schedule_id: next.id,
        amount: remainder,
        mode: "next",
        note: data.note ?? null,
        created_by: context.userId,
      });
    } else {
      // distribute: поровну между всеми будущими неоплаченными
      const { data: futureRows } = await supabaseAdmin
        .from("payment_schedules")
        .select("*")
        .eq("contract_id", sched.contract_id)
        .gt("seq", sched.seq)
        .not("status", "in", "(paid,closed_manual)")
        .order("seq", { ascending: true });
      const targets = futureRows ?? [];
      if (targets.length === 0) throw new Error("Нет будущих платежей для распределения");
      const share = remainder / targets.length;
      const carryRows: Array<{ from_schedule_id: string; to_schedule_id: string; amount: number; mode: string; note: string | null; created_by: string }> = [];
      for (const t of targets) {
        await supabaseAdmin
          .from("payment_schedules")
          .update({ carried_in: Number(t.carried_in ?? 0) + share })
          .eq("id", t.id);
        carryRows.push({
          from_schedule_id: sched.id,
          to_schedule_id: t.id,
          amount: share,
          mode: "distribute",
          note: data.note ?? null,
          created_by: context.userId,
        });
      }
      await supabaseAdmin
        .from("payment_schedules")
        .update({
          carried_out: Number(sched.carried_out ?? 0) + remainder,
          status: "carried_over",
        })
        .eq("id", sched.id);
      await supabaseAdmin.from("payment_carryovers").insert(carryRows);
    }

    await logAction({
      actorId: context.userId,
      action: "payment.carryover",
      entityType: "contract",
      entityId: sched.contract_id,
      summary: `Перенос остатка ${remainder.toFixed(2)} ₽ (${data.mode})`,
      details: { scheduleId: sched.id, mode: data.mode, amount: remainder, note: data.note ?? null },
    });
    return { ok: true };
  });

// === Close schedule manually ===
export const adminCloseScheduleManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scheduleId: z.string().uuid(),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: sched, error } = await supabaseAdmin
      .from("payment_schedules")
      .select("*")
      .eq("id", data.scheduleId)
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("payment_schedules")
      .update({ status: "closed_manual" })
      .eq("id", data.scheduleId);
    await logAction({
      actorId: context.userId,
      action: "payment.close_manual",
      entityType: "contract",
      entityId: sched.contract_id,
      summary: `Платёж №${sched.seq} закрыт вручную`,
      details: { scheduleId: sched.id, note: data.note ?? null },
    });
    return { ok: true };
  });

export const adminUpdateContractStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "active", "closed", "overdue"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("installment_contracts")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction({
      actorId: context.userId,
      action: "contract.status",
      entityType: "contract",
      entityId: data.id,
      summary: `Статус контракта изменён на «${data.status}»`,
      details: { status: data.status },
    });
    return { ok: true };
  });

export const adminMakeMeOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Bootstrap: allow becoming owner only if there are no owners yet.
    const { data: owners } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("role", "owner")
      .limit(1);
    if ((owners ?? []).length > 0) {
      throw new Error("Владелец уже назначен. Обратитесь к существующему владельцу.");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "owner" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// === Карточка клиента (для админа) ===

export const adminGetClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const [profileR, phonesR, rolesR, contractsR, applicationsR, schedulesR, paymentsR] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", data.id).maybeSingle(),
        supabaseAdmin.from("user_phones").select("*").eq("user_id", data.id).order("created_at"),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.id),
        supabaseAdmin
          .from("installment_contracts")
          .select("*")
          .eq("client_id", data.id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("installment_applications")
          .select("*")
          .eq("client_id", data.id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("payment_schedules")
          .select(
            "id,contract_id,status,amount,due_date,seq,installment_contracts!inner(client_id)",
          )
          .eq("installment_contracts.client_id", data.id),
        supabaseAdmin
          .from("payments")
          .select("id,amount,paid_at,method,contract_id,installment_contracts!inner(client_id)")
          .eq("installment_contracts.client_id", data.id)
          .order("paid_at", { ascending: false }),
      ]);

    if (!profileR.data) throw new Error("Клиент не найден");
    const profile = profileR.data as typeof profileR.data & {
      deleted_at?: string | null;
      deleted_by?: string | null;
      deleted_reason?: string | null;
    };
    let deletedByName: string | null = null;
    if (profile.deleted_by) {
      const m = await fetchActorMap([profile.deleted_by]);
      const a = m.get(profile.deleted_by);
      deletedByName = a?.full_name ?? a?.email ?? null;
    }

    const schedules = (schedulesR.data ?? []) as Array<{
      status: string;
      amount: number;
      due_date: string;
    }>;
    const today = new Date().toISOString().slice(0, 10);
    let paid = 0,
      overdue = 0,
      pending = 0;
    let paidAmount = 0,
      overdueAmount = 0,
      pendingAmount = 0;
    for (const s of schedules) {
      const amt = Number(s.amount);
      if (s.status === "paid") {
        paid++;
        paidAmount += amt;
      } else if (s.status === "overdue" || (s.status === "pending" && s.due_date < today)) {
        overdue++;
        overdueAmount += amt;
      } else {
        pending++;
        pendingAmount += amt;
      }
    }
    const ratingBase = paid + overdue;
    const ratingScore = ratingBase === 0 ? 100 : Math.round((paid / ratingBase) * 100);
    const stars = Math.max(1, Math.round(ratingScore / 20));
    let tier: "new" | "bronze" | "silver" | "gold" | "platinum" = "new";
    if (paid === 0 && overdue === 0) tier = "new";
    else if (ratingScore >= 95) tier = "platinum";
    else if (ratingScore >= 80) tier = "gold";
    else if (ratingScore >= 60) tier = "silver";
    else tier = "bronze";

    return {
      profile: { ...profile, deleted_by_name: deletedByName },
      phones: phonesR.data ?? [],
      roles: (rolesR.data ?? []).map((r) => r.role as string),
      contracts: contractsR.data ?? [],
      applications: applicationsR.data ?? [],
      payments: paymentsR.data ?? [],
      rating: {
        score: ratingScore,
        stars,
        tier,
        paidCount: paid,
        overdueCount: overdue,
        pendingCount: pending,
        paidAmount,
        overdueAmount,
        pendingAmount,
      },
    };
  });

export const adminUpdateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        fullName: z.string().trim().max(200).optional().nullable(),
        email: z.string().trim().email().max(200).optional().nullable(),
        phone: z.string().trim().max(50).optional().nullable(),
        passportSeries: z.string().trim().max(20).optional().nullable(),
        passportNumber: z.string().trim().max(20).optional().nullable(),
        passportIssuedBy: z.string().trim().max(300).optional().nullable(),
        passportIssuedAt: z.string().trim().max(20).optional().nullable(),
        driverLicenseNumber: z.string().trim().max(50).optional().nullable(),
        driverLicenseCategories: z.string().trim().max(50).optional().nullable(),
        driverLicenseIssuedAt: z.string().trim().max(20).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const patch: Record<string, string | null> = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName || null;
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.passportSeries !== undefined) patch.passport_series = data.passportSeries || null;
    if (data.passportNumber !== undefined) patch.passport_number = data.passportNumber || null;
    if (data.passportIssuedBy !== undefined)
      patch.passport_issued_by = data.passportIssuedBy || null;
    if (data.passportIssuedAt !== undefined)
      patch.passport_issued_at = data.passportIssuedAt || null;
    if (data.driverLicenseNumber !== undefined)
      patch.driver_license_number = data.driverLicenseNumber || null;
    if (data.driverLicenseCategories !== undefined)
      patch.driver_license_categories = data.driverLicenseCategories || null;
    if (data.driverLicenseIssuedAt !== undefined)
      patch.driver_license_issued_at = data.driverLicenseIssuedAt || null;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUploadClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        kind: z.enum(["passport", "driver_license"]),
        fileName: z.string().trim().min(1).max(200),
        contentType: z.string().trim().min(1).max(100),
        dataBase64: z.string().min(1).max(15_000_000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    // Проверяем лимит
    const { count } = await supabaseAdmin
      .from("client_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.userId)
      .eq("kind", data.kind);
    if ((count ?? 0) >= MAX_DOCS_PER_KIND) {
      throw new Error(`Достигнут лимит ${MAX_DOCS_PER_KIND} фото для этого документа`);
    }
    const ext = (data.fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${data.userId}/${data.kind}-${Date.now()}.${ext}`;
    const bytes = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabaseAdmin.storage
      .from("client-documents")
      .upload(path, bytes, { contentType: data.contentType, upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("client-documents")
      .createSignedUrl(path, DOC_SIGNED_TTL);
    if (signErr) throw new Error(signErr.message);
    // Запись в таблицу нескольких документов
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("client_documents")
      .insert({
        user_id: data.userId,
        kind: data.kind,
        file_path: path,
        content_type: data.contentType,
        uploaded_by: context.userId,
      } as never)
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    // Совместимость со старыми полями: обновим, если это первое фото
    const col = data.kind === "passport" ? "passport_photo_url" : "driver_license_photo_url";
    if ((count ?? 0) === 0) {
      await supabaseAdmin
        .from("profiles")
        .update({ [col]: signed.signedUrl } as never)
        .eq("id", data.userId);
    }
    await logAction({
      actorId: context.userId,
      action: "document.upload",
      entityType: "client",
      entityId: data.userId,
      summary: `Загружено фото ${data.kind === "passport" ? "паспорта" : "водительского удостоверения"}`,
      details: { kind: data.kind, fileName: data.fileName },
    });
    return { url: signed.signedUrl, id: (inserted as { id: string }).id };
  });

export const adminListClientDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("client_documents")
      .select("id,kind,file_path,content_type,created_at")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    // Generate short-lived signed URLs on demand — never persisted.
    const withUrls = await Promise.all(
      list.map(async (r) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("client-documents")
          .createSignedUrl(r.file_path, DOC_SIGNED_TTL);
        return { ...r, signed_url: signed?.signedUrl ?? "" };
      }),
    );
    return withUrls;
  });

export const adminDeleteClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: doc, error: gErr } = await supabaseAdmin
      .from("client_documents")
      .select("id,user_id,kind,file_path")
      .eq("id", data.id)
      .single();
    if (gErr) throw new Error(gErr.message);
    await supabaseAdmin.storage.from("client-documents").remove([doc.file_path]);
    const { error: dErr } = await supabaseAdmin.from("client_documents").delete().eq("id", data.id);
    if (dErr) throw new Error(dErr.message);
    // Если удалили последнее фото — почистим legacy-колонку
    const { count } = await supabaseAdmin
      .from("client_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", doc.user_id)
      .eq("kind", doc.kind);
    if ((count ?? 0) === 0) {
      const col = doc.kind === "passport" ? "passport_photo_url" : "driver_license_photo_url";
      await supabaseAdmin
        .from("profiles")
        .update({ [col]: null } as never)
        .eq("id", doc.user_id);
    } else {
      // подставим первый оставшийся в legacy-колонку
      const { data: first } = await supabaseAdmin
        .from("client_documents")
        .select("file_path")
        .eq("user_id", doc.user_id)
        .eq("kind", doc.kind)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (first) {
        const col = doc.kind === "passport" ? "passport_photo_url" : "driver_license_photo_url";
        const { data: signed } = await supabaseAdmin.storage
          .from("client-documents")
          .createSignedUrl(first.file_path, DOC_SIGNED_TTL);
        await supabaseAdmin
          .from("profiles")
          .update({ [col]: signed?.signedUrl ?? null } as never)
          .eq("id", doc.user_id);
      }
    }
    await logAction({
      actorId: context.userId,
      action: "document.delete",
      entityType: "client",
      entityId: doc.user_id,
      summary: `Удалено фото ${doc.kind === "passport" ? "паспорта" : "водительского удостоверения"}`,
      details: { kind: doc.kind, documentId: doc.id },
    });
    return { ok: true };
  });

// === Удаление контракта ===

export const adminDeleteContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: contract, error: gErr } = await supabaseAdmin
      .from("installment_contracts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (gErr) throw new Error(gErr.message);
    const { error: dErr } = await supabaseAdmin
      .from("installment_contracts")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: context.userId,
        deleted_reason: data.reason ?? null,
      } as never)
      .eq("id", data.id);
    if (dErr) throw new Error(dErr.message);
    await logAction({
      actorId: context.userId,
      action: "contract.delete",
      entityType: "contract",
      entityId: data.id,
      summary: `Архивирован контракт «${contract.product_name}»`,
      details: {
        clientId: contract.client_id,
        totalSalePrice: contract.total_sale_price,
        reason: data.reason ?? null,
      },
    });
    return { ok: true };
  });

export const adminRestoreContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertOwner(context.userId);
    const { data: contract } = await supabaseAdmin
      .from("installment_contracts")
      .select("product_name,client_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("installment_contracts")
      .update({ deleted_at: null, deleted_by: null, deleted_reason: null } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction({
      actorId: context.userId,
      action: "contract.restore",
      entityType: "contract",
      entityId: data.id,
      summary: `Восстановлен контракт «${contract?.product_name ?? data.id}»`,
      details: { clientId: contract?.client_id ?? null },
    });
    return { ok: true };
  });

// === Журнал действий ===

export const adminListAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).default(200),
        actorId: z.string().uuid().optional(),
        action: z.string().max(80).optional(),
        search: z.string().max(200).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    let q = supabaseAdmin
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.actorId) q = q.eq("actor_id", data.actorId);
    if (data.action) q = q.eq("action", data.action);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const filtered = data.search
      ? (rows ?? []).filter((r) => {
          const s = data.search!.toLowerCase();
          return (
            (r.summary ?? "").toLowerCase().includes(s) ||
            (r.actor_email ?? "").toLowerCase().includes(s) ||
            (r.actor_name ?? "").toLowerCase().includes(s) ||
            (r.action ?? "").toLowerCase().includes(s)
          );
        })
      : (rows ?? []);
    return filtered;
  });

export const adminAddClientPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        phone: z
          .string()
          .trim()
          .min(3)
          .max(50)
          .regex(/^[+\d\s()-]+$/, "Неверный формат"),
        label: z.string().trim().max(50).optional().nullable(),
        channels: z.array(z.enum(["phone", "whatsapp", "telegram"])).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin.from("user_phones").insert({
      user_id: data.userId,
      phone: data.phone,
      label: data.label ?? null,
      channels: data.channels ?? [],
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteClientPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin.from("user_phones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateClientPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        phone: z
          .string()
          .trim()
          .min(3)
          .max(50)
          .regex(/^[+\d\s()-]+$/)
          .optional(),
        label: z.string().trim().max(50).optional().nullable(),
        channels: z.array(z.enum(["phone", "whatsapp", "telegram"])).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const patch: { phone?: string; label?: string | null; channels?: string[] } = {};
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.label !== undefined) patch.label = data.label;
    if (data.channels !== undefined) patch.channels = data.channels;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin.from("user_phones").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// === Управление пользователями и ролями ===

const ROLE_VALUES = ["client", "manager", "admin", "owner"] as const;
type RoleValue = (typeof ROLE_VALUES)[number];

async function assertAdmin(userId: string): Promise<RoleValue[]> {
  const roles = await assertStaff(userId);
  const isAdmin = roles.some((r) => r === "admin" || r === "owner");
  if (!isAdmin) throw new Error("Forbidden: admin or owner required");
  return roles as RoleValue[];
}

async function assertOwner(userId: string): Promise<RoleValue[]> {
  const roles = await assertStaff(userId);
  if (!roles.includes("owner")) throw new Error("Forbidden: owner required");
  return roles as RoleValue[];
}

async function fetchActorMap(ids: Array<string | null | undefined>) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (uniq.length === 0) return new Map<string, { full_name: string | null; email: string | null }>();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,email")
    .in("id", uniq);
  return new Map((data ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,phone,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: rolesRows } = await supabaseAdmin.from("user_roles").select("user_id,role");
    const map: Record<string, RoleValue[]> = {};
    for (const r of rolesRows ?? []) {
      (map[r.user_id] ??= []).push(r.role as RoleValue);
    }
    return (profiles ?? []).map((p) => ({ ...p, roles: map[p.id] ?? [] }));
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(ROLE_VALUES),
        grant: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const myRoles = await assertAdmin(context.userId);
    const iAmOwner = myRoles.includes("owner");

    // Только owner может назначать/снимать admin и owner
    if ((data.role === "admin" || data.role === "owner") && !iAmOwner) {
      throw new Error("Только владелец может назначать роли admin/owner");
    }

    // Нельзя снимать с себя owner (защита от случайного блока)
    if (data.role === "owner" && !data.grant && data.userId === context.userId) {
      throw new Error("Нельзя снять с себя роль владельца");
    }

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      // Игнорируем конфликт уникальности
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await logAction({
      actorId: context.userId,
      action: data.grant ? "role.grant" : "role.revoke",
      entityType: "user",
      entityId: data.userId,
      summary: `${data.grant ? "Назначена" : "Снята"} роль «${data.role}»`,
      details: { role: data.role, userId: data.userId },
    });
    return { ok: true };
  });

// === Платежи ===

export const adminListPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z
          .enum([
            "all",
            "pending",
            "paid",
            "overdue",
            "partial",
            "carried_over",
            "rescheduled",
            "closed_manual",
          ])
          .default("all"),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        search: z.string().max(200).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);

    // Авто-пометка просроченных
    const today = new Date().toISOString().slice(0, 10);
    await supabaseAdmin
      .from("payment_schedules")
      .update({ status: "overdue" })
      .eq("status", "pending")
      .lt("due_date", today);

    let q = supabaseAdmin
      .from("payment_schedules")
      .select("*")
      .order("due_date", { ascending: true });

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.from) q = q.gte("due_date", data.from);
    if (data.to) q = q.lte("due_date", data.to);

    const { data: schedules, error } = await q;
    if (error) throw new Error(error.message);

    const contractIds = [...new Set((schedules ?? []).map((s) => s.contract_id))];
    const { data: contracts } = await supabaseAdmin
      .from("installment_contracts")
      .select("id,client_id,product_name,client_full_name")
      .in("id", contractIds.length ? contractIds : ["00000000-0000-0000-0000-000000000000"])
      .is("deleted_at", null);

    const clientIds = [...new Set((contracts ?? []).map((c) => c.client_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email,phone")
      .in("id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]);

    const contractMap = new Map((contracts ?? []).map((c) => [c.id, c]));
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const enriched = (schedules ?? []).map((s) => {
      const c = contractMap.get(s.contract_id);
      if (!c) return null;
      const p = c ? profileMap.get(c.client_id) : null;
      return {
        ...s,
        product_name: c?.product_name ?? "—",
        client_full_name: c?.client_full_name ?? p?.full_name ?? "—",
        client_email: p?.email ?? null,
        client_phone: p?.phone ?? null,
      };
    }).filter(<T>(x: T | null): x is T => x !== null);

    const q2 = data.search?.trim().toLowerCase();
    const filtered = q2
      ? enriched.filter(
          (s) =>
            s.client_full_name.toLowerCase().includes(q2) ||
            (s.client_email ?? "").toLowerCase().includes(q2) ||
            s.product_name.toLowerCase().includes(q2),
        )
      : enriched;

    // KPI и aging
    const allSched = enriched;
    const monthStart = today.slice(0, 7) + "-01";
    const monthEndDate = new Date();
    monthEndDate.setMonth(monthEndDate.getMonth() + 1);
    monthEndDate.setDate(0);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    const kpi = {
      dueThisMonth: allSched
        .filter((s) => s.status === "pending" && s.due_date >= monthStart && s.due_date <= monthEnd)
        .reduce((a, s) => a + Number(s.amount), 0),
      overdueAmount: allSched
        .filter((s) => s.status === "overdue")
        .reduce((a, s) => a + Number(s.amount), 0),
      overdueCount: allSched.filter((s) => s.status === "overdue").length,
      paidThisMonth: allSched
        .filter((s) => s.status === "paid" && s.due_date >= monthStart && s.due_date <= monthEnd)
        .reduce((a, s) => a + Number(s.amount), 0),
    };

    const aging = { d0_7: 0, d8_30: 0, d31_60: 0, d60p: 0 };
    for (const s of allSched) {
      if (s.status !== "overdue") continue;
      const diff = Math.floor(
        (new Date(today).getTime() - new Date(s.due_date).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diff <= 7) aging.d0_7 += Number(s.amount);
      else if (diff <= 30) aging.d8_30 += Number(s.amount);
      else if (diff <= 60) aging.d31_60 += Number(s.amount);
      else aging.d60p += Number(s.amount);
    }

    return { items: filtered, kpi, aging };
  });

export const adminMarkSchedulePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scheduleId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: sched, error } = await supabaseAdmin
      .from("payment_schedules")
      .select("*")
      .eq("id", data.scheduleId)
      .single();
    if (error) throw new Error(error.message);
    if (sched.status === "paid") return { ok: true };
    await supabaseAdmin.from("payments").insert({
      contract_id: sched.contract_id,
      schedule_id: sched.id,
      amount: sched.amount,
      method: "cash",
    });
    await supabaseAdmin.from("payment_schedules").update({ status: "paid" }).eq("id", sched.id);
    const { data: remaining } = await supabaseAdmin
      .from("payment_schedules")
      .select("status")
      .eq("contract_id", sched.contract_id);
    if ((remaining ?? []).every((r) => r.status === "paid")) {
      await supabaseAdmin
        .from("installment_contracts")
        .update({ status: "closed" })
        .eq("id", sched.contract_id);
    }
    await logAction({
      actorId: context.userId,
      action: "payment.mark_paid",
      entityType: "contract",
      entityId: sched.contract_id,
      summary: `Отмечен оплаченным платёж ${sched.amount} ₽`,
      details: { scheduleId: data.scheduleId, amount: sched.amount },
    });
    return { ok: true };
  });

// === Демо-данные ===

const DEMO_NAMES = [
  "Алиев Руслан",
  "Бекова Айгуль",
  "Сулейманов Тимур",
  "Закирова Динара",
  "Махмудов Рамиль",
  "Юсупова Лейла",
  "Кадыров Алишер",
  "Нурлыбекова Сабина",
  "Османов Карим",
  "Гаджиева Зарема",
];
const DEMO_PRODUCTS = [
  { name: "iPhone 16 Pro 256GB", price: 130000 },
  { name: "MacBook Air M3", price: 145000 },
  { name: "Диван угловой 'Милан'", price: 89000 },
  { name: "Кухонный гарнитур", price: 220000 },
  { name: "Стиральная машина Bosch", price: 65000 },
  { name: "Холодильник Samsung", price: 95000 },
  { name: "Велосипед горный", price: 42000 },
  { name: "Samsung Galaxy S24 Ultra", price: 110000 },
  { name: "Телевизор LG 65''", price: 78000 },
  { name: "Игровой ПК RTX 4070", price: 185000 },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const adminSeedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await assertStaff(context.userId);
    if (!roles.includes("owner")) throw new Error("Только владелец может загружать демо-данные");

    // 1) 10 профилей
    const profileRows = DEMO_NAMES.map((name, i) => ({
      id: crypto.randomUUID(),
      full_name: name,
      email: `demo${i + 1}+${Date.now()}@noorpay.test`,
      phone: `+7900${rand(1000000, 9999999)}`,
    }));
    const { error: profErr } = await supabaseAdmin.from("profiles").insert(profileRows);
    if (profErr) throw new Error("profiles: " + profErr.message);

    // client роли
    await supabaseAdmin
      .from("user_roles")
      .insert(profileRows.map((p) => ({ user_id: p.id, role: "client" as const })));

    // 2) 20 договоров
    const today = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contracts: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedules: any[] = [];

    for (let i = 0; i < 20; i++) {
      const profile = pick(profileRows);
      const product = pick(DEMO_PRODUCTS);
      const term = pick([6, 9, 12, 18, 24]);
      const down = Math.round(product.price * (rand(10, 30) / 100));
      const principal = product.price - down;
      const markupRate = DEFAULT_MARKUP_RATE;
      const markupAmount = principal * markupRate * term;
      const totalDebt = principal + markupAmount;
      const totalSale = down + totalDebt;
      const monthly = totalDebt / term;

      // случайно: 70% активных, 15% закрытых, 15% просроченных
      const r = Math.random();
      const status = r < 0.15 ? "closed" : r < 0.3 ? "overdue" : "active";
      const monthsAgo = rand(1, 10);
      const start = new Date(today);
      start.setMonth(start.getMonth() - monthsAgo);

      const contractId = crypto.randomUUID();
      contracts.push({
        id: contractId,
        client_id: profile.id,
        client_full_name: profile.full_name,
        client_telegram:
          Math.random() > 0.5 ? "@" + profile.full_name.split(" ")[0].toLowerCase() : null,
        product_name: product.name,
        product_description: null,
        product_price: product.price,
        down_payment: down,
        principal,
        markup_rate: markupRate,
        markup_amount: markupAmount,
        total_sale_price: totalSale,
        monthly_payment: monthly,
        term_months: term,
        start_date: start.toISOString().slice(0, 10),
        status,
      });

      // график платежей
      const monthsPaid =
        status === "closed"
          ? term
          : status === "overdue"
            ? Math.max(0, monthsAgo - 2)
            : Math.min(monthsAgo, term);

      for (let j = 1; j <= term; j++) {
        const due = new Date(start);
        due.setMonth(due.getMonth() + j);
        const dueStr = due.toISOString().slice(0, 10);
        let st: "pending" | "paid" | "overdue" = "pending";
        if (j <= monthsPaid) st = "paid";
        else if (dueStr < today.toISOString().slice(0, 10)) st = "overdue";
        schedules.push({
          contract_id: contractId,
          seq: j,
          due_date: dueStr,
          amount: monthly,
          status: st,
        });
      }
    }

    const { error: cErr } = await supabaseAdmin.from("installment_contracts").insert(contracts);
    if (cErr) throw new Error("contracts: " + cErr.message);
    const { error: sErr } = await supabaseAdmin.from("payment_schedules").insert(schedules);
    if (sErr) throw new Error("schedules: " + sErr.message);

    return { ok: true, profiles: profileRows.length, contracts: contracts.length };
  });

// === Удаление клиента ===

export const adminDeleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.id === context.userId) throw new Error("Нельзя удалить самого себя");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name,email")
      .eq("id", data.id)
      .maybeSingle();
    const nowIso = new Date().toISOString();
    // Мягкое удаление: помечаем профиль и каскадно — все его контракты
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ deleted_at: nowIso, deleted_by: context.userId, deleted_reason: data.reason ?? null } as never)
      .eq("id", data.id);
    if (pErr) throw new Error(pErr.message);
    await supabaseAdmin
      .from("installment_contracts")
      .update({ deleted_at: nowIso, deleted_by: context.userId, deleted_reason: data.reason ?? "Удалён клиент" } as never)
      .eq("client_id", data.id)
      .is("deleted_at", null);
    await logAction({
      actorId: context.userId,
      action: "client.delete",
      entityType: "client",
      entityId: data.id,
      summary: `Архивирован клиент ${prof?.full_name ?? prof?.email ?? data.id}`,
      details: { email: prof?.email ?? null, reason: data.reason ?? null },
    });
    return { ok: true };
  });

export const adminRestoreClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), restoreContracts: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertOwner(context.userId);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name,email")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ deleted_at: null, deleted_by: null, deleted_reason: null } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.restoreContracts !== false) {
      await supabaseAdmin
        .from("installment_contracts")
        .update({ deleted_at: null, deleted_by: null, deleted_reason: null } as never)
        .eq("client_id", data.id);
    }
    await logAction({
      actorId: context.userId,
      action: "client.restore",
      entityType: "client",
      entityId: data.id,
      summary: `Восстановлен клиент ${prof?.full_name ?? prof?.email ?? data.id}`,
      details: { restoreContracts: data.restoreContracts !== false },
    });
    return { ok: true };
  });

// === Оформление рассрочки админом (минуя поток заявок) ===

const AdminCreateInstallmentSchema = z.object({
  client: z.union([
    z.object({ kind: z.literal("existing"), id: z.string().uuid() }),
    z.object({
      kind: z.literal("new"),
      email: z.string().trim().email().max(200),
      fullName: z.string().trim().min(1).max(200),
      phone: z
        .string()
        .trim()
        .max(50)
        .regex(/^[+\d\s()-]+$/)
        .optional()
        .nullable(),
      address: z
        .object({
          region: z.string().trim().max(200).optional().nullable(),
          district: z.string().trim().max(200).optional().nullable(),
          city: z.string().trim().max(200).optional().nullable(),
          street: z.string().trim().max(200).optional().nullable(),
          house: z.string().trim().max(50).optional().nullable(),
          apartment: z.string().trim().max(50).optional().nullable(),
          raw: z.string().trim().max(500).optional().nullable(),
        })
        .optional()
        .nullable(),
    }),
  ]),
  productName: z.string().trim().min(1).max(200),
  productDescription: z.string().trim().max(2000).optional().nullable(),
  productPrice: z.number().positive().max(1_000_000_000),
  downPayment: z.number().min(0).max(1_000_000_000),
  termMonths: z.number().int().min(1).max(MAX_TERM),
  firstPaymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  clientComment: z.string().trim().max(2000).optional().nullable(),
  markupRate: z.number().min(0).max(1).optional(),
  investorId: z.string().uuid().optional().nullable(),
  extraPhones: z
    .array(
      z.object({
        phone: z
          .string()
          .trim()
          .min(3)
          .max(50)
          .regex(/^[+\d\s()-]+$/),
        label: z.string().trim().max(50).optional().nullable(),
        channels: z.array(z.enum(["phone", "whatsapp", "telegram"])).optional(),
      }),
    )
    .max(10)
    .optional(),
  guarantors: z
    .array(
      z.object({
        fullName: z.string().trim().min(1).max(200),
        comment: z.string().trim().max(2000).optional().nullable(),
        phones: z
          .array(
            z.object({
              phone: z.string().trim().min(3).max(50).regex(/^[+\d\s()-]+$/),
              label: z.string().trim().max(50).optional().nullable(),
              channels: z.array(z.enum(["phone", "whatsapp", "telegram"])).optional(),
            }),
          )
          .max(10)
          .optional(),
        emails: z
          .array(
            z.object({
              email: z.string().trim().email().max(200),
              label: z.string().trim().max(50).optional().nullable(),
            }),
          )
          .max(10)
          .optional(),
      }),
    )
    .max(10)
    .optional(),
  documents: z
    .object({
      passportSeries: z.string().trim().max(20).optional().nullable(),
      passportNumber: z.string().trim().max(20).optional().nullable(),
      passportIssuedBy: z.string().trim().max(300).optional().nullable(),
      passportIssuedAt: z.string().trim().max(20).optional().nullable(),
      driverLicenseNumber: z.string().trim().max(50).optional().nullable(),
      driverLicenseCategories: z.string().trim().max(50).optional().nullable(),
      driverLicenseIssuedAt: z.string().trim().max(20).optional().nullable(),
      passportPhotos: z
        .array(
          z.object({
            fileName: z.string().trim().min(1).max(200),
            contentType: z.string().trim().min(1).max(100),
            dataBase64: z.string().min(1).max(15_000_000),
          }),
        )
        .max(5)
        .optional()
        .nullable(),
      driverLicensePhotos: z
        .array(
          z.object({
            fileName: z.string().trim().min(1).max(200),
            contentType: z.string().trim().min(1).max(100),
            dataBase64: z.string().min(1).max(15_000_000),
          }),
        )
        .max(5)
        .optional()
        .nullable(),
    })
    .optional()
    .nullable(),
});

export const adminCreateInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AdminCreateInstallmentSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);

    let clientId: string;
    let clientFullName: string | null = null;
    let tempPassword: string | null = null;

    if (data.client.kind === "existing") {
      clientId = data.client.id;
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", clientId)
        .maybeSingle();
      clientFullName = prof?.full_name ?? null;
    } else {
      // Идентификация клиента идёт только по email. Телефон — доп. контакт,
      // никаких lookup'ов/связей аккаунтов по номеру телефона нет.
      // Если аккаунт с таким email уже существует — не создаём дубликат.
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .eq("email", data.client.email)
        .maybeSingle();
      if (existingProfile) {
        throw new Error(
          `Пользователь с email ${data.client.email} уже зарегистрирован. Выберите его из списка существующих клиентов.`,
        );
      }
      // создаём пользователя через auth.admin — триггер handle_new_user создаст profile+role
      tempPassword =
        Math.random().toString(36).slice(2, 10) +
        Math.random().toString(36).slice(2, 6).toUpperCase() +
        "!";
      const { data: created, error: cuErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.client.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: data.client.fullName, phone: data.client.phone ?? null },
      });
      if (cuErr || !created.user) {
        throw new Error(cuErr?.message ?? "Не удалось создать пользователя");
      }
      clientId = created.user.id;
      clientFullName = data.client.fullName;
      // На всякий случай — гарантируем профиль (если триггер не отработал)
      await supabaseAdmin.from("profiles").upsert({
        id: clientId,
        email: data.client.email,
        full_name: data.client.fullName,
        phone: data.client.phone ?? null,
        address: data.client.address ?? null,
      } as never);
      // Сохраняем начальный пароль для доступа админов в профиле клиента
      await supabaseAdmin
        .from("client_secrets")
        .upsert({ user_id: clientId, initial_password: tempPassword } as never);
    }

    const calc = calcInstallment({
      productPrice: data.productPrice,
      downPayment: data.downPayment,
      termMonths: data.termMonths,
      markupRate: data.markupRate,
    });
    const startDate = data.firstPaymentDate
      ? new Date(data.firstPaymentDate + "T00:00:00")
      : (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + 1);
          return d;
        })();

    const { data: contract, error: cErr } = await supabaseAdmin
      .from("installment_contracts")
      .insert({
        client_id: clientId,
        product_name: data.productName,
        product_description: data.productDescription ?? null,
        client_full_name: clientFullName,
        client_comment: data.clientComment ?? null,
        product_price: data.productPrice,
        down_payment: data.downPayment,
        principal: calc.principal,
        markup_rate: calc.markupRate,
        markup_amount: calc.markupAmount,
        total_sale_price: calc.totalSalePrice,
        monthly_payment: calc.monthlyPayment,
        term_months: calc.termMonths,
        start_date: startDate.toISOString().slice(0, 10),
        status: "active",
        investor_id: data.investorId ?? null,
      } as never)
      .select()
      .single();
    if (cErr) throw new Error(cErr.message);

    const scheduleStart = new Date(startDate);
    scheduleStart.setMonth(scheduleStart.getMonth() - 1);
    const schedule = buildSchedule(scheduleStart, calc.termMonths, calc.monthlyPayment).map(
      (s) => ({
        contract_id: contract.id,
        seq: s.seq,
        due_date: s.dueDate.toISOString().slice(0, 10),
        amount: s.amount,
        status: "pending" as const,
      }),
    );
    const { error: schedErr } = await supabaseAdmin.from("payment_schedules").insert(schedule);
    if (schedErr) throw new Error(schedErr.message);

    if (data.extraPhones && data.extraPhones.length > 0) {
      await supabaseAdmin.from("user_phones").insert(
        data.extraPhones.map((p) => ({
          user_id: clientId,
          phone: p.phone,
          label: p.label ?? null,
          channels: p.channels ?? [],
        })),
      );
    }

    // Поручители
    if (data.guarantors && data.guarantors.length > 0) {
      for (const g of data.guarantors) {
        const { data: gRow, error: gErr } = await supabaseAdmin
          .from("contract_guarantors")
          .insert({
            contract_id: contract.id,
            full_name: g.fullName,
            comment: g.comment ?? null,
          } as never)
          .select("id")
          .single();
        if (gErr || !gRow) throw new Error(gErr?.message ?? "Не удалось добавить поручителя");
        const gid = (gRow as { id: string }).id;
        if (g.phones && g.phones.length > 0) {
          const { error } = await supabaseAdmin.from("guarantor_phones").insert(
            g.phones.map((p) => ({
              guarantor_id: gid,
              phone: p.phone,
              label: p.label ?? null,
              channels: p.channels ?? [],
            })) as never,
          );
          if (error) throw new Error(error.message);
        }
        if (g.emails && g.emails.length > 0) {
          const { error } = await supabaseAdmin.from("guarantor_emails").insert(
            g.emails.map((e) => ({
              guarantor_id: gid,
              email: e.email,
              label: e.label ?? null,
            })) as never,
          );
          if (error) throw new Error(error.message);
        }
      }
    }

    if (data.documents) {
      const d = data.documents;
      const patch: Record<string, string | null> = {};
      if (d.passportSeries !== undefined) patch.passport_series = d.passportSeries || null;
      if (d.passportNumber !== undefined) patch.passport_number = d.passportNumber || null;
      if (d.passportIssuedBy !== undefined) patch.passport_issued_by = d.passportIssuedBy || null;
      if (d.passportIssuedAt !== undefined) patch.passport_issued_at = d.passportIssuedAt || null;
      if (d.driverLicenseNumber !== undefined)
        patch.driver_license_number = d.driverLicenseNumber || null;
      if (d.driverLicenseCategories !== undefined)
        patch.driver_license_categories = d.driverLicenseCategories || null;
      if (d.driverLicenseIssuedAt !== undefined)
        patch.driver_license_issued_at = d.driverLicenseIssuedAt || null;

      for (const [kind, photos] of [
        ["passport", d.passportPhotos ?? []] as const,
        ["driver_license", d.driverLicensePhotos ?? []] as const,
      ]) {
        let firstSignedUrl: string | null = null;
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const ext = (photo.fileName.split(".").pop() || "bin")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          const path = `${clientId}/${kind}-${Date.now()}-${i}.${ext}`;
          const bytes = Uint8Array.from(atob(photo.dataBase64), (c) => c.charCodeAt(0));
          const { error: upErr } = await supabaseAdmin.storage
            .from("client-documents")
            .upload(path, bytes, { contentType: photo.contentType, upsert: true });
          if (upErr) throw new Error(upErr.message);
          const { data: signed, error: signErr } = await supabaseAdmin.storage
            .from("client-documents")
            .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
          if (signErr) throw new Error(signErr.message);
          await supabaseAdmin.from("client_documents").insert({
            user_id: clientId,
            kind,
            file_path: path,
            content_type: photo.contentType,
            uploaded_by: context.userId,
          } as never);
          if (i === 0) firstSignedUrl = signed.signedUrl;
        }
        if (firstSignedUrl) {
          patch[kind === "passport" ? "passport_photo_url" : "driver_license_photo_url"] =
            firstSignedUrl;
        }
      }

      if (Object.keys(patch).length > 0) {
        await supabaseAdmin
          .from("profiles")
          .update(patch as never)
          .eq("id", clientId);
      }
    }

    await logAction({
      actorId: context.userId,
      action: "installment.create",
      entityType: "contract",
      entityId: contract.id,
      summary: `Оформлена рассрочка «${data.productName}» (${formatRu(data.productPrice)} ₽)`,
      details: {
        clientId,
        productName: data.productName,
        productPrice: data.productPrice,
        downPayment: data.downPayment,
        termMonths: data.termMonths,
        newClient: data.client.kind === "new",
      },
    });

    if (data.investorId) {
      await notifyInvestorOfFundedContract(contract.id);
    }

    return { contractId: contract.id, clientId, tempPassword };
  });

function formatRu(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

// === Доступ клиента: начальный пароль и сброс ===

function generatePassword(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    "!"
  );
}

export const adminGetClientSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: row } = await supabaseAdmin
      .from("client_secrets")
      .select("initial_password,updated_at")
      .eq("user_id", data.userId)
      .maybeSingle();
    return {
      password: (row as { initial_password?: string } | null)?.initial_password ?? null,
      updatedAt: (row as { updated_at?: string } | null)?.updated_at ?? null,
    };
  });

export const adminResetClientPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const newPassword = generatePassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: newPassword,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("client_secrets")
      .upsert({ user_id: data.userId, initial_password: newPassword } as never);
    await logAction({
      actorId: context.userId,
      action: "client.password_reset",
      entityType: "client",
      entityId: data.userId,
      summary: "Сброшен пароль клиента",
    });
    return { password: newPassword };
  });

// === Поручители ===

export const adminListGuarantors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: guarantors, error } = await supabaseAdmin
      .from("contract_guarantors")
      .select("id,full_name,comment,created_at")
      .eq("contract_id", data.contractId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (guarantors ?? []).map((g) => (g as { id: string }).id);
    if (ids.length === 0) return [] as Array<{
      id: string;
      full_name: string;
      comment: string | null;
      phones: Array<{ id: string; phone: string; label: string | null; channels: string[] }>;
      emails: Array<{ id: string; email: string; label: string | null }>;
    }>;
    const [{ data: phones }, { data: emails }] = await Promise.all([
      supabaseAdmin
        .from("guarantor_phones")
        .select("id,guarantor_id,phone,label,channels")
        .in("guarantor_id", ids),
      supabaseAdmin
        .from("guarantor_emails")
        .select("id,guarantor_id,email,label")
        .in("guarantor_id", ids),
    ]);
    return (guarantors ?? []).map((g) => {
      const row = g as { id: string; full_name: string; comment: string | null };
      return {
        id: row.id,
        full_name: row.full_name,
        comment: row.comment,
        phones: (phones ?? [])
          .filter((p) => (p as { guarantor_id: string }).guarantor_id === row.id)
          .map((p) => ({
            id: (p as { id: string }).id,
            phone: (p as { phone: string }).phone,
            label: (p as { label: string | null }).label,
            channels: ((p as { channels?: string[] }).channels ?? []) as string[],
          })),
        emails: (emails ?? [])
          .filter((e) => (e as { guarantor_id: string }).guarantor_id === row.id)
          .map((e) => ({
            id: (e as { id: string }).id,
            email: (e as { email: string }).email,
            label: (e as { label: string | null }).label,
          })),
      };
    });
  });

export const adminDeleteGuarantor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("contract_guarantors")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
