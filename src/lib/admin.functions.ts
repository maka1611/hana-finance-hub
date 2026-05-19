import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
      supabaseAdmin.from("installment_contracts").select("status,total_sale_price,principal,markup_amount"),
      supabaseAdmin.from("payment_schedules").select("status,amount,due_date"),
      supabaseAdmin.from("payments").select("amount,paid_at"),
      supabaseAdmin.from("profiles").select("id"),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekStr = weekEnd.toISOString().slice(0, 10);
    const cs = contracts.data ?? [];
    const ss = schedules.data ?? [];
    return {
      contractsTotal: cs.length,
      contractsActive: cs.filter((c) => c.status === "active").length,
      contractsOverdue: cs.filter((c) => c.status === "overdue").length,
      contractsClosed: cs.filter((c) => c.status === "closed").length,
      portfolio: cs.reduce((s, c) => s + Number(c.principal) + Number(c.markup_amount), 0),
      totalSold: cs.reduce((s, c) => s + Number(c.total_sale_price), 0),
      totalMarkup: cs.reduce((s, c) => s + Number(c.markup_amount), 0),
      paymentsCollected: (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0),
      clientsCount: (clients.data ?? []).length,
      duesToday: ss.filter((s) => s.status === "pending" && s.due_date === today).reduce((s, x) => s + Number(x.amount), 0),
      duesWeek: ss.filter((s) => s.status === "pending" && s.due_date >= today && s.due_date <= weekStr).reduce((s, x) => s + Number(x.amount), 0),
      overdueAmount: ss.filter((s) => s.status === "overdue" || (s.status === "pending" && s.due_date < today)).reduce((s, x) => s + Number(x.amount), 0),
    };
  });

export const adminListClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: contracts } = await supabaseAdmin
      .from("installment_contracts")
      .select("client_id,status,principal,markup_amount");
    const byClient: Record<string, { count: number; debt: number; active: number }> = {};
    for (const c of contracts ?? []) {
      const k = c.client_id;
      byClient[k] ??= { count: 0, debt: 0, active: 0 };
      byClient[k].count++;
      if (c.status === "active") byClient[k].active++;
      byClient[k].debt += Number(c.principal) + Number(c.markup_amount);
    }
    return (profiles ?? []).map((p) => ({
      ...p,
      contracts_count: byClient[p.id]?.count ?? 0,
      active_count: byClient[p.id]?.active ?? 0,
      total_debt: byClient[p.id]?.debt ?? 0,
    }));
  });

export const adminListContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ status: z.enum(["all", "active", "overdue", "closed", "pending"]).default("all") }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    let q = supabaseAdmin
      .from("installment_contracts")
      .select("*, profiles!installment_contracts_client_id_fkey(full_name,email)")
      .order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) {
      // fallback without join if FK isn't named as expected
      const { data: rows2, error: e2 } = await (data.status === "all"
        ? supabaseAdmin.from("installment_contracts").select("*").order("created_at", { ascending: false })
        : supabaseAdmin.from("installment_contracts").select("*").eq("status", data.status).order("created_at", { ascending: false }));
      if (e2) throw new Error(e2.message);
      const ids = [...new Set((rows2 ?? []).map((r) => r.client_id))];
      const { data: profs } = await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return (rows2 ?? []).map((r) => ({ ...r, profile: map.get(r.client_id) ?? null }));
    }
    return (rows ?? []).map((r) => ({ ...r, profile: (r as { profiles?: unknown }).profiles ?? null }));
  });

export const adminGetContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const [c, s, p] = await Promise.all([
      supabaseAdmin.from("installment_contracts").select("*").eq("id", data.id).single(),
      supabaseAdmin.from("payment_schedules").select("*").eq("contract_id", data.id).order("seq"),
      supabaseAdmin.from("payments").select("*").eq("contract_id", data.id).order("paid_at", { ascending: false }),
    ]);
    if (c.error) throw new Error(c.error.message);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", c.data.client_id)
      .single();
    return { contract: c.data, schedule: s.data ?? [], payments: p.data ?? [], profile: prof };
  });

export const adminRecordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      scheduleId: z.string().uuid(),
      amount: z.number().positive(),
      method: z.string().min(1).max(50).default("cash"),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: sched, error: sErr } = await supabaseAdmin
      .from("payment_schedules")
      .select("*")
      .eq("id", data.scheduleId)
      .single();
    if (sErr) throw new Error(sErr.message);
    const { error: pErr } = await supabaseAdmin.from("payments").insert({
      contract_id: sched.contract_id,
      schedule_id: sched.id,
      amount: data.amount,
      method: data.method,
    });
    if (pErr) throw new Error(pErr.message);
    await supabaseAdmin
      .from("payment_schedules")
      .update({ status: "paid" })
      .eq("id", data.scheduleId);
    // check if all paid -> close contract
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
    return { ok: true };
  });

