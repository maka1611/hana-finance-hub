import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { calcInstallment, buildSchedule, DEFAULT_MARKUP_RATE, MAX_TERM } from "@/lib/installment";

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

const ChannelEnum = z.enum(["phone", "whatsapp", "telegram"]);
const ExtraPhoneSchema = z.object({
  phone: z.string().trim().min(3).max(50).regex(/^[+\d\s()\-]+$/, "Неверный формат телефона"),
  label: z.string().trim().max(50).optional().nullable(),
  channels: z.array(ChannelEnum).max(3).optional().default([]),
});

const ApplicationSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  productDescription: z.string().trim().max(2000).optional().nullable(),
  productPrice: z.number().positive().max(1_000_000_000),
  downPayment: z.number().min(0).max(1_000_000_000),
  termMonths: z.number().int().min(1).max(MAX_TERM),
  firstPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  clientFullName: z.string().trim().max(200).optional().nullable(),
  clientTelegram: z.string().trim().max(100).optional().nullable(),
  clientPhone: z
    .string()
    .trim()
    .min(5, "Укажите телефон")
    .max(50)
    .regex(/^[+\d\s()\-]+$/, "Неверный формат телефона"),
  clientComment: z.string().trim().max(2000).optional().nullable(),
  extraPhones: z.array(ExtraPhoneSchema).max(10).optional(),
});

export const submitApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApplicationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // обновим профиль (имя/телефон) мягко
    if (data.clientFullName || data.clientPhone) {
      const patch: { full_name?: string; phone?: string } = {};
      if (data.clientFullName) patch.full_name = data.clientFullName;
      if (data.clientPhone) patch.phone = data.clientPhone;
      await supabase.from("profiles").update(patch).eq("id", userId);
    }
    // Дополнительные телефоны сохраняем в user_phones (без дубликата основного)
    if (data.extraPhones && data.extraPhones.length > 0) {
      const { data: existing } = await supabase
        .from("user_phones")
        .select("phone")
        .eq("user_id", userId);
      const existingSet = new Set((existing ?? []).map((p) => p.phone));
      existingSet.add(data.clientPhone);
      const rows = data.extraPhones
        .filter((p) => !existingSet.has(p.phone))
        .map((p) => ({
          user_id: userId,
          phone: p.phone,
          label: p.label ?? null,
          channels: p.channels ?? [],
        }));
      if (rows.length > 0) {
        await supabase.from("user_phones").insert(rows);
      }
    }
    const { data: row, error } = await supabase
      .from("installment_applications")
      .insert({
        client_id: userId,
        product_name: data.productName,
        product_description: data.productDescription ?? null,
        product_price: data.productPrice,
        down_payment: data.downPayment,
        term_months: data.termMonths,
        first_payment_date: data.firstPaymentDate ?? null,
        client_full_name: data.clientFullName ?? null,
        client_telegram: data.clientTelegram ?? null,
        client_phone: data.clientPhone ?? null,
        client_comment: data.clientComment ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listMyApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("installment_applications")
      .select("*")
      .eq("client_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyProfileFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profileR, phonesR, contractsR, schedulesR, paymentsR, appsR] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_phones").select("*").eq("user_id", userId).order("created_at"),
      supabase.from("installment_contracts").select("*").eq("client_id", userId).order("created_at", { ascending: false }),
      supabase
        .from("payment_schedules")
        .select("id,contract_id,status,amount,due_date,seq,installment_contracts!inner(client_id)")
        .eq("installment_contracts.client_id", userId),
      supabase
        .from("payments")
        .select("amount,paid_at,installment_contracts!inner(client_id)")
        .eq("installment_contracts.client_id", userId),
      supabase.from("installment_applications").select("*").eq("client_id", userId).order("created_at", { ascending: false }),
    ]);

    const schedules = (schedulesR.data ?? []) as Array<{ status: string; amount: number; due_date: string }>;
    const today = new Date().toISOString().slice(0, 10);
    let paid = 0, overdue = 0, pending = 0;
    let paidAmount = 0, overdueAmount = 0;
    for (const s of schedules) {
      if (s.status === "paid") { paid++; paidAmount += Number(s.amount); }
      else if (s.status === "overdue" || (s.status === "pending" && s.due_date < today)) {
        overdue++; overdueAmount += Number(s.amount);
      } else { pending++; }
    }
    const ratingBase = paid + overdue;
    // 100 если ничего не просрочено, иначе доля оплаченных от (оплаченных+просроченных)
    const ratingScore = ratingBase === 0 ? 100 : Math.round((paid / ratingBase) * 100);
    const stars = Math.max(1, Math.round(ratingScore / 20));
    let tier: "new" | "bronze" | "silver" | "gold" | "platinum" = "new";
    if (paid === 0 && overdue === 0) tier = "new";
    else if (ratingScore >= 95) tier = "platinum";
    else if (ratingScore >= 80) tier = "gold";
    else if (ratingScore >= 60) tier = "silver";
    else tier = "bronze";

    return {
      profile: profileR.data,
      phones: phonesR.data ?? [],
      contracts: contractsR.data ?? [],
      applications: appsR.data ?? [],
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
      },
    };
  });

export const addMyPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone: z.string().trim().min(3).max(50).regex(/^[+\d\s()\-]+$/, "Неверный формат"),
      label: z.string().trim().max(50).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_phones")
      .insert({ user_id: userId, phone: data.phone, label: data.label ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_phones")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      fullName: z.string().trim().max(200).optional().nullable(),
      phone: z.string().trim().max(50).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { full_name?: string | null; phone?: string | null } = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName || null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ ADMIN ============

async function assertStaff(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r) => r.role === "manager" || r.role === "admin" || r.role === "owner");
  if (!ok) throw new Error("Forbidden: staff role required");
}

