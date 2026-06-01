import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

async function resolveMyInvestor(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const email = profile?.email?.toLowerCase();
  if (!email) return null;
  const { data: investor } = await supabaseAdmin
    .from("investors")
    .select("*")
    .eq("is_active", true)
    .ilike("email", email)
    .maybeSingle();
  return investor ?? null;
}

async function readInvestmentSettings() {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("investments_enabled, investments_min_amount")
    .eq("id", true)
    .maybeSingle();
  return {
    enabled: Boolean(data?.investments_enabled ?? false),
    minAmount: Number(data?.investments_min_amount ?? 0),
  };
}

async function assertStaff(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const ok = (data ?? []).some(
    (r) => r.role === "manager" || r.role === "admin" || r.role === "owner",
  );
  if (!ok) throw new Error("Forbidden: staff role required");
}

/** Lightweight flag used by the layout to decide whether to show the
 *  "Инвестор" sidebar item. */
export const getMyInvestorFlag = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const inv = await resolveMyInvestor(context.userId);
    return { isInvestor: !!inv };
  });

/** State for the "Кабинет инвестора" page: detects whether the current user
 *  is a registered investor, whether investing is open, the min amount and
 *  the user's most recent application (if any). */
export const getInvestorPortalState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [inv, settings, { data: app }, { data: profile }] = await Promise.all([
      resolveMyInvestor(context.userId),
      readInvestmentSettings(),
      supabaseAdmin
        .from("investor_applications")
        .select("id, full_name, email, phone, amount, desired_monthly_rate, term_months, comment, status, admin_note, created_at, reviewed_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);
    return {
      isInvestor: !!inv,
      settings,
      latestApplication: app ?? null,
      profile: profile ?? null,
    };
  });

export const submitInvestorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(2).max(255),
        email: z.string().trim().email().max(255).optional().or(z.literal("")),
        phone: z.string().trim().max(64).optional().or(z.literal("")),
        amount: z.number().positive().max(1_000_000_000),
        desiredMonthlyRate: z.number().min(0).max(100),
        termMonths: z.number().int().min(1).max(120).optional().nullable(),
        comment: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const settings = await readInvestmentSettings();
    if (!settings.enabled) {
      throw new Error("Приём инвестиций сейчас закрыт");
    }
    if (data.amount < settings.minAmount) {
      throw new Error(
        `Минимальная сумма для подачи заявки: ${settings.minAmount}`,
      );
    }
    // Block duplicate pending applications
    const { data: existing } = await supabaseAdmin
      .from("investor_applications")
      .select("id")
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (existing) {
      throw new Error("У вас уже есть заявка на рассмотрении");
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("investor_applications")
      .insert({
        user_id: context.userId,
        full_name: data.fullName,
        email: data.email || null,
        phone: data.phone || null,
        amount: data.amount,
        desired_monthly_rate: data.desiredMonthlyRate,
        term_months: data.termMonths ?? null,
        comment: data.comment || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

// ---------- Admin ----------

export const adminGetInvestmentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    return readInvestmentSettings();
  });

export const adminSetInvestmentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        minAmount: z.number().min(0).max(1_000_000_000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({
        investments_enabled: data.enabled,
        investments_min_amount: data.minAmount,
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListInvestorApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("investor_applications")
      .select("id, user_id, full_name, email, phone, amount, desired_monthly_rate, term_months, comment, status, admin_note, created_at, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { applications: data ?? [] };
  });

export const adminUpdateInvestorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected"]),
        adminNote: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("investor_applications")
      .update({
        status: data.status,
        admin_note: data.adminNote || null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyInvestorDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const inv = await resolveMyInvestor(context.userId);
    if (!inv) throw new Error("Not an investor");

    const investorId = (inv as { id: string }).id;
    const shareRate = Number((inv as { profit_share_rate: number }).profit_share_rate);
    const capital = Number((inv as { total_capital: number }).total_capital);
    const capitalize = Boolean(
      (inv as { capitalize_profit?: boolean }).capitalize_profit,
    );

    const [{ data: contracts }, { data: contributions }] = await Promise.all([
      supabaseAdmin
        .from("installment_contracts")
        .select(
          "id,client_id,product_name,principal,markup_amount,total_sale_price,monthly_payment,term_months,start_date,status,created_at",
        )
        .eq("investor_id", investorId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("investor_contributions")
        .select("*")
        .eq("investor_id", investorId)
        .order("created_at", { ascending: false }),
    ]);

    const cs = (contracts ?? []) as Array<{
      id: string;
      client_id: string;
      product_name: string;
      principal: number | string;
      markup_amount: number | string;
      total_sale_price: number | string;
      monthly_payment: number | string;
      term_months: number;
      start_date: string;
      status: string;
      created_at: string;
    }>;

    const contractIds = cs.map((c) => c.id);
    const [{ data: schedules }, { data: payments }] = await Promise.all([
      contractIds.length
        ? supabaseAdmin
            .from("payment_schedules")
            .select("id,contract_id,seq,due_date,amount,status")
            .in("contract_id", contractIds)
            .order("due_date", { ascending: true })
        : Promise.resolve({ data: [] }),
      contractIds.length
        ? supabaseAdmin
            .from("payments")
            .select("id,contract_id,amount,paid_at,method")
            .in("contract_id", contractIds)
            .order("paid_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    type Sched = {
      id: string;
      contract_id: string;
      seq: number;
      due_date: string;
      amount: number | string;
      status: string;
    };
    type Pay = {
      id: string;
      contract_id: string;
      amount: number | string;
      paid_at: string;
      method: string | null;
    };
    const ss = (schedules ?? []) as Sched[];
    const ps = (payments ?? []) as Pay[];

    const today = new Date().toISOString().slice(0, 10);
    const activeContracts = cs.filter((c) => c.status !== "closed");
    const placed = activeContracts.reduce((s, c) => s + Number(c.principal), 0);
    const totalMarkup = cs.reduce((s, c) => s + Number(c.markup_amount), 0);
    const expectedProfit = totalMarkup * shareRate;

    let receivedProfit = 0;
    let returnedPrincipal = 0;
    const byContract = new Map(cs.map((c) => [c.id, c]));
    const contractMarkupShare = new Map<string, number>();
    for (const c of cs) {
      const total = Number(c.principal) + Number(c.markup_amount);
      contractMarkupShare.set(c.id, total > 0 ? Number(c.markup_amount) / total : 0);
    }
    for (const p of ps) {
      const c = byContract.get(p.contract_id);
      if (!c) continue;
      const markupShare = contractMarkupShare.get(c.id) ?? 0;
      const amt = Number(p.amount);
      receivedProfit += amt * markupShare * shareRate;
      returnedPrincipal += amt * (1 - markupShare);
    }
    const free = capital - placed + returnedPrincipal + (capitalize ? receivedProfit : 0);
    const overdueSched = ss.filter(
      (s) => s.status === "overdue" || (s.status === "pending" && s.due_date < today),
    );
    const overdueAmount = overdueSched.reduce((s, x) => s + Number(x.amount), 0);

    // Профит по графику: будущий и общий
    let principalRemaining = 0;
    let profitRemaining = 0;
    let profitScheduledTotal = 0;
    for (const s of ss) {
      const ms = contractMarkupShare.get(s.contract_id) ?? 0;
      const amt = Number(s.amount);
      const principalPart = amt * (1 - ms);
      const profitPart = amt * ms * shareRate;
      profitScheduledTotal += profitPart;
      if (s.status !== "paid") {
        principalRemaining += principalPart;
        profitRemaining += profitPart;
      }
    }
    const expectedProfitTotal = profitScheduledTotal;
    const totalPayout =
      returnedPrincipal + receivedProfit + principalRemaining + profitRemaining;
    const progressPct =
      expectedProfitTotal > 0
        ? Math.min(100, (receivedProfit / expectedProfitTotal) * 100)
        : 0;

    // Средняя месячная доходность от капитала
    const startISO = (inv as { contract_start_date?: string | null }).contract_start_date
      ?? (cs.length ? cs[cs.length - 1].created_at.slice(0, 10) : null);
    let monthsActive = 1;
    if (startISO) {
      const start = new Date(startISO);
      const now = new Date();
      monthsActive = Math.max(
        1,
        (now.getFullYear() - start.getFullYear()) * 12 +
          (now.getMonth() - start.getMonth()) +
          (now.getDate() >= start.getDate() ? 0 : -1) + 1,
      );
    }
    const avgMonthlyYieldPct =
      capital > 0 ? (receivedProfit / monthsActive / capital) * 100 : 0;

    // Прогнозная средняя месячная доходность по графику (для случаев, когда
    // фактических платежей ещё не было, чтобы не показывать инвестору 0%).
    const scheduleMonthsSet = new Set<string>();
    for (const s of ss) scheduleMonthsSet.add(s.due_date.slice(0, 7));
    const scheduleMonths = Math.max(1, scheduleMonthsSet.size);
    const expectedAvgMonthlyYieldPct =
      capital > 0 ? (expectedProfitTotal / scheduleMonths / capital) * 100 : 0;
    const hasReceivedProfit = receivedProfit > 0;
    const displayedAvgMonthlyYieldPct = hasReceivedProfit
      ? avgMonthlyYieldPct
      : expectedAvgMonthlyYieldPct;
    const yieldIsForecast = !hasReceivedProfit && expectedProfitTotal > 0;

    // Контракты без данных клиента + разбивка прибыли инвестора
    const paidAmtByContract = new Map<string, number>();
    for (const p of ps) {
      paidAmtByContract.set(
        p.contract_id,
        (paidAmtByContract.get(p.contract_id) ?? 0) + Number(p.amount),
      );
    }
    const anonymizedContracts = cs.map((c) => {
      const own = ss.filter((s) => s.contract_id === c.id);
      const paid = own.filter((s) => s.status === "paid").length;
      const ms = contractMarkupShare.get(c.id) ?? 0;
      const principal = Number(c.principal);
      const investorProfitTotal = Number(c.markup_amount) * shareRate;
      const paidAmt = paidAmtByContract.get(c.id) ?? 0;
      const investorReceivedProfit = paidAmt * ms * shareRate;
      const investorReceivedPrincipal = paidAmt * (1 - ms);
      return {
        id: c.id,
        productName: c.product_name,
        principal,
        markupAmount: Number(c.markup_amount),
        totalSalePrice: Number(c.total_sale_price),
        monthlyPayment: Number(c.monthly_payment),
        termMonths: c.term_months,
        startDate: c.start_date,
        status: c.status,
        clientCode: `Клиент #${c.client_id.slice(0, 4)}`,
        paidCount: paid,
        totalCount: own.length || c.term_months,
        investorPrincipal: principal,
        investorProfitTotal,
        investorReceivedProfit,
        investorRemainingProfit: Math.max(0, investorProfitTotal - investorReceivedProfit),
        investorReceivedPrincipal,
        investorRemainingPrincipal: Math.max(0, principal - investorReceivedPrincipal),
        investorPayoutTotal: principal + investorProfitTotal,
      };
    });

    // График ближайших 90 дней + просрочки
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 90);
    const horizonISO = horizon.toISOString().slice(0, 10);
    const upcoming = ss
      .filter((s) => s.status === "pending" || s.status === "overdue")
      .filter((s) => s.due_date <= horizonISO || s.due_date < today)
      .map((s) => {
        const c = byContract.get(s.contract_id)!;
        const ms = contractMarkupShare.get(s.contract_id) ?? 0;
        const amt = Number(s.amount);
        const principalPart = amt * (1 - ms);
        const investorProfit = amt * ms * shareRate;
        return {
          id: s.id,
          dueDate: s.due_date,
          amount: amt,
          status: s.status,
          overdue: s.status === "overdue" || s.due_date < today,
          productName: c?.product_name ?? "—",
          contractId: s.contract_id,
          principalPart,
          investorProfit,
          investorCashflow: principalPart + investorProfit,
        };
      });

    // Прогноз по месяцам — на основании всего графика
    const monthMap = new Map<
      string,
      { investorPrincipal: number; investorProfit: number }
    >();
    for (const s of ss) {
      const month = s.due_date.slice(0, 7);
      const ms = contractMarkupShare.get(s.contract_id) ?? 0;
      const amt = Number(s.amount);
      const row = monthMap.get(month) ?? { investorPrincipal: 0, investorProfit: 0 };
      row.investorPrincipal += amt * (1 - ms);
      row.investorProfit += amt * ms * shareRate;
      monthMap.set(month, row);
    }
    let cumulative = 0;
    const monthlyProjection = [...monthMap.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, v]) => {
        const total = v.investorPrincipal + v.investorProfit;
        cumulative += total;
        return {
          month,
          investorPrincipal: v.investorPrincipal,
          investorProfit: v.investorProfit,
          investorTotal: total,
          cumulativeTotal: cumulative,
        };
      });

    // Лента событий
    type Feed = {
      id: string;
      at: string;
      kind: "contract" | "payment" | "contribution";
      title: string;
      amount?: number;
      investorProfit?: number;
      investorPrincipal?: number;
    };
    const feed: Feed[] = [];
    for (const c of cs) {
      feed.push({
        id: `c-${c.id}`,
        at: c.created_at,
        kind: "contract",
        title: `Новая рассрочка «${c.product_name}»`,
        amount: Number(c.principal),
      });
    }
    for (const p of ps) {
      const c = byContract.get(p.contract_id);
      if (!c) continue;
      const ms = contractMarkupShare.get(c.id) ?? 0;
      const amt = Number(p.amount);
      feed.push({
        id: `p-${p.id}`,
        at: p.paid_at,
        kind: "payment",
        title: `Платёж по «${c.product_name}»`,
        amount: amt,
        investorProfit: amt * ms * shareRate,
        investorPrincipal: amt * (1 - ms),
      });
    }
    for (const co of contributions ?? []) {
      const row = co as {
        id: string;
        created_at: string;
        amount: number;
        note?: string | null;
      };
      feed.push({
        id: `i-${row.id}`,
        at: row.created_at,
        kind: "contribution",
        title:
          Number(row.amount) >= 0
            ? `Взнос капитала${row.note ? `: ${row.note}` : ""}`
            : `Вывод средств${row.note ? `: ${row.note}` : ""}`,
        amount: Number(row.amount),
      });
    }
    feed.sort((a, b) => (a.at < b.at ? 1 : -1));

    return {
      investor: {
        fullName: (inv as { full_name: string }).full_name,
        profitShareRate: shareRate,
        capitalizeProfit: capitalize,
        capital,
      },
      summary: {
        capital,
        placed,
        free,
        expectedProfit,
        receivedProfit,
        avgMonthlyYieldPct,
        expectedAvgMonthlyYieldPct,
        displayedAvgMonthlyYieldPct,
        yieldIsForecast,
        overdueCount: overdueSched.length,
        overdueAmount,
        activeCount: activeContracts.length,
        expectedProfitTotal,
        principalReturnedToDate: returnedPrincipal,
        principalRemaining,
        profitRemaining,
        totalPayout,
        progressPct,
      },
      contracts: anonymizedContracts,
      upcoming,
      monthlyProjection,
      contributions: (contributions ?? []) as Array<{
        id: string;
        amount: number | string;
        operation_date: string;
        due_date: string | null;
        term_months: number | null;
        note: string | null;
        created_at: string;
      }>,
      feed: feed.slice(0, 50),
    };
  });