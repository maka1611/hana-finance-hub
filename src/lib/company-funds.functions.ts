import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertOwner(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ok = (data ?? []).some((r) => r.role === "owner");
  if (!ok) throw new Error("Forbidden: owner only");
}

async function assertStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ok = (data ?? []).some((r) =>
    ["owner", "admin", "manager"].includes(r.role as string),
  );
  if (!ok) throw new Error("Forbidden: staff only");
}

// Lightweight summary of company own funds, available to all staff
// (manager/admin/owner). Returns just what's needed at the placement step.
export const getCompanyFundsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const [ops, expenses, contracts, payments] = await Promise.all([
      supabaseAdmin.from("company_funds_operations").select("op_type,amount"),
      supabaseAdmin.from("company_expenses").select("amount"),
      supabaseAdmin
        .from("installment_contracts")
        .select("id,status,principal,markup_amount,investor_id")
        .is("deleted_at", null),
      supabaseAdmin.from("payments").select("amount,contract_id"),
    ]);

    let deposit = 0, withdraw = 0, adjustment = 0;
    for (const o of (ops.data ?? []) as Array<{ op_type: string; amount: number | string }>) {
      const v = Number(o.amount);
      if (o.op_type === "deposit") deposit += v;
      else if (o.op_type === "withdraw") withdraw += v;
      else adjustment += v;
    }
    const capital = deposit - withdraw + adjustment;
    const expensesTotal = ((expenses.data ?? []) as Array<{ amount: number | string }>)
      .reduce((s, e) => s + Number(e.amount), 0);

    const paidByContract = new Map<string, number>();
    for (const p of (payments.data ?? []) as Array<{ amount: number | string; contract_id: string }>) {
      paidByContract.set(p.contract_id, (paidByContract.get(p.contract_id) ?? 0) + Number(p.amount));
    }

    let capitalOwnInUse = 0;
    let profitOwnAll = 0;
    let lastOwnContractAt: string | null = null;
    for (const c of (contracts.data ?? []) as Array<{
      id: string; status: string; principal: number | string;
      markup_amount: number | string; investor_id: string | null;
      created_at?: string;
    }>) {
      if (c.investor_id) continue;
      const principal = Number(c.principal);
      const markup = Number(c.markup_amount);
      const total = principal + markup;
      const markupShare = total > 0 ? markup / total : 0;
      const paid = paidByContract.get(c.id) ?? 0;
      profitOwnAll += paid * markupShare;
      const isActive = c.status === "active" || c.status === "overdue" || c.status === "pending";
      if (isActive) capitalOwnInUse += principal;
      if (c.created_at && (!lastOwnContractAt || c.created_at > lastOwnContractAt)) {
        lastOwnContractAt = c.created_at;
      }
    }

    const balance = capital + profitOwnAll - expensesTotal;
    const freeCash = balance - capitalOwnInUse;
    const idleDays = lastOwnContractAt
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(lastOwnContractAt).getTime()) / 86400000),
        )
      : null;
    return {
      balance,
      capitalInUse: capitalOwnInUse,
      freeCash,
      loadPct: balance > 0 ? (capitalOwnInUse / balance) * 100 : 0,
      lastContractAt: lastOwnContractAt,
      idleDays,
      loadRatio: balance > 0 ? capitalOwnInUse / balance : 0,
      idleRatio: balance > 0 ? (balance - capitalOwnInUse) / balance : 0,
    };
  });

// ============ Operations ============

const opInput = z.object({
  op_type: z.enum(["deposit", "withdraw", "adjustment"]),
  amount: z.number().positive(),
  operation_date: z.string().optional(),
  note: z.string().optional().nullable(),
});

export const recordCompanyFundsOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => opInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const { error } = await supabaseAdmin.from("company_funds_operations").insert({
      op_type: data.op_type,
      amount: data.amount,
      operation_date: data.operation_date ?? new Date().toISOString().slice(0, 10),
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCompanyFundsOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const { error } = await supabaseAdmin
      .from("company_funds_operations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCompanyFundsOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.userId);
    const { data, error } = await supabaseAdmin
      .from("company_funds_operations")
      .select("id,op_type,amount,operation_date,note,created_at,created_by")
      .order("operation_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      op_type: r.op_type as "deposit" | "withdraw" | "adjustment",
      amount: Number(r.amount),
      operation_date: r.operation_date as string,
      note: r.note as string | null,
      created_at: r.created_at as string,
    }));
  });

