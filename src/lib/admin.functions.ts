import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_MARKUP_RATE, calcInstallment, buildSchedule, MAX_TERM } from "@/lib/installment";

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

async function getActorInfo(userId: string): Promise<{ email: string | null; name: string | null }> {
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
    // Платежи и графики для расчёта рейтинга и оплаченной суммы
    const [{ data: payments }, { data: schedules }] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("amount,installment_contracts!inner(client_id)") as unknown as Promise<{
          data: Array<{ amount: number; installment_contracts: { client_id: string } | null }> | null;
        }>,
      supabaseAdmin
        .from("payment_schedules")
        .select("status,amount,due_date,installment_contracts!inner(client_id)") as unknown as Promise<{
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
    return (profiles ?? []).map((p) => {
      const r = ratingByClient[p.id];
      const base = (r?.paid ?? 0) + (r?.overdue ?? 0);
      const ratingScore = !r || base === 0 ? null : Math.round((r.paid / base) * 100);
      const stars = ratingScore === null ? 0 : Math.max(1, Math.round(ratingScore / 20));
      return {
        ...p,
        contracts_count: byClient[p.id]?.count ?? 0,
        active_count: byClient[p.id]?.active ?? 0,
        total_debt: byClient[p.id]?.debt ?? 0,
        paid_amount: paidByClient[p.id] ?? 0,
        overdue_count: r?.overdue ?? 0,
        rating_score: ratingScore,
        rating_stars: stars,
      };
    });
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
          .select("id,contract_id,status,amount,due_date,seq,installment_contracts!inner(client_id)")
          .eq("installment_contracts.client_id", data.id),
        supabaseAdmin
          .from("payments")
          .select("id,amount,paid_at,method,contract_id,installment_contracts!inner(client_id)")
          .eq("installment_contracts.client_id", data.id)
          .order("paid_at", { ascending: false }),
      ]);

    if (!profileR.data) throw new Error("Клиент не найден");

    const schedules = (schedulesR.data ?? []) as Array<{
      status: string; amount: number; due_date: string;
    }>;
    const today = new Date().toISOString().slice(0, 10);
    let paid = 0, overdue = 0, pending = 0;
    let paidAmount = 0, overdueAmount = 0, pendingAmount = 0;
    for (const s of schedules) {
      const amt = Number(s.amount);
      if (s.status === "paid") { paid++; paidAmount += amt; }
      else if (s.status === "overdue" || (s.status === "pending" && s.due_date < today)) {
        overdue++; overdueAmount += amt;
      } else { pending++; pendingAmount += amt; }
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
      profile: profileR.data,
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
    z.object({
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
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const patch: Record<string, string | null> = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName || null;
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.passportSeries !== undefined) patch.passport_series = data.passportSeries || null;
    if (data.passportNumber !== undefined) patch.passport_number = data.passportNumber || null;
    if (data.passportIssuedBy !== undefined) patch.passport_issued_by = data.passportIssuedBy || null;
    if (data.passportIssuedAt !== undefined) patch.passport_issued_at = data.passportIssuedAt || null;
    if (data.driverLicenseNumber !== undefined) patch.driver_license_number = data.driverLicenseNumber || null;
    if (data.driverLicenseCategories !== undefined) patch.driver_license_categories = data.driverLicenseCategories || null;
    if (data.driverLicenseIssuedAt !== undefined) patch.driver_license_issued_at = data.driverLicenseIssuedAt || null;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUploadClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      kind: z.enum(["passport", "driver_license"]),
      fileName: z.string().trim().min(1).max(200),
      contentType: z.string().trim().min(1).max(100),
      dataBase64: z.string().min(1).max(15_000_000),
    }).parse(input),
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
        signed_url: signed.signedUrl,
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
      .select("id,kind,file_path,signed_url,content_type,created_at")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
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
    const { error: dErr } = await supabaseAdmin
      .from("client_documents")
      .delete()
      .eq("id", data.id);
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
        .select("signed_url")
        .eq("user_id", doc.user_id)
        .eq("kind", doc.kind)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (first) {
        const col = doc.kind === "passport" ? "passport_photo_url" : "driver_license_photo_url";
        await supabaseAdmin
          .from("profiles")
          .update({ [col]: first.signed_url } as never)
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
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: contract, error: gErr } = await supabaseAdmin
      .from("installment_contracts")
      .select("id,client_id,product_name,total_sale_price")
      .eq("id", data.id)
      .single();
    if (gErr) throw new Error(gErr.message);
    await supabaseAdmin.from("payments").delete().eq("contract_id", data.id);
    await supabaseAdmin.from("payment_schedules").delete().eq("contract_id", data.id);
    await supabaseAdmin
      .from("installment_applications")
      .update({ contract_id: null } as never)
      .eq("contract_id", data.id);
    const { error: dErr } = await supabaseAdmin
      .from("installment_contracts")
      .delete()
      .eq("id", data.id);
    if (dErr) throw new Error(dErr.message);
    await logAction({
      actorId: context.userId,
      action: "contract.delete",
      entityType: "contract",
      entityId: data.id,
      summary: `Удалён контракт «${contract.product_name}»`,
      details: {
        clientId: contract.client_id,
        totalSalePrice: contract.total_sale_price,
      },
    });
    return { ok: true };
  });

// === Журнал действий ===

export const adminListAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      limit: z.number().int().min(1).max(500).default(200),
      actorId: z.string().uuid().optional(),
      action: z.string().max(80).optional(),
      search: z.string().max(200).optional(),
    }).parse(input ?? {}),
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
      : rows ?? [];
    return filtered;
  });

