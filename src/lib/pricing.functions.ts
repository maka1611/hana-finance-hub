import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_MARKUP_RATE } from "@/lib/installment";

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

async function getActorInfo(userId: string) {
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
  summary?: string | null;
  entityType?: string | null;
  entityId?: string | null;
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

async function readDefaultRate(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("default_markup_rate")
    .eq("id", true)
    .maybeSingle();
  const v = data?.default_markup_rate;
  return v == null ? DEFAULT_MARKUP_RATE : Number(v);
}

export const getDefaultMarkupRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { rate: await readDefaultRate() };
  });

export const getEffectiveMarkupRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: prof }, defRate] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("markup_rate")
        .eq("id", context.userId)
        .maybeSingle(),
      readDefaultRate(),
    ]);
    const personal = prof?.markup_rate;
    const rate = personal == null ? defRate : Number(personal);
    return { rate, defaultRate: defRate, personal: personal == null ? null : Number(personal) };
  });

export const getEffectiveMarkupRateForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const [{ data: prof }, defRate] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("markup_rate")
        .eq("id", data.userId)
        .maybeSingle(),
      readDefaultRate(),
    ]);
    const personal = prof?.markup_rate;
    return {
      rate: personal == null ? defRate : Number(personal),
      defaultRate: defRate,
      personal: personal == null ? null : Number(personal),
    };
  });

export const adminSetDefaultMarkupRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rate: z.number().min(0).max(1) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const prev = await readDefaultRate();
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({ default_markup_rate: data.rate })
      .eq("id", true);
    if (error) throw new Error(error.message);
    await logAction({
      actorId: context.userId,
      action: "pricing.default_set",
      summary: `Ставка по умолчанию: ${(prev * 100).toFixed(2)}% → ${(data.rate * 100).toFixed(2)}%`,
      details: { prev, next: data.rate },
    });
    return { ok: true };
  });

export const adminSetUserMarkupRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        rate: z.number().min(0).max(1).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("markup_rate,full_name,email")
      .eq("id", data.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ markup_rate: data.rate })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    const prevRate = prev?.markup_rate == null ? null : Number(prev.markup_rate);
    await logAction({
      actorId: context.userId,
      action: "pricing.user_set",
      entityType: "user",
      entityId: data.userId,
      summary: `Ставка ${prev?.full_name ?? prev?.email ?? data.userId}: ${
        prevRate == null ? "по умолчанию" : `${(prevRate * 100).toFixed(2)}%`
      } → ${data.rate == null ? "по умолчанию" : `${(data.rate * 100).toFixed(2)}%`}`,
      details: { prev: prevRate, next: data.rate },
    });
    return { ok: true };
  });

export const adminBulkAdjustMarkupRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        deltaPercentPoints: z.number().min(-50).max(50),
        scope: z.enum(["all", "custom_only", "default_only"]).default("all"),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const delta = data.deltaPercentPoints / 100;
    let defaultUpdated = false;
    let prevDefault = 0;
    let nextDefault = 0;
    if (data.scope === "all" || data.scope === "default_only") {
      prevDefault = await readDefaultRate();
      nextDefault = Math.min(1, Math.max(0, prevDefault + delta));
      const { error } = await supabaseAdmin
        .from("app_settings")
        .update({ default_markup_rate: nextDefault })
        .eq("id", true);
      if (error) throw new Error(error.message);
      defaultUpdated = true;
    }

    let usersAffected = 0;
    if (data.scope === "all" || data.scope === "custom_only") {
      const { data: rows, error: selErr } = await supabaseAdmin
        .from("profiles")
        .select("id,markup_rate")
        .not("markup_rate", "is", null);
      if (selErr) throw new Error(selErr.message);
      for (const r of rows ?? []) {
        const cur = Number(r.markup_rate);
        const nx = Math.min(1, Math.max(0, cur + delta));
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ markup_rate: nx })
          .eq("id", r.id);
        if (error) throw new Error(error.message);
      }
      usersAffected = (rows ?? []).length;
    }

    await logAction({
      actorId: context.userId,
      action: "pricing.bulk_adjust",
      summary: `Массовое изменение: ${data.deltaPercentPoints > 0 ? "+" : ""}${data.deltaPercentPoints}пп (${data.scope})`,
      details: {
        delta,
        scope: data.scope,
        defaultUpdated,
        prevDefault,
        nextDefault,
        usersAffected,
      },
    });
    return { defaultUpdated, prevDefault, nextDefault, usersAffected };
  });

export const adminListUserRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ search: z.string().trim().max(200).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const defRate = await readDefaultRate();
    let q = supabaseAdmin
      .from("profiles")
      .select("id,full_name,email,phone,markup_rate")
      .order("full_name", { ascending: true, nullsFirst: false });
    if (data.search && data.search.length > 0) {
      const s = data.search.replace(/[%,()]/g, "");
      q = q.or(
        `full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      defaultRate: defRate,
      users: (rows ?? []).map((r) => ({
        id: r.id,
        fullName: r.full_name as string | null,
        email: r.email as string | null,
        phone: r.phone as string | null,
        personalRate: r.markup_rate == null ? null : Number(r.markup_rate),
        effectiveRate: r.markup_rate == null ? defRate : Number(r.markup_rate),
      })),
    };
  });