// ============ Expenses ============

const expenseInput = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  expense_date: z.string().optional(),
  description: z.string().optional().nullable(),
});

export const recordCompanyExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => expenseInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const { error } = await supabaseAdmin.from("company_expenses").insert({
      category: data.category,
      amount: data.amount,
      expense_date: data.expense_date ?? new Date().toISOString().slice(0, 10),
      description: data.description ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCompanyExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const { error } = await supabaseAdmin
      .from("company_expenses")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCompanyExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.userId);
    const { data, error } = await supabaseAdmin
      .from("company_expenses")
      .select("id,category,amount,expense_date,description,created_at")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      category: r.category as string,
      amount: Number(r.amount),
      expense_date: r.expense_date as string,
      description: r.description as string | null,
      created_at: r.created_at as string,
    }));
  });

// ============ Min reserve setting ============

export const getCompanyFundsMinReserve = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.userId);
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("company_funds_min_reserve")
      .eq("id", true)
      .maybeSingle();
    return { reserve: Number(data?.company_funds_min_reserve ?? 0) };
  });

export const setCompanyFundsMinReserve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reserve: z.number().min(0) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({ company_funds_min_reserve: data.reserve })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Summary / Dynamics ============

type Period = "all" | "year" | "quarter" | "month" | "week" | "today" | "custom";

function resolvePeriod(period: Period, fromIn?: string, toIn?: string) {
  const today = new Date();
  const toDate = toIn ?? today.toISOString().slice(0, 10);
  let fromDate: string;
  const d = new Date(today);
  switch (period) {
    case "today":
      fromDate = toDate;
      break;
    case "week":
      d.setDate(d.getDate() - 6);
      fromDate = d.toISOString().slice(0, 10);
      break;
    case "month":
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      break;
    case "quarter":
      d.setMonth(d.getMonth() - 3);
      fromDate = d.toISOString().slice(0, 10);
      break;
    case "year":
      d.setFullYear(d.getFullYear() - 1);
      fromDate = d.toISOString().slice(0, 10);
      break;
    case "custom":
      fromDate = fromIn ?? "2000-01-01";
      break;
    case "all":
    default:
      fromDate = "2000-01-01";
  }
  return { from: fromDate, to: toDate };
}