export const adminAddClientPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      phone: z.string().trim().min(3).max(50).regex(/^[+\d\s()\-]+$/, "Неверный формат"),
      label: z.string().trim().max(50).optional().nullable(),
      channels: z.array(z.enum(["phone", "whatsapp", "telegram"])).optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("user_phones")
      .insert({
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
    z.object({
      id: z.string().uuid(),
      phone: z.string().trim().min(3).max(50).regex(/^[+\d\s()\-]+$/).optional(),
      label: z.string().trim().max(50).optional().nullable(),
      channels: z.array(z.enum(["phone", "whatsapp", "telegram"])).optional(),
    }).parse(input),
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

// === Удаление клиента ===

export const adminDeleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.id === context.userId) throw new Error("Нельзя удалить самого себя");

    // Получим контракты клиента, чтобы каскадно вычистить графики и платежи
    const { data: contracts } = await supabaseAdmin
      .from("installment_contracts")
      .select("id")
      .eq("client_id", data.id);
    const contractIds = (contracts ?? []).map((c) => c.id);
    if (contractIds.length > 0) {
      await supabaseAdmin.from("payments").delete().in("contract_id", contractIds);
      await supabaseAdmin.from("payment_schedules").delete().in("contract_id", contractIds);
      await supabaseAdmin.from("installment_contracts").delete().in("id", contractIds);
    }
    await supabaseAdmin.from("installment_applications").delete().eq("client_id", data.id);
    await supabaseAdmin.from("user_phones").delete().eq("user_id", data.id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.id);
    // Удалим самого пользователя из auth
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (authErr && !authErr.message.toLowerCase().includes("not found")) {
      throw new Error(authErr.message);
    }
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
      phone: z.string().trim().min(5).max(50).regex(/^[+\d\s()\-]+$/),
    }),
  ]),
  productName: z.string().trim().min(1).max(200),
  productDescription: z.string().trim().max(2000).optional().nullable(),
  productPrice: z.number().positive().max(1_000_000_000),
  downPayment: z.number().min(0).max(1_000_000_000),
  termMonths: z.number().int().min(1).max(MAX_TERM),
  firstPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  clientComment: z.string().trim().max(2000).optional().nullable(),
  markupRate: z.number().min(0).max(1).optional(),
  extraPhones: z
    .array(
      z.object({
        phone: z.string().trim().min(3).max(50).regex(/^[+\d\s()\-]+$/),
        label: z.string().trim().max(50).optional().nullable(),
        channels: z.array(z.enum(["phone", "whatsapp", "telegram"])).optional(),
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
      passportPhoto: z
        .object({
          fileName: z.string().trim().min(1).max(200),
          contentType: z.string().trim().min(1).max(100),
          dataBase64: z.string().min(1).max(15_000_000),
        })
        .optional()
        .nullable(),
      driverLicensePhoto: z
        .object({
          fileName: z.string().trim().min(1).max(200),
          contentType: z.string().trim().min(1).max(100),
          dataBase64: z.string().min(1).max(15_000_000),
        })
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
      // создаём пользователя через auth.admin — триггер handle_new_user создаст profile+role
      tempPassword =
        Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase() + "!";
      const { data: created, error: cuErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.client.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: data.client.fullName, phone: data.client.phone },
      });
      if (cuErr || !created.user) {
        throw new Error(cuErr?.message ?? "Не удалось создать пользователя");
      }
      clientId = created.user.id;
      clientFullName = data.client.fullName;
      // На всякий случай — гарантируем профиль (если триггер не отработал)
      await supabaseAdmin
        .from("profiles")
        .upsert({
          id: clientId,
          email: data.client.email,
          full_name: data.client.fullName,
          phone: data.client.phone,
        });
    }

    const calc = calcInstallment({
      productPrice: data.productPrice,
      downPayment: data.downPayment,
      termMonths: data.termMonths,
      markupRate: data.markupRate,
    });
    const startDate = data.firstPaymentDate
      ? new Date(data.firstPaymentDate + "T00:00:00")
      : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();

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

    if (data.documents) {
      const d = data.documents;
      const patch: Record<string, string | null> = {};
      if (d.passportSeries !== undefined) patch.passport_series = d.passportSeries || null;
      if (d.passportNumber !== undefined) patch.passport_number = d.passportNumber || null;
      if (d.passportIssuedBy !== undefined) patch.passport_issued_by = d.passportIssuedBy || null;
      if (d.passportIssuedAt !== undefined) patch.passport_issued_at = d.passportIssuedAt || null;
      if (d.driverLicenseNumber !== undefined) patch.driver_license_number = d.driverLicenseNumber || null;
      if (d.driverLicenseCategories !== undefined) patch.driver_license_categories = d.driverLicenseCategories || null;
      if (d.driverLicenseIssuedAt !== undefined) patch.driver_license_issued_at = d.driverLicenseIssuedAt || null;

      for (const [kind, photo] of [
        ["passport", d.passportPhoto] as const,
        ["driver_license", d.driverLicensePhoto] as const,
      ]) {
        if (!photo) continue;
        const ext = (photo.fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${clientId}/${kind}-${Date.now()}.${ext}`;
        const bytes = Uint8Array.from(atob(photo.dataBase64), (c) => c.charCodeAt(0));
        const { error: upErr } = await supabaseAdmin.storage
          .from("client-documents")
          .upload(path, bytes, { contentType: photo.contentType, upsert: true });
        if (upErr) throw new Error(upErr.message);
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from("client-documents")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (signErr) throw new Error(signErr.message);
        patch[kind === "passport" ? "passport_photo_url" : "driver_license_photo_url"] = signed.signedUrl;
      }

      if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from("profiles").update(patch as never).eq("id", clientId);
      }
    }

    return { contractId: contract.id, clientId, tempPassword };
  });
