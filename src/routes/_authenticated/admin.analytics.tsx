import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { adminAnalyticsSeries, adminStats, getMyRoles } from "@/lib/admin.functions";
import { exportReportXlsx } from "@/lib/reports.functions";
import { formatMoney } from "@/lib/installment";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AnalyticsPage,
});

type Period = "all" | "year" | "quarter" | "month" | "week" | "today" | "custom";

const periodLabels: Record<Period, string> = {
  all: "Всё время",
  year: "Год",
  quarter: "3 месяца",
  month: "Этот месяц",
  week: "Неделя",
  today: "Сегодня",
  custom: "Выбрать период",
};

const chartConfig = {
  sales: { label: "Продажи", color: "var(--chart-1)" },
  payments: { label: "Платежи", color: "var(--chart-2)" },
  due: { label: "К получению", color: "var(--chart-3)" },
} satisfies ChartConfig;

const todayKey = () => new Date().toISOString().slice(0, 10);

function AnalyticsPage() {
  const fn = useServerFn(adminStats);
  const seriesFn = useServerFn(adminAnalyticsSeries);
  const rolesFn = useServerFn(getMyRoles);
  const exportFn = useServerFn(exportReportXlsx);
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayKey());
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });
  const { data: roles } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const canExport = (roles ?? []).some((r) => r === "admin" || r === "owner");
  const { data: series, isLoading: seriesLoading } = useQuery({
    queryKey: ["admin-analytics-series", period, from, to],
    queryFn: () => seriesFn({ data: { period, from: from || undefined, to: to || undefined } }),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Загрузка...</p>;

  const recovery = data.totalSold > 0 ? (data.paymentsCollected / data.totalSold) * 100 : 0;
  const overduePct =
    data.contractsTotal > 0 ? (data.contractsOverdue / data.contractsTotal) * 100 : 0;
  const margin = data.totalSold > 0 ? (data.totalMarkup / data.totalSold) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Аналитика
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Финансовые показатели</h1>
      </div>

      {canExport && <ExportPanel exportFn={exportFn} />}

      <div className="grid md:grid-cols-3 gap-4">
        <KPI
          label="Сборы / Продажи"
          pct={recovery}
          sub={`${formatMoney(data.paymentsCollected)} из ${formatMoney(data.totalSold)}`}
        />
        <KPI
          label="Доля просрочки"
          pct={overduePct}
          tone="danger"
          sub={`${data.contractsOverdue} из ${data.contractsTotal} контрактов`}
        />
        <KPI
          label="Маржа (наценка)"
          pct={margin}
          sub={`${formatMoney(data.totalMarkup)} прибыли`}
        />
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">
          Структура капитала
        </h2>
        <div className="grid md:grid-cols-4 gap-6">
          <Flow label="Свои средства" value={data.capital.own} />
          <Flow label="Средства инвесторов" value={data.capital.investor} />
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              Доля инвесторов
            </div>
            <div className="text-2xl font-extrabold">
              {data.capital.investorShare.toFixed(1)}%
            </div>
            <div className="h-2 bg-muted rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, data.capital.investorShare)}%` }}
              />
            </div>
          </div>
          <Flow
            label="Активных инвесторов"
            value={data.investorsActive}
            prefix=""
            suffix={` из ${data.investorsTotal}`}
          />
        </div>
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">
          Прибыль — раскладка
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <ProfitCard
            label="Наша прибыль (свои средства)"
            expected={data.profitExpected.own}
            received={data.profitCollected.own}
          />
          <ProfitCard
            label="Наша прибыль (со средств инвесторов)"
            expected={data.profitExpected.companyFromInvestor}
            received={data.profitCollected.companyFromInvestor}
          />
          <ProfitCard
            label="Итого наша прибыль"
            expected={data.profitExpected.companyTotal}
            received={data.profitCollected.companyTotal}
            accent
          />
          <ProfitCard
            label="Прибыль инвесторов"
            expected={data.profitExpected.investors}
            received={data.profitCollected.investors}
            tone="investor"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          «Получено» — фактически собранная наценка, рассчитанная пропорционально доле наценки в каждом контракте.
        </p>
      </div>

      {data.topInvestors.length > 0 && (
        <div className="bg-card rounded-2xl ring-1 ring-border p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">
            Топ инвесторов
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Инвестор</th>
                  <th className="py-2 pr-4 text-right">Капитал</th>
                  <th className="py-2 pr-4 text-right">Доля</th>
                  <th className="py-2 pr-4 text-right">Ожид. прибыль</th>
                  <th className="py-2 pr-4 text-right">Получено</th>
                  <th className="py-2 text-right">Наша прибыль с него</th>
                </tr>
              </thead>
              <tbody>
                {data.topInvestors.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium">
                      {inv.name}
                      {!inv.isActive && (
                        <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                          неактивен
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">{formatMoney(inv.capital)}</td>
                    <td className="py-2 pr-4 text-right">
                      {(inv.shareRate * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 pr-4 text-right">{formatMoney(inv.expectedProfit)}</td>
                    <td className="py-2 pr-4 text-right text-emerald-600">
                      {formatMoney(inv.receivedProfit)}
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {formatMoney(inv.companyProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl ring-1 ring-border p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">
          Денежные потоки
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Flow label="К получению сегодня" value={data.duesToday} />
          <Flow label="К получению за 7 дней" value={data.duesWeek} />
          <Flow label="Просроченная сумма" value={data.overdueAmount} tone="danger" />
        </div>
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">
          Портфель
        </h2>
        <div className="grid md:grid-cols-4 gap-4">
          <Flow label="Активные" value={data.contractsActive} prefix="" suffix=" контр." />
          <Flow label="Закрытые" value={data.contractsClosed} prefix="" suffix=" контр." />
          <Flow
            label="Просроченные"
            value={data.contractsOverdue}
            prefix=""
            suffix=" контр."
            tone="danger"
          />
          <Flow label="Всего клиентов" value={data.clientsCount} prefix="" suffix="" />
        </div>
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Динамика
            </h2>
            <p className="text-sm text-muted-foreground">
              {series ? `${series.from} — ${series.to}` : "Загрузка периода..."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(periodLabels) as Period[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {periodLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {period === "custom" && (
              <>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-40"
                />
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-40"
                />
              </>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <Flow label="Продажи за период" value={series?.totals.sales ?? 0} />
          <Flow label="Платежи за период" value={series?.totals.payments ?? 0} />
          <Flow label="К получению" value={series?.totals.due ?? 0} />
          <Flow label="Договоры" value={series?.totals.contracts ?? 0} prefix="" suffix=" шт." />
        </div>

        <div className="rounded-xl ring-1 ring-border bg-muted/20 p-4 mb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
            Капитал в обороте за период (новые контракты)
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Flow label="Свои средства" value={series?.totals.capitalOwn ?? 0} />
            <Flow label="Средства инвесторов" value={series?.totals.capitalInvestor ?? 0} />
            <Flow
              label="Всего размещено"
              value={(series?.totals.capitalOwn ?? 0) + (series?.totals.capitalInvestor ?? 0)}
            />
          </div>
        </div>

        <div className="rounded-xl ring-1 ring-border bg-muted/20 p-4 mb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
            Прибыль за период
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ProfitCard
              label="Наша (свои средства)"
              expected={series?.totals.profitOwnExp ?? 0}
              received={series?.totals.profitOwnGot ?? 0}
            />
            <ProfitCard
              label="Наша (со средств инвесторов)"
              expected={series?.totals.profitCompanyFromInvExp ?? 0}
              received={series?.totals.profitCompanyFromInvGot ?? 0}
            />
            <ProfitCard
              label="Итого наша"
              expected={
                (series?.totals.profitOwnExp ?? 0) +
                (series?.totals.profitCompanyFromInvExp ?? 0)
              }
              received={
                (series?.totals.profitOwnGot ?? 0) +
                (series?.totals.profitCompanyFromInvGot ?? 0)
              }
              accent
            />
            <ProfitCard
              label="Инвесторам"
              expected={series?.totals.profitInvestorsExp ?? 0}
              received={series?.totals.profitInvestorsGot ?? 0}
              tone="investor"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            «Ожидается» — наценка по контрактам, открытым в выбранном периоде. «Получено» — наценка, фактически собранная платежами в этом же периоде (по любым контрактам).
          </p>
        </div>

        {seriesLoading || !series ? (
          <div className="h-80 rounded-2xl bg-muted animate-pulse" />
        ) : (
          <ChartContainer config={chartConfig} className="h-80 w-full aspect-auto">
            <AreaChart data={series.chart} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="paymentsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-payments)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--color-payments)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={74}
                tickFormatter={(value) => compactMoney(Number(value))}
              />
              <ChartTooltip content={<AnalyticsTooltip />} />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="var(--color-sales)"
                fill="url(#salesFill)"
                strokeWidth={2}
                name="Продажи"
              />
              <Area
                type="monotone"
                dataKey="payments"
                stroke="var(--color-payments)"
                fill="url(#paymentsFill)"
                strokeWidth={2}
                name="Платежи"
              />
              <Area
                type="monotone"
                dataKey="due"
                stroke="var(--color-due)"
                fill="transparent"
                strokeWidth={2}
                name="К получению"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}

function compactMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} тыс`;
  return value.toLocaleString("ru-RU");
}

function AnalyticsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: { label?: string } }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-44 rounded-xl border border-border bg-background px-3 py-2 text-xs shadow-xl">
      <div className="font-bold mb-2">{payload[0]?.payload?.label}</div>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold">{formatMoney(Number(item.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KPI({
  label,
  pct,
  sub,
  tone,
}: {
  label: string;
  pct: number;
  sub: string;
  tone?: "danger";
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="bg-card rounded-2xl ring-1 ring-border p-6">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
        {label}
      </div>
      <div className={`text-4xl font-extrabold ${tone === "danger" ? "text-destructive" : ""}`}>
        {pct.toFixed(1)}%
      </div>
      <div className="h-2 bg-muted rounded-full mt-4 overflow-hidden">
        <div
          className={`h-full transition-all ${tone === "danger" ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground mt-3">{sub}</div>
    </div>
  );
}

function Flow({
  label,
  value,
  tone,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  tone?: "danger";
  prefix?: string;
  suffix?: string;
}) {
  const display =
    prefix !== undefined || suffix !== undefined
      ? `${prefix ?? ""}${value.toLocaleString("ru-RU")}${suffix ?? ""}`
      : formatMoney(value);
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-2xl font-extrabold ${tone === "danger" ? "text-destructive" : ""}`}>
        {display}
      </div>
    </div>
  );
}

function ProfitCard({
  label,
  expected,
  received,
  tone,
  accent,
}: {
  label: string;
  expected: number;
  received: number;
  tone?: "investor";
  accent?: boolean;
}) {
  const pct = expected > 0 ? Math.min(100, (received / expected) * 100) : 0;
  return (
    <div
      className={`rounded-xl p-4 ${
        accent ? "bg-primary/5 ring-1 ring-primary/30" : "bg-muted/30 ring-1 ring-border"
      }`}
    >
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
        {label}
      </div>
      <div
        className={`text-2xl font-extrabold ${
          tone === "investor" ? "text-amber-600" : accent ? "text-primary" : ""
        }`}
      >
        {formatMoney(expected)}
      </div>
      <div className="text-xs text-muted-foreground mt-1">ожидается всего</div>
      <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${
            tone === "investor" ? "bg-amber-500" : "bg-emerald-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs mt-2">
        <span className="text-emerald-600 font-semibold">
          получено {formatMoney(received)}
        </span>
        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