const summaryInput = z.object({
  period: z.enum(["all", "year", "quarter", "month", "week", "today", "custom"]).default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const getCompanyFundsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => summaryInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const { from, to } = resolvePeriod(data.period, data.from, data.to);

    const [opsAll, opsPeriod, expensesAll, expensesPeriod, contracts, payments, investors, settings] =
      await Promise.all([
        supabaseAdmin.from("company_funds_operations").select("op_type,amount"),
        supabaseAdmin
          .from("company_funds_operations")
          .select("op_type,amount,operation_date")
          .gte("operation_date", from)
          .lte("operation_date", to),
        supabaseAdmin.from("company_expenses").select("amount"),
        supabaseAdmin
          .from("company_expenses")
          .select("amount,expense_date")
          .gte("expense_date", from)
          .lte("expense_date", to),
        supabaseAdmin
          .from("installment_contracts")
          .select("id,status,principal,markup_amount,investor_id,start_date")
          .is("deleted_at", null),
        supabaseAdmin.from("payments").select("amount,paid_at,contract_id"),
        supabaseAdmin.from("investors").select("id,profit_share_rate"),
        supabaseAdmin
          .from("app_settings")
          .select("company_funds_min_reserve")
          .eq("id", true)
          .maybeSingle(),
      ]);

    const sumOps = (arr: Array<{ op_type: string; amount: number | string }> | null) => {
      let deposit = 0,
        withdraw = 0,
        adjustment = 0;
      for (const o of arr ?? []) {
        const v = Number(o.amount);
        if (o.op_type === "deposit") deposit += v;
        else if (o.op_type === "withdraw") withdraw += v;
        else adjustment += v;
      }
      return { deposit, withdraw, adjustment, net: deposit - withdraw + adjustment };
    };

    const allOpsSum = sumOps(opsAll.data as never);
    const periodOpsSum = sumOps(opsPeriod.data as never);
    const expensesTotal = (expensesAll.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
    const expensesPeriodTotal = (expensesPeriod.data ?? []).reduce(
      (s, e) => s + Number(e.amount),
      0,
    );

    const invById = new Map(
      (investors.data ?? []).map((i) => [i.id, Number(i.profit_share_rate)]),
    );

    const paidByContract = new Map<string, number>();
    const paidByContractPeriod = new Map<string, number>();
    for (const p of (payments.data ?? []) as Array<{
      amount: number | string;
      paid_at: string;
      contract_id: string;
    }>) {
      const v = Number(p.amount);
      paidByContract.set(p.contract_id, (paidByContract.get(p.contract_id) ?? 0) + v);
      const day = (p.paid_at ?? "").slice(0, 10);
      if (day >= from && day <= to) {
        paidByContractPeriod.set(
          p.contract_id,
          (paidByContractPeriod.get(p.contract_id) ?? 0) + v,
        );
      }
    }

    // Capital deployed (active contracts)
    let capitalOwnInUse = 0;
    let capitalInvestorInUse = 0;
    // Lifetime profit (cash)
    let profitOwnAll = 0;
    let profitCompanyFromInvAll = 0;
    let profitInvestorsAll = 0;
    // Period profit (cash)
    let profitOwnPeriod = 0;
    let profitCompanyFromInvPeriod = 0;
    let profitInvestorsPeriod = 0;

    for (const c of (contracts.data ?? []) as Array<{
      id: string;
      status: string;
      principal: number | string;
      markup_amount: number | string;
      investor_id: string | null;
    }>) {
      const principal = Number(c.principal);
      const markup = Number(c.markup_amount);
      const total = principal + markup;
      const markupShare = total > 0 ? markup / total : 0;
      const paidAll = paidByContract.get(c.id) ?? 0;
      const paidPeriod = paidByContractPeriod.get(c.id) ?? 0;
      const receivedMarkupAll = paidAll * markupShare;
      const receivedMarkupPeriod = paidPeriod * markupShare;
      const isActive = c.status === "active" || c.status === "overdue" || c.status === "pending";
      if (c.investor_id && invById.has(c.investor_id)) {
        const rate = invById.get(c.investor_id)!;
        if (isActive) capitalInvestorInUse += principal;
        profitInvestorsAll += receivedMarkupAll * rate;
        profitCompanyFromInvAll += receivedMarkupAll * (1 - rate);
        profitInvestorsPeriod += receivedMarkupPeriod * rate;
        profitCompanyFromInvPeriod += receivedMarkupPeriod * (1 - rate);
      } else {
        if (isActive) capitalOwnInUse += principal;
        profitOwnAll += receivedMarkupAll;
        profitOwnPeriod += receivedMarkupPeriod;
      }
    }

    const companyProfitAll = profitOwnAll + profitCompanyFromInvAll;
    const companyProfitPeriod = profitOwnPeriod + profitCompanyFromInvPeriod;

    // Company balance = injected funds + profit earned - investor payouts (we treat profit
    // as accrued; payouts to investors are tracked when they happen via withdraw ops)
    const companyCapital = allOpsSum.net;
    const balance = companyCapital + companyProfitAll - expensesTotal;
    const freeCash = balance - capitalOwnInUse;
    const loadPct = balance > 0 ? (capitalOwnInUse / balance) * 100 : 0;
    const minReserve = Number(settings.data?.company_funds_min_reserve ?? 0);

    // ROI annualized — naive: profit_all / capital * 365 / days_since_first_op
    let daysActive = 0;
    if ((opsAll.data ?? []).length > 0) {
      const firstOp = await supabaseAdmin
        .from("company_funds_operations")
        .select("operation_date")
        .order("operation_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstOp.data?.operation_date) {
        daysActive = Math.max(
          1,
          Math.round(
            (Date.now() - new Date(firstOp.data.operation_date).getTime()) / 86_400_000,
          ),
        );
      }
    }
    const roiAnnualPct =
      companyCapital > 0 && daysActive > 0
        ? (companyProfitAll / companyCapital) * (365 / daysActive) * 100
        : 0;

    // Forecast — pending schedules in next 30/60/90 days
    const today = new Date().toISOString().slice(0, 10);
    const d30 = new Date(); d30.setDate(d30.getDate() + 30);
    const d60 = new Date(); d60.setDate(d60.getDate() + 60);
    const d90 = new Date(); d90.setDate(d90.getDate() + 90);
    const dateStr = (d: Date) => d.toISOString().slice(0, 10);

    const { data: schedRaw } = await supabaseAdmin
      .from("payment_schedules")
      .select("amount,due_date,status,contract_id")
      .in("status", ["pending", "partial", "overdue"]);
    const ctrSrcMap = new Map<string, "own" | "investor">();
    for (const c of (contracts.data ?? []) as Array<{ id: string; investor_id: string | null }>) {
      ctrSrcMap.set(c.id, c.investor_id ? "investor" : "own");
    }
    const forecast = { d30: 0, d60: 0, d90: 0, own: 0, investor: 0, overdue: 0 };
    for (const s of (schedRaw ?? []) as Array<{
      amount: number | string;
      due_date: string;
      status: string;
      contract_id: string;
    }>) {
      const v = Number(s.amount);
      const src = ctrSrcMap.get(s.contract_id) ?? "own";
      if (s.due_date < today || s.status === "overdue") forecast.overdue += v;
      if (s.due_date >= today && s.due_date <= dateStr(d30)) forecast.d30 += v;
      if (s.due_date >= today && s.due_date <= dateStr(d60)) forecast.d60 += v;
      if (s.due_date >= today && s.due_date <= dateStr(d90)) {
        forecast.d90 += v;
        if (src === "own") forecast.own += v;
        else forecast.investor += v;
      }
    }

    return {
      period: { from, to },
      capital: {
        injected: companyCapital,
        deposits: allOpsSum.deposit,
        withdrawals: allOpsSum.withdraw,
        adjustments: allOpsSum.adjustment,
      },
      balance,
      freeCash,
      capitalInUse: capitalOwnInUse,
      capitalInvestorInUse,
      loadPct,
      minReserve,
      belowReserve: minReserve > 0 && freeCash < minReserve,
      expensesTotal,
      profit: {
        own: profitOwnAll,
        fromInvestors: profitCompanyFromInvAll,
        total: companyProfitAll,
        toInvestors: profitInvestorsAll,
        netOfExpenses: companyProfitAll - expensesTotal,
      },
      period_stats: {
        deposits: periodOpsSum.deposit,
        withdrawals: periodOpsSum.withdraw,
        adjustments: periodOpsSum.adjustment,
        expenses: expensesPeriodTotal,
        profitOwn: profitOwnPeriod,
        profitFromInvestors: profitCompanyFromInvPeriod,
        profitTotal: companyProfitPeriod,
        profitToInvestors: profitInvestorsPeriod,
      },
      roiAnnualPct,
      daysActive,
      forecast,
    };
  });

// ============ Per-investor breakdown ============

export const getCompanyFundsByInvestor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.userId);
    const [investors, contracts, payments, contribs] = await Promise.all([
      supabaseAdmin
        .from("investors")
        .select("id,full_name,total_capital,profit_share_rate,is_active"),
      supabaseAdmin
        .from("installment_contracts")
        .select("id,status,principal,markup_amount,investor_id")
        .is("deleted_at", null),
      supabaseAdmin.from("payments").select("amount,contract_id"),
      supabaseAdmin.from("investor_contributions").select("investor_id,amount"),
    ]);

    const paidByContract = new Map<string, number>();
    for (const p of (payments.data ?? []) as Array<{
      amount: number | string;
      contract_id: string;
    }>) {
      paidByContract.set(
        p.contract_id,
        (paidByContract.get(p.contract_id) ?? 0) + Number(p.amount),
      );
    }

    const contribByInv = new Map<string, number>();
    for (const c of (contribs.data ?? []) as Array<{
      investor_id: string;
      amount: number | string;
    }>) {
      contribByInv.set(c.investor_id, (contribByInv.get(c.investor_id) ?? 0) + Number(c.amount));
    }

    type Row = {
      id: string;
      name: string;
      isActive: boolean;
      shareRate: number;
      capital: number;
      contributed: number;
      inUse: number;
      idle: number;
      loadPct: number;
      investorEarned: number;
      companyEarnedFromInvestor: number;
    };
    const rows: Row[] = (investors.data ?? []).map((i) => ({
      id: i.id,
      name: i.full_name,
      isActive: !!i.is_active,
      shareRate: Number(i.profit_share_rate),
      capital: Number(i.total_capital),
      contributed: contribByInv.get(i.id) ?? 0,
      inUse: 0,
      idle: 0,
      loadPct: 0,
      investorEarned: 0,
      companyEarnedFromInvestor: 0,
    }));
    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const c of (contracts.data ?? []) as Array<{
      id: string;
      status: string;
      principal: number | string;
      markup_amount: number | string;
      investor_id: string | null;
    }>) {
      if (!c.investor_id) continue;
      const row = byId.get(c.investor_id);
      if (!row) continue;
      const principal = Number(c.principal);
      const markup = Number(c.markup_amount);
      const total = principal + markup;
      const markupShare = total > 0 ? markup / total : 0;
      const paid = paidByContract.get(c.id) ?? 0;
      const receivedMarkup = paid * markupShare;
      const isActive = c.status === "active" || c.status === "overdue" || c.status === "pending";
      if (isActive) row.inUse += principal;
      row.investorEarned += receivedMarkup * row.shareRate;
      row.companyEarnedFromInvestor += receivedMarkup * (1 - row.shareRate);
    }
    for (const r of rows) {
      r.idle = Math.max(0, r.capital - r.inUse);
      r.loadPct = r.capital > 0 ? (r.inUse / r.capital) * 100 : 0;
    }
    rows.sort((a, b) => b.companyEarnedFromInvestor - a.companyEarnedFromInvestor);
    return rows;
  });

