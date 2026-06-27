import { createFileRoute } from "@tanstack/react-router";
import { verifyAiApiRequest, logAiApiAccess } from "@/lib/ai-api/auth.server";
import { fetchSchema } from "@/lib/ai-api/exporter.server";

export const Route = createFileRoute("/api/public/ai/schema")({
  server: {
    handlers: {
      GET: async () => {
        const auth = await verifyAiApiRequest("");
        if (!auth.ok) {
          await logAiApiAccess({
            endpoint: "/api/public/ai/schema",
            method: "GET",
            ip: null,
            status: auth.status,
            error: auth.error,
          });
          return new Response(JSON.stringify({ error: auth.error }), {
            status: auth.status,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const data = await fetchSchema();
          await logAiApiAccess({
            endpoint: "/api/public/ai/schema",
            method: "GET",
            ip: auth.ip,
            status: 200,
          });
          return Response.json(data);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "error";
          await logAiApiAccess({
            endpoint: "/api/public/ai/schema",
            method: "GET",
            ip: auth.ip,
            status: 500,
            error: msg,
          });
          return new Response(JSON.stringify({ error: msg }), { status: 500 });
        }
      },
    },
  },
});