export const adminListApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ status: z.enum(["all", "pending", "approved", "rejected"]).default("pending") }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    let q = supabaseAdmin.from("installment_applications").select("*").order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: apps, error } = await q;
    if (error) throw new Error(error.message);
    const clientIds = [...new Set((apps ?? []).map((a) => a.client_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email,phone")
      .in("id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (apps ?? []).map((a) => ({ ...a, profile: map.get(a.client_id) ?? null }));
  });

export const adminGetApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: app, error } = await supabaseAdmin
      .from("installment_applications")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", app.client_id)
      .maybeSingle();
    const { data: phones } = await supabaseAdmin
      .from("user_phones")
      .select("*")
      .eq("user_id", app.client_id);
    return { application: app, profile, phones: phones ?? [] };
  });

const AdminUpdateAppSchema = z.object({
  id: z.string().uuid(),
  productName: z.string().trim().min(1).max(200).optional(),
  productDescription: z.string().trim().max(2000).optional().nullable(),
  productPrice: z.number().positive().max(1_000_000_000).optional(),
  downPayment: z.number().min(0).max(1_000_000_000).optional(),
  termMonths: z.number().int().min(1).max(MAX_TERM).optional(),
  firstPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  clientFullName: z.string().trim().max(200).optional().nullable(),
  clientTelegram: z.string().trim().max(100).optional().nullable(),
  clientPhone: z.string().trim().max(50).optional().nullable(),
  clientComment: z.string().trim().max(2000).optional().nullable(),
  adminNote: z.string().trim().max(2000).optional().nullable(),
});

export const adminUpdateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AdminUpdateAppSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: prevApp } = await supabaseAdmin
      .from("installment_applications")
      .select("product_name")
      .eq("id", data.id)
      .maybeSingle();
    const patch: {
      product_name?: string;
      product_description?: string | null;
      product_price?: number;
      down_payment?: number;
      term_months?: number;
      first_payment_date?: string | null;
      client_full_name?: string | null;
      client_telegram?: string | null;
      client_phone?: string | null;
      client_comment?: string | null;
      admin_note?: string | null;
    } = {};
    if (data.productName !== undefined) patch.product_name = data.productName;
    if (data.productDescription !== undefined) patch.product_description = data.productDescription;
    if (data.productPrice !== undefined) patch.product_price = data.productPrice;
    if (data.downPayment !== undefined) patch.down_payment = data.downPayment;
    if (data.termMonths !== undefined) patch.term_months = data.termMonths;
    if (data.firstPaymentDate !== undefined) patch.first_payment_date = data.firstPaymentDate;
    if (data.clientFullName !== undefined) patch.client_full_name = data.clientFullName;
    if (data.clientTelegram !== undefined) patch.client_telegram = data.clientTelegram;
    if (data.clientPhone !== undefined) patch.client_phone = data.clientPhone;
    if (data.clientComment !== undefined) patch.client_comment = data.clientComment;
    if (data.adminNote !== undefined) patch.admin_note = data.adminNote;
    const { error } = await supabaseAdmin
      .from("installment_applications")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction({
      actorId: context.userId,
      action: "application.update",
      entityType: "application",
      entityId: data.id,
      summary: `Изменена заявка «${prevApp?.product_name ?? "—"}»`,
      details: { patch },
    });
    return { ok: true };
  });

export const adminRejectApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().trim().max(2000).optional() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: prevApp } = await supabaseAdmin
      .from("installment_applications")
      .select("product_name,client_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("installment_applications")
      .update({
        status: "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        admin_note: data.note ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction({
      actorId: context.userId,
      action: "application.reject",
      entityType: "application",
      entityId: data.id,
      summary: `Отклонена заявка «${prevApp?.product_name ?? "—"}»`,
      details: { note: data.note ?? null, clientId: prevApp?.client_id ?? null },
    });
    return { ok: true };
  });

export const adminApproveApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: app, error: appErr } = await supabaseAdmin
      .from("installment_applications")
      .select("*")
      .eq("id", data.id)
      .single();
    if (appErr) throw new Error(appErr.message);
    if (app.status !== "pending") throw new Error("Заявка уже обработана");

    const calc = calcInstallment({
      productPrice: Number(app.product_price),
      downPayment: Number(app.down_payment),
      termMonths: app.term_months,
    });
    const startDate = app.first_payment_date
      ? new Date(app.first_payment_date + "T00:00:00")
      : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();

    const { data: contract, error: cErr } = await supabaseAdmin
      .from("installment_contracts")
      .insert({
        client_id: app.client_id,
        product_name: app.product_name,
        product_description: app.product_description,
        product_image_url: app.product_image_url,
        client_full_name: app.client_full_name,
        client_telegram: app.client_telegram,
        client_comment: app.client_comment,
        product_price: app.product_price,
        down_payment: app.down_payment,
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
    if (cErr) throw new Error(cErr.message);

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

    await supabaseAdmin
      .from("installment_applications")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        contract_id: contract.id,
      })
      .eq("id", data.id);

    await logAction({
      actorId: context.userId,
      action: "application.approve",
      entityType: "application",
      entityId: data.id,
      summary: `Одобрена заявка «${app.product_name}» — создан контракт`,
      details: {
        contractId: contract.id,
        clientId: app.client_id,
        totalSalePrice: calc.totalSalePrice,
      },
    });

    return { contractId: contract.id };
  });