// ============ Balance timeline ============

export const getCompanyFundsTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => summaryInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const { from, to } = resolvePeriod(data.period, data.from, data.to);
    const [ops, expenses, payments, contracts] = await Promise.all([
      supabaseAdmin
        .from("company_funds_operations")
        .select("op_type,amount,operation_date")
        .lte("operation_date", to)
        .order("operation_date", { ascending: true }),
      supabaseAdmin
        .from("company_expenses")
        .select("amount,expense_date")
        .lte("expense_date", to)
        .order("expense_date", { ascending: true }),
      supabaseAdmin
        .from("payments")
        .select("amount,paid_at,contract_id")
        .lte("paid_at", to + "T23:59:59")
        .order("paid_at", { ascending: true }),
      supabaseAdmin
        .from("installment_contracts")
        .select("id,principal,markup_amount,investor_id")
        .is("deleted_at", null),
    ]);

    const ctrInfo = new Map<string, { share: number; isInvestor: boolean; rate: number }>();
    const { data: investorsList } = await supabaseAdmin
      .from("investors")
      .select("id,profit_share_rate");
    const invRate = new Map(
      (investorsList ?? []).map((i) => [i.id, Number(i.profit_share_rate)]),
    );
    for (const c of (contracts.data ?? []) as Array<{
      id: string;
      principal: number | string;
      markup_amount: number | string;
      investor_id: string | null;
    }>) {
      const p = Number(c.principal);
      const m = Number(c.markup_amount);
      const t = p + m;
      const share = t > 0 ? m / t : 0;
      const isInv = !!(c.investor_id && invRate.has(c.investor_id));
      const rate = isInv ? invRate.get(c.investor_id!)! : 0;
      ctrInfo.set(c.id, { share, isInvestor: isInv, rate });
    }

    // Collect events
    type Ev = { date: string; delta: number };
    const events: Ev[] = [];
    for (const o of (ops.data ?? []) as Array<{
      op_type: string;
      amount: number | string;
      operation_date: string;
    }>) {
      const v = Number(o.amount);
      const d = o.op_type === "withdraw" ? -v : v;
      events.push({ date: o.operation_date, delta: d });
    }
    for (const e of (expenses.data ?? []) as Array<{
      amount: number | string;
      expense_date: string;
    }>) {
      events.push({ date: e.expense_date, delta: -Number(e.amount) });
    }
    for (const p of (payments.data ?? []) as Array<{
      amount: number | string;
      paid_at: string;
      contract_id: string;
    }>) {
      const info = ctrInfo.get(p.contract_id);
      if (!info) continue;
      const markupPart = Number(p.amount) * info.share;
      const companyPart = info.isInvestor ? markupPart * (1 - info.rate) : markupPart;
      events.push({ date: (p.paid_at ?? "").slice(0, 10), delta: companyPart });
    }
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate per day, then accumulate
    const byDay = new Map<string, number>();
    for (const e of events) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.delta);
    const sorted = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
    const chart: { date: string; balance: number }[] = [];
    let bal = 0;
    for (const [date, delta] of sorted) {
      bal += delta;
      if (date >= from && date <= to) chart.push({ date, balance: Math.round(bal * 100) / 100 });
    }
    return { from, to, chart };
  });