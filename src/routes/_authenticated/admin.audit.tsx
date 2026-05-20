import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminListAuditLog } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

function money(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function ContractSnapshotView({ snapshot }: { snapshot: any }) {
  const c = snapshot.contract ?? {};
  const client = snapshot.client ?? null;
  const schedules: any[] = snapshot.schedules ?? [];
  const payments: any[] = snapshot.payments ?? [];
  return (
    <div className="space-y-5 text-sm">
      <div className="rounded-xl bg-muted/40 p-4 space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Товар</div>
        <div className="font-semibold text-base">{c.product_name ?? "—"}</div>
        {c.product_description && <div className="text-muted-foreground">{c.product_description}</div>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Field label="Цена" value={money(c.product_price)} />
        <Field label="Первый взнос" value={money(c.down_payment)} />
        <Field label="Сумма к рассрочке" value={money(c.principal)} />
        <Field label="Наценка" value={`${money(c.markup_amount)} (${((Number(c.markup_rate ?? 0)) * 100).toFixed(1)}%)`} />
        <Field label="Итого" value={money(c.total_sale_price)} />
        <Field label="Ежемесячно" value={money(c.monthly_payment)} />
        <Field label="Срок" value={`${c.term_months} мес.`} />
        <Field label="Дата старта" value={c.start_date ?? "—"} />
        <Field label="Статус" value={c.status ?? "—"} />
      </div>
      <div className="rounded-xl bg-muted/40 p-4 space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Клиент</div>
        <div className="font-semibold">{client?.full_name ?? c.client_full_name ?? "—"}</div>
        <div className="text-muted-foreground text-xs">
          {client?.email ?? "—"}{client?.phone ? ` · ${client.phone}` : ""}
        </div>
        {c.client_telegram && <div className="text-xs">TG: {c.client_telegram}</div>}
        {c.client_comment && <div className="text-xs text-muted-foreground mt-1">«{c.client_comment}»</div>}
      </div>

      {schedules.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-2">График платежей</div>
          <div className="rounded-xl ring-1 ring-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr><th className="p-2 text-left">№</th><th className="p-2 text-left">Дата</th><th className="p-2 text-right">Сумма</th><th className="p-2 text-left">Статус</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schedules.map((s) => (
                  <tr key={s.id}><td className="p-2">{s.seq}</td><td className="p-2">{s.due_date}</td><td className="p-2 text-right">{money(s.amount)}</td><td className="p-2">{s.status}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-2">Платежи</div>
          <div className="rounded-xl ring-1 ring-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr><th className="p-2 text-left">Дата</th><th className="p-2 text-right">Сумма</th><th className="p-2 text-left">Метод</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => (
                  <tr key={p.id}><td className="p-2">{fmt(p.paid_at)}</td><td className="p-2 text-right">{money(p.amount)}</td><td className="p-2">{p.method ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground font-mono">ID: {c.id}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}

function AuditPage() {
  const fn = useServerFn(adminListAuditLog);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("all");
  const [viewRow, setViewRow] = useState<any | null>(null);

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
              const isContractDelete = row.action === "contract.delete";
              const hasSnapshot = isContractDelete && (row as any).details?.snapshot;
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
                  {isContractDelete && (
                    <Button size="sm" variant="outline" onClick={() => setViewRow(row)} className="shrink-0">
                      <Eye className="size-4 mr-1.5" /> Посмотреть
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Удалённый контракт</DialogTitle>
          </DialogHeader>
          {viewRow?.details?.snapshot ? (
            <ContractSnapshotView snapshot={viewRow.details.snapshot} />
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Подробный снимок этого контракта не сохранён — он был удалён до добавления функции просмотра удалённых данных. Доступна только базовая информация:
              </p>
              <div className="rounded-xl bg-muted/40 p-4 space-y-1.5">
                <div><span className="text-muted-foreground">Описание:</span> {viewRow?.summary ?? "—"}</div>
                <div><span className="text-muted-foreground">Кто удалил:</span> {viewRow?.actor_name ?? "—"} {viewRow?.actor_email && `· ${viewRow.actor_email}`}</div>
                <div><span className="text-muted-foreground">Когда:</span> {viewRow ? fmt(viewRow.created_at) : "—"}</div>
                <div><span className="text-muted-foreground">ID контракта:</span> <span className="font-mono text-xs">{viewRow?.entity_id ?? "—"}</span></div>
                {viewRow?.details && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Сырые данные</summary>
                    <pre className="text-[11px] mt-2 overflow-x-auto">{JSON.stringify(viewRow.details, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}