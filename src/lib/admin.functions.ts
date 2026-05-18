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
