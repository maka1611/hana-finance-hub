import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminListAuditLog } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Журнал действий — Админка" }] }),
  component: AuditPage,
});

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  "contract.delete": { label: "Удаление контракта", cls: "bg-destructive/10 text-destructive" },
  "contract.status": { label: "Смена статуса контракта", cls: "bg-amber-400/15 text-amber-700" },
  "client.delete": { label: "Удаление клиента", cls: "bg-destructive/10 text-destructive" },
  "installment.create": { label: "Оформление рассрочки", cls: "bg-primary/15 text-primary" },
  "payment.record": { label: "Приём платежа", cls: "bg-emerald-500/15 text-emerald-700" },
  "payment.mark_paid": { label: "Платёж отмечен оплаченным", cls: "bg-emerald-500/15 text-emerald-700" },
  "document.upload": { label: "Загрузка документа", cls: "bg-sky-500/15 text-sky-700" },
  "document.delete": { label: "Удаление документа", cls: "bg-amber-400/15 text-amber-700" },
  "role.grant": { label: "Назначение роли", cls: "bg-primary/15 text-primary" },
  "role.revoke": { label: "Снятие роли", cls: "bg-amber-400/15 text-amber-700" },
};

function fmt(d: string): string {
  return new Date(d).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function AuditPage() {
  const fn = useServerFn(adminListAuditLog);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit", action],
    queryFn: () => fn({ data: { limit: 300, action: action === "all" ? undefined : action } }),
  });

  const filtered = (data ?? []).filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (r.summary ?? "").toLowerCase().includes(s) ||
      (r.actor_email ?? "").toLowerCase().includes(s) ||
      (r.actor_name ?? "").toLowerCase().includes(s) ||
      (r.entity_id ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Безопасность
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <History className="size-7" /> Журнал действий
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Все действия персонала: оформление, удаление, изменения статусов, документы и роли.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по описанию, email, имени, ID..."
            className="pl-9"
          />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все действия</SelectItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-sm text-muted-foreground">Загрузка...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-sm text-muted-foreground text-center">Записей не найдено</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((row) => {
              const meta = ACTION_LABELS[row.action] ?? { label: row.action, cls: "bg-muted text-muted-foreground" };
              return (
                <li key={row.id} className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.cls}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">{fmt(row.created_at)}</span>
                    </div>
                    <div className="font-medium text-sm mt-1.5">{row.summary ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {row.actor_name ?? "—"}{row.actor_email && ` · ${row.actor_email}`}
                      {row.entity_id && <> · <span className="font-mono">{row.entity_type}:{row.entity_id.slice(0, 8)}</span></>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}