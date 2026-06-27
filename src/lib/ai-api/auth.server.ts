import { getRequest, getRequestHeader } from "@tanstack/react-start/server";

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export type AuthResult =
  | { ok: true; ip: string | null }
  | { ok: false; status: number; error: string };

/**
 * Two-factor auth for AI read-only API:
 *  1. Bearer token must equal AI_READONLY_API_KEY
 *  2. X-Signature must equal HMAC-SHA256(AI_READONLY_HMAC_SECRET, `${timestamp}:${path}:${bodyHash}`)
 *     where bodyHash = sha256(rawBody) hex (or empty string for empty body).
 *  3. X-Timestamp must be within ±5 minutes of server time.
 */
export async function verifyAiApiRequest(rawBody: string): Promise<AuthResult> {
  const apiKey = process.env.AI_READONLY_API_KEY;
  const hmacSecret = process.env.AI_READONLY_HMAC_SECRET;
  if (!apiKey || !hmacSecret) {
    return { ok: false, status: 500, error: "AI API not configured" };
  }

  const request = getRequest();
  const auth = getRequestHeader("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || !timingSafeEqual(token, apiKey)) {
    return { ok: false, status: 401, error: "Invalid API key" };
  }

  const tsHeader = getRequestHeader("x-timestamp") ?? "";
  const sigHeader = (getRequestHeader("x-signature") ?? "").toLowerCase();
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_WINDOW_MS) {
    return { ok: false, status: 401, error: "Invalid or expired timestamp" };
  }
  if (!sigHeader) {
    return { ok: false, status: 401, error: "Missing signature" };
  }

  const url = new URL(request.url);
  const pathWithQuery = url.pathname + url.search;

  // body hash
  let bodyHash = "";
  if (rawBody.length > 0) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
    const bytes = new Uint8Array(buf);
    for (const b of bytes) bodyHash += b.toString(16).padStart(2, "0");
  }

  const message = `${tsHeader}:${pathWithQuery}:${bodyHash}`;
  const expected = await hmacSha256Hex(hmacSecret, message);
  if (!timingSafeEqual(sigHeader, expected)) {
    return { ok: false, status: 401, error: "Invalid signature" };
  }

  const ip =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  return { ok: true, ip };
}

export async function logAiApiAccess(params: {
  endpoint: string;
  method: string;
  ip: string | null;
  status: number;
  rowsReturned?: number;
  error?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_api_access_log").insert({
      endpoint: params.endpoint,
      method: params.method,
      ip: params.ip,
      status: params.status,
      rows_returned: params.rowsReturned ?? null,
      error: params.error ?? null,
      meta: params.meta ?? null,
    });
  } catch {
    // never block API response on logging failure
  }
}

/**
 * Whitelist of public tables the AI API may read.
 * client_secrets is excluded by default — only included when includeSecrets=true (owner-only flag).
 */
export const ALLOWED_TABLES = [
  "admin_audit_log",
  "ai_api_access_log",
  "app_settings",
  "client_documents",
  "company_expenses",
  "company_funds_operations",
  "contract_guarantors",
  "email_send_log",
  "email_send_state",
  "guarantor_emails",
  "guarantor_phones",
  "installment_applications",
  "installment_contracts",
  "investor_applications",
  "investor_contributions",
  "investors",
  "payment_carryovers",
  "payment_schedule_history",
  "payment_schedules",
  "payments",
  "profiles",
  "suppressed_emails",
  "user_phones",
  "user_roles",
] as const;

export const SENSITIVE_TABLES = ["client_secrets"] as const;

export function resolveTableList(includeSecrets: boolean): string[] {
  return includeSecrets
    ? [...ALLOWED_TABLES, ...SENSITIVE_TABLES]
    : [...ALLOWED_TABLES];
}