import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOwner(ctx: { supabase: { rpc: (...a: unknown[]) => Promise<{ data: unknown }> }; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "owner" });
  if (!data) throw new Error("Forbidden");
}

export const aiApiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context as never);
    const apiKey = process.env.AI_READONLY_API_KEY ?? "";
    const hmac = process.env.AI_READONLY_HMAC_SECRET ?? "";
    const mask = (s: string) => (s ? `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} симв.)` : "не настроен");
    return {
      apiKeyMask: mask(apiKey),
      hmacMask: mask(hmac),
      configured: Boolean(apiKey && hmac),
    };
  });

export const aiApiRevealSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context as never);
    return {
      apiKey: process.env.AI_READONLY_API_KEY ?? "",
      hmacSecret: process.env.AI_READONLY_HMAC_SECRET ?? "",
    };
  });

export const aiApiAccessLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_api_access_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    return { rows: data ?? [] };
  });

export const aiApiOwnerExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { format: "json" | "zip"; includeSecrets?: boolean }) => d)
  .handler(async ({ context, data }) => {
    await assertOwner(context as never);
    if (data.format === "zip") {
      const { exportFullZip } = await import("@/lib/ai-api/exporter.server");
      const { blob, totalRows } = await exportFullZip(data.includeSecrets === true);
      // Convert ArrayBuffer to base64 for transport
      const bytes = new Uint8Array(blob);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      return { format: "zip" as const, base64: b64, totalRows };
    }
    const { exportFullJson } = await import("@/lib/ai-api/exporter.server");
    const json = await exportFullJson(data.includeSecrets === true);
    return { format: "json" as const, jsonString: JSON.stringify(json), totalRows: json.total_rows };
  });