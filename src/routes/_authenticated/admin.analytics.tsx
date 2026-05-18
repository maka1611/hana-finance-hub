import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminStats } from "@/lib/admin.functions";
import { formatMoney } from "@/lib/installment";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const fn = useServerFn(adminStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Загрузка...</p>;

  const recovery = data.totalSold > 0 ? (data.paymentsCollected / data.totalSold) * 100 : 0;
  const overduePct = data.contractsTotal > 0 ? (data.contractsOverdue / data.contractsTotal) * 100 : 0;
  const margin = data.totalSold > 0 ? (data.totalMarkup / data.totalSold) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Аналитика
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Финансовые показатели</h1>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <KPI label="Сборы / Продажи" pct={recovery} sub={`${formatMoney(data.paymentsCollected)} из ${formatMoney(data.totalSold)}`} />
        <KPI label="Доля просрочки" pct={overduePct} tone="danger" sub={`${data.contractsOverdue} из ${data.contractsTotal} контрактов`} />
        <KPI label="Маржа (наценка)" pct={margin} sub={`${formatMoney(data.totalMarkup)} прибыли`} />
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">Денежные потоки</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Flow label="К получению сегодня" value={data.duesToday} />
          <Flow label="К получению за 7 дней" value={data.duesWeek} />
          <Flow label="Просроченная сумма" value={data.overdueAmount} tone="danger" />
        </div>
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">Портфель</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <Flow label="Активные" value={data.contractsActive} prefix="" suffix=" контр." />
          <Flow label="Закрытые" value={data.contractsClosed} prefix="" suffix=" контр." />
          <Flow label="Просроченные" value={data.contractsOverdue} prefix="" suffix=" контр." tone="danger" />
          <Flow label="Всего клиентов" value={data.clientsCount} prefix="" suffix="" />
        </div>
      </div>
    </div>
  );
}

function KPI({ label, pct, sub, tone }: { label: string; pct: number; sub: string; tone?: "danger" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="bg-card rounded-2xl ring-1 ring-border p-6">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">{label}</div>
      <div className={`text-4xl font-extrabold ${tone === "danger" ? "text-destructive" : ""}`}>{pct.toFixed(1)}%</div>
      <div className="h-2 bg-muted rounded-full mt-4 overflow-hidden">
        <div className={`h-full transition-all ${tone === "danger" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${clamped}%` }} />
      </div>
      <div className="text-xs text-muted-foreground mt-3">{sub}</div>
    </div>
  );
}

function Flow({ label, value, tone, prefix, suffix }: { label: string; value: number; tone?: "danger"; prefix?: string; suffix?: string }) {
  const display = prefix !== undefined || suffix !== undefined
    ? `${prefix ?? ""}${value.toLocaleString("ru-RU")}${suffix ?? ""}`
    : formatMoney(value);
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-extrabold ${tone === "danger" ? "text-destructive" : ""}`}>{display}</div>
    </div>
  );
}