export const adminUpdateContractStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "active", "closed", "overdue"]),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("installment_contracts")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
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

// === Управление пользователями и ролями ===

const ROLE_VALUES = ["client", "manager", "admin", "owner"] as const;
type RoleValue = (typeof ROLE_VALUES)[number];

async function assertAdmin(userId: string): Promise<RoleValue[]> {
  const roles = await assertStaff(userId);
  const isAdmin = roles.some((r) => r === "admin" || r === "owner");
  if (!isAdmin) throw new Error("Forbidden: admin or owner required");
  return roles as RoleValue[];
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
    const { data: rolesRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id,role");
    const map: Record<string, RoleValue[]> = {};
    for (const r of rolesRows ?? []) {
      (map[r.user_id] ??= []).push(r.role as RoleValue);
    }
    return (profiles ?? []).map((p) => ({ ...p, roles: map[p.id] ?? [] }));
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(ROLE_VALUES),
      grant: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const myRoles = await assertAdmin(context.userId);
    const iAmOwner = myRoles.includes("owner");

    // Только owner может назначать/снимать admin и owner
    if ((data.role === "admin" || data.role === "owner") && !iAmOwner) {
      throw new Error("Только владелец может назначать роли admin/owner");
    }

    // Нельзя снимать с себя owner (защита от случайного блока)
    if (
      data.role === "owner" &&
      !data.grant &&
      data.userId === context.userId
    ) {
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
    return { ok: true };
  });

// === Платежи ===

export const adminListPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      status: z.enum(["all", "pending", "paid", "overdue"]).default("all"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      search: z.string().max(200).optional(),
    }).parse(input ?? {}),
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
      .in("id", contractIds.length ? contractIds : ["00000000-0000-0000-0000-000000000000"]);

    const clientIds = [...new Set((contracts ?? []).map((c) => c.client_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email,phone")
      .in("id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]);

    const contractMap = new Map((contracts ?? []).map((c) => [c.id, c]));
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const enriched = (schedules ?? []).map((s) => {
      const c = contractMap.get(s.contract_id);
      const p = c ? profileMap.get(c.client_id) : null;
      return {
        ...s,
        product_name: c?.product_name ?? "—",
        client_full_name: c?.client_full_name ?? p?.full_name ?? "—",
        client_email: p?.email ?? null,
        client_phone: p?.phone ?? null,
      };
    });

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
      overdueAmount: allSched.filter((s) => s.status === "overdue").reduce((a, s) => a + Number(s.amount), 0),
      overdueCount: allSched.filter((s) => s.status === "overdue").length,
      paidThisMonth: allSched
        .filter((s) => s.status === "paid" && s.due_date >= monthStart && s.due_date <= monthEnd)
        .reduce((a, s) => a + Number(s.amount), 0),
    };

    const aging = { d0_7: 0, d8_30: 0, d31_60: 0, d60p: 0 };
    for (const s of allSched) {
      if (s.status !== "overdue") continue;
      const diff = Math.floor((new Date(today).getTime() - new Date(s.due_date).getTime()) / (1000 * 60 * 60 * 24));
      if (diff <= 7) aging.d0_7 += Number(s.amount);
      else if (diff <= 30) aging.d8_30 += Number(s.amount);
      else if (diff <= 60) aging.d31_60 += Number(s.amount);
      else aging.d60p += Number(s.amount);
    }

    return { items: filtered, kpi, aging };
  });

export const adminMarkSchedulePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ scheduleId: z.string().uuid() }).parse(input),
  )
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
    await supabaseAdmin
      .from("payment_schedules")
      .update({ status: "paid" })
      .eq("id", sched.id);
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
    return { ok: true };
  });

// === Демо-данные ===

const DEMO_NAMES = [
  "Алиев Руслан", "Бекова Айгуль", "Сулейманов Тимур", "Закирова Динара",
  "Махмудов Рамиль", "Юсупова Лейла", "Кадыров Алишер", "Нурлыбекова Сабина",
  "Османов Карим", "Гаджиева Зарема",
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

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

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
    const contracts: Array<Record<string, unknown>> = [];
    const schedules: Array<Record<string, unknown>> = [];

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
        client_telegram: Math.random() > 0.5 ? "@" + profile.full_name.split(" ")[0].toLowerCase() : null,
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
        status === "closed" ? term :
        status === "overdue" ? Math.max(0, monthsAgo - 2) :
        Math.min(monthsAgo, term);

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
