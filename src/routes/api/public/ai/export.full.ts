import { createFileRoute } from "@tanstack/react-router";
import { verifyAiApiRequest, logAiApiAccess } from "@/lib/ai-api/auth.server";
import { exportFullJson, exportFullZip } from "@/lib/ai-api/exporter.server";

export const Route = createFileRoute("/api/public/ai/export/full")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyAiApiRequest("");
        const endpoint = "/api/public/ai/export/full";
        if (!auth.ok) {
          await logAiApiAccess({ endpoint, method: "GET", ip: null, status: auth.status, error: auth.error });
          return new Response(JSON.stringify({ error: auth.error }), { status: auth.status });
        }
        const url = new URL(request.url);
        const format = (url.searchParams.get("format") ?? "json").toLowerCase();
        const includeSecrets = url.searchParams.get("include_secrets") === "true";
        try {
          if (format === "zip") {
            const { blob, totalRows } = await exportFullZip(includeSecrets);
            await logAiApiAccess({ endpoint, method: "GET", ip: auth.ip, status: 200, rowsReturned: totalRows, meta: { format, includeSecrets } });
            return new Response(blob, {
              headers: {
                "content-type": "application/zip",
                "content-disposition": `attachment; filename="noorpay-full-${Date.now()}.zip"`,
              },
            });
          }
          const data = await exportFullJson(includeSecrets);
          await logAiApiAccess({ endpoint, method: "GET", ip: auth.ip, status: 200, rowsReturned: data.total_rows, meta: { format, includeSecrets } });
          return Response.json(data);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "error";
          await logAiApiAccess({ endpoint, method: "GET", ip: auth.ip, status: 500, error: msg });
          return new Response(JSON.stringify({ error: msg }), { status: 500 });
        }
      },
    },
  },
});