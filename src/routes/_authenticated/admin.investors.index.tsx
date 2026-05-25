import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listInvestors, getInvestorsAggregate } from "@/lib/investors.functions";
import { formatMoney } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Briefcase, Plus, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/investors/")({
  component: InvestorsList,
});

function InvestorsList() {
  const fn = useServerFn(listInvestors);
  const aggFn = useServerFn(getInvestorsAggregate);
  const { data, isLoading } = useQuery({ queryKey: ["investors"], queryFn: () => fn() });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const aggKey = useMemo(() => [...selected].sort().join(","), [selected]);
  const { data: agg } = useQuery({
    queryKey: ["investors-agg", aggKey],
    queryFn: () => aggFn({ data: { ids: [...selected] } }),
    enabled: selected.size > 0,
  });

  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">Загрузка...</p>;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
            <Briefcase className="inline size-3 mr-1" /> Инвесторы
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">Инвесторы</h1>
        </div>
        <Link to="/admin/investors/new">
          <Button className="gap-2"><Plus className="size-4" /> Добавить инвестора</Button>
        </Link>
      </div>

      {selected.size > 0 && agg && (
        <div className="rounded-2xl bg-card ring-1 ring-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">Сводка по выбранным ({selected.size})</h2>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Снять выделение
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Вложено" value={formatMoney(agg.totals.invested)} />
            <Stat label="Размещено" value={formatMoney(agg.totals.placed)} />
            <Stat label="Свободно" value={formatMoney(agg.totals.free)} highlight />
            <Stat label="Ожид. прибыль" value={formatMoney(agg.totals.expectedProfit)} />
            <Stat label="Получено прибыли" value={formatMoney(agg.totals.receivedProfit)} />
            <Stat label="Контрактов" value={String(agg.totals.contractsCount)} />
            <Stat label="Активных" value={String(agg.totals.activeCount)} />
            <Stat
              label="Просрочки"
              value={`${agg.totals.overdueCount} · ${formatMoney(agg.totals.overdueAmount)}`}
            />
          </div>
        </div>
      )}

      {data.length === 0 ? (
        <div className="rounded-2xl bg-card ring-1 ring-border p-12 text-center">
          <Briefcase className="size-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Инвесторов пока нет</p>
          <Link to="/admin/investors/new">
            <Button className="gap-2"><Plus className="size-4" /> Добавить первого инвестора</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
          {data.map((inv) => (
            <div key={inv.id} className="p-4 sm:p-5 flex items-start gap-3">
              <Checkbox
                checked={selected.has(inv.id)}
                onCheckedChange={() => toggle(inv.id)}
                className="mt-1.5 shrink-0"
              />
              <Link
                to="/admin/investors/$id"
                params={{ id: inv.id }}
                className="flex-1 min-w-0 grid sm:grid-cols-[1fr_auto] gap-3 items-center hover:opacity-80"
              >
                <div className="min-w-0">
                  <div className="font-bold truncate flex items-center gap-2">
                    {inv.full_name}
                    {!inv.is_active && (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        архив
                      </span>
                    )}
                    {inv.overdueCount > 0 && (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-destructive/10 text-destructive inline-flex items-center gap-1">
                        <AlertTriangle className="size-3" />
                        {inv.overdueCount}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {inv.phone || inv.email || "—"} · доля {(Number(inv.profit_share_rate) * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-right text-xs">
                  <Field label="Вложено" value={formatMoney(inv.invested)} />
                  <Field label="Размещено" value={formatMoney(inv.placed)} />
                  <Field label="Свободно" value={formatMoney(inv.free)} highlight />
                  <Field label="Контракты" value={`${inv.activeCount}/${inv.contractsCount}`} />
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl p-3 ring-1 ${
        highlight ? "bg-primary text-primary-foreground ring-transparent" : "bg-background ring-border"
      }`}
    >
      <div className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${highlight ? "opacity-70" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className="font-extrabold text-base">{value}</div>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-bold text-sm ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}