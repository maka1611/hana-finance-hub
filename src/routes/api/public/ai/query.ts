import { createFileRoute } from "@tanstack/react-router";
import { verifyAiApiRequest, logAiApiAccess, resolveTableList } from "@/lib/ai-api/auth.server";

type Filter = { column: string; op: string; value: unknown };
const OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"]);

export const Route = createFileRoute("/api/public/ai/query")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const auth = await verifyAiApiRequest(raw);
        const endpoint = "/api/public/ai/query";
        if (!auth.ok) {
          await logAiApiAccess({ endpoint, method: "POST", ip: null, status: auth.status, error: auth.error });
          return new Response(JSON.stringify({ error: auth.error }), { status: auth.status });
        }
        let body: {
          table?: string;
          select?: string;
          filters?: Filter[];
          order?: { column: string; ascending?: boolean };
          limit?: number;
          offset?: number;
          include_secrets?: boolean;
        };
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
        }
        const includeSecrets = body.include_secrets === true;
        const allowed = resolveTableList(includeSecrets);
        if (!body.table || !allowed.includes(body.table)) {
          await logAiApiAccess({ endpoint, method: "POST", ip: auth.ip, status: 404, error: "table not allowed" });
          return new Response(JSON.stringify({ error: "Unknown or not allowed table" }), { status: 404 });
        }
        const select = typeof body.select === "string" && /^[\w\s,*().]+$/.test(body.select) ? body.select : "*";
        const limit = Math.min(Math.max(Number(body.limit ?? 1000), 1), 5000);
        const offset = Math.max(Number(body.offset ?? 0), 0);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let q = supabaseAdmin.from(body.table as never).select(select, { count: "exact" }).range(offset, offset + limit - 1);
          for (const f of body.filters ?? []) {
            if (!f || typeof f.column !== "string" || !/^\w+$/.test(f.column)) continue;
            if (!OPS.has(f.op)) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            q = (q as any)[f.op](f.column, f.value);
          }
          if (body.order && /^\w+$/.test(body.order.column)) {
            q = q.order(body.order.column, { ascending: body.order.ascending ?? true });
          }
          const { data, count, error } = await q;
          if (error) throw new Error(error.message);
          const rows = (data ?? []) as unknown[];
          await logAiApiAccess({ endpoint, method: "POST", ip: auth.ip, status: 200, rowsReturned: rows.length, meta: { table: body.table, limit, offset } });
          return Response.json({
            table: body.table,
            generated_at: new Date().toISOString(),
            total: count ?? null,
            limit,
            offset,
            next_offset: rows.length === limit ? offset + limit : null,
            rows,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "error";
          await logAiApiAccess({ endpoint, method: "POST", ip: auth.ip, status: 500, error: msg });
          return new Response(JSON.stringify({ error: msg }), { status: 500 });
        }
      },
    },
  },
});