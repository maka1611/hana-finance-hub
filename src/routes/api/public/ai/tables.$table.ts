import { createFileRoute } from "@tanstack/react-router";
import { verifyAiApiRequest, logAiApiAccess, resolveTableList } from "@/lib/ai-api/auth.server";

function rowsToCsv(rows: unknown[]): string {
  if (rows.length === 0) return "";
  const cols = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      if (r && typeof r === "object") for (const k of Object.keys(r as Record<string, unknown>)) acc.add(k);
      return acc;
    }, new Set()),
  );
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
}

export const Route = createFileRoute("/api/public/ai/tables/$table")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await verifyAiApiRequest("");
        const endpoint = `/api/public/ai/tables/${params.table}`;
        if (!auth.ok) {
          await logAiApiAccess({ endpoint, method: "GET", ip: null, status: auth.status, error: auth.error });
          return new Response(JSON.stringify({ error: auth.error }), { status: auth.status });
        }
        const url = new URL(request.url);
        const includeSecrets = url.searchParams.get("include_secrets") === "true";
        const allowed = resolveTableList(includeSecrets);
        if (!allowed.includes(params.table)) {
          await logAiApiAccess({ endpoint, method: "GET", ip: auth.ip, status: 404, error: "table not allowed" });
          return new Response(JSON.stringify({ error: "Unknown or not allowed table" }), { status: 404 });
        }
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "1000") || 1000, 5000);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? "0") || 0, 0);
        const since = url.searchParams.get("since");
        const format = (url.searchParams.get("format") ?? "json").toLowerCase();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let query = supabaseAdmin
            .from(params.table as never)
            .select("*", { count: "exact" })
            .range(offset, offset + limit - 1);
          if (since) query = query.gte("updated_at", since) as typeof query;
          const { data, count, error } = await query;
          if (error) throw new Error(error.message);
          const rows = (data ?? []) as unknown[];
          await logAiApiAccess({
            endpoint,
            method: "GET",
            ip: auth.ip,
            status: 200,
            rowsReturned: rows.length,
            meta: { limit, offset, since },
          });
          if (format === "csv") {
            return new Response(rowsToCsv(rows), {
              headers: { "content-type": "text/csv; charset=utf-8" },
            });
          }
          return Response.json({
            table: params.table,
            generated_at: new Date().toISOString(),
            total: count ?? null,
            limit,
            offset,
            next_offset: rows.length === limit ? offset + limit : null,
            rows,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "error";
          await logAiApiAccess({ endpoint, method: "GET", ip: auth.ip, status: 500, error: msg });
          return new Response(JSON.stringify({ error: msg }), { status: 500 });
        }
      },
    },
  },
});