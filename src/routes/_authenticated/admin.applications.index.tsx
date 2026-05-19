import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminListApplications } from "@/lib/applications.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/applications/")({
  component: AdminApplicationsList,
});

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function AdminApplicationsList() {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const fn = useServerFn(adminListApplications);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-applications", status],
    queryFn: () => fn({ data: { status } }),
  });
  const apps = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">Поток</p>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Inbox className="size-7" /> Заявки на рассрочку
          </h1>
        </div>
        <div className="flex gap-1 bg-card rounded-full p-1 ring-1 ring-border text-sm">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full transition-colors ${status === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {s === "pending" ? "Новые" : s === "approved" ? "Одобрены" : s === "rejected" ? "Отклонены" : "Все"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : apps.length === 0 ? (
        <div className="bg-card rounded-2xl ring-1 ring-border p-10 text-center text-muted-foreground">
          Заявок нет
        </div>
      ) : (
        <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
          {apps.map((a) => (
            <Link
              key={a.id}
              to="/admin/applications/$id"
              params={{ id: a.id }}
              className="block p-4 hover:bg-muted/40 transition-colors"
            >
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate">{a.product_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {a.profile?.full_name || a.client_full_name || "Без имени"}
                    {" · "}{a.profile?.email ?? "—"}
                    {a.client_phone && ` · ${a.client_phone}`}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {formatDate(a.created_at)} · {a.term_months} мес · взнос {formatMoney(Number(a.down_payment))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold">{formatMoney(Number(a.product_price))}</div>
                  <StatusPill status={a.status} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Новая", cls: "bg-amber-400/15 text-amber-700" },
    approved: { label: "Одобрена", cls: "bg-primary/15 text-primary" },
    rejected: { label: "Отклонена", cls: "bg-destructive/10 text-destructive" },
  };
  const v = map[status] ?? { label: status, cls: "bg-muted" };
  return <span className={`mt-1 inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${v.cls}`}>{v.label}</span>;
}