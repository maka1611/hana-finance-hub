import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyInvestorDashboard } from "@/lib/investor-portal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Wallet, AlertTriangle, PiggyBank, Bell, CalendarClock, Coins, BarChart3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/app/investor")({
  component: InvestorPortalPage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";

function InvestorPortalPage() {
  const fn = useServerFn(getMyInvestorDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-investor-dashboard"],
    queryFn: () => fn(),
  });

  if (isLoading) return <div className="text-muted-foreground">Загрузка…</div>;
  if (error || !data) {
    return (
      <div className="text-muted-foreground">
        Раздел инвестора недоступен. Если вы инвестор — обратитесь к администратору.
      </div>
    );
  }

  const { investor, summary, contracts, upcoming, contributions, feed } = data;
  const { monthlyProjection } = data;
  const annualYield = summary.avgMonthlyYieldPct * 12;
  const upcomingTotalAmount = upcoming.reduce((s, u) => s + u.amount, 0);
  const upcomingTotalPrincipal = upcoming.reduce((s, u) => s + u.principalPart, 0);
  const upcomingTotalProfit = upcoming.reduce((s, u) => s + u.investorProfit, 0);
  const upcomingTotalCash = upcomingTotalPrincipal + upcomingTotalProfit;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Кабинет инвестора
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">
          {investor.fullName}
        </h1>
        <div className="text-sm text-muted-foreground mt-1">
          Доля прибыли: <b>{Math.round(investor.profitShareRate * 100)}%</b>
          {investor.capitalizeProfit && (
            <Badge variant="secondary" className="ml-2">Капитализация</Badge>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          label="Капитал (вложено)"
          value={fmt(summary.capital)}
          hint={`Размещено: ${fmt(summary.placed)} · Свободно: ${fmt(summary.free)}`}
        />
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Чистая прибыль
            </div>
            <div className="text-xl font-extrabold mt-1 text-emerald-700">
              {fmt(summary.receivedProfit)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Ожидается ещё: {fmt(summary.profitRemaining)} · Всего: {fmt(summary.expectedProfitTotal)}
            </div>
            <Progress value={summary.progressPct} className="h-1.5 mt-2" />
            <div className="text-[10px] text-muted-foreground mt-1">
              Получено {summary.progressPct.toFixed(1)}% от ожидаемой прибыли
            </div>
          </CardContent>
        </Card>
        <SummaryCard
          icon={<Coins className="h-4 w-4 text-emerald-600" />}
          label="Итого после всех платежей"
          value={fmt(summary.totalPayout)}
          hint={`Капитал + прибыль · возврат тела ещё: ${fmt(summary.principalRemaining)}`}
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
          label="Доходность / мес"
          value={`${summary.avgMonthlyYieldPct.toFixed(2)}%`}
          hint={`≈ ${annualYield.toFixed(1)}% годовых · договоров: ${summary.activeCount}`}
        />
      </div>

      {summary.overdueCount > 0 && (
        <Card className="border-amber-300/60 bg-amber-50/60">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div className="text-sm">
              Просрочено платежей: <b>{summary.overdueCount}</b> на сумму{" "}
              <b>{fmt(summary.overdueAmount)}</b>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active contracts */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Активные рассрочки на ваши средства</h2>
        {contracts.length === 0 ? (
          <div className="text-sm text-muted-foreground">Пока нет договоров.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Товар</th>
                  <th className="text-left p-3">Клиент</th>
                  <th className="text-right p-3">Вложено</th>
                  <th className="text-right p-3">Ваша прибыль</th>
                  <th className="text-right p-3">Получено / Осталось</th>
                  <th className="text-right p-3">Итого к получению</th>
                  <th className="text-right p-3">Прогресс</th>
                  <th className="text-right p-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-medium">{c.productName}</td>
                    <td className="p-3 text-muted-foreground font-mono text-xs">{c.clientCode}</td>
                    <td className="p-3 text-right">{fmt(c.principal)}</td>
                    <td className="p-3 text-right text-emerald-700 font-semibold">
                      {fmt(c.investorProfitTotal)}
                    </td>
                    <td className="p-3 text-right">
                      <div className="text-emerald-700">+{fmt(c.investorReceivedProfit)}</div>
                      <div className="text-xs text-muted-foreground">
                        осталось {fmt(c.investorRemainingProfit)}
                      </div>
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {fmt(c.investorPayoutTotal)}
                    </td>
                    <td className="p-3 text-right">
                      <div>{c.paidCount} / {c.totalCount}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.termMonths} мес · с {c.startDate}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Upcoming payments */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> Ближайшие поступления и ваша прибыль (90 дней)
        </h2>
        {upcoming.length === 0 ? (
          <div className="text-sm text-muted-foreground">Платежи в ближайшие 90 дней не ожидаются.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Дата</th>
                  <th className="text-left p-3">Товар</th>
                  <th className="text-right p-3">Платёж</th>
                  <th className="text-right p-3">Возврат тела</th>
                  <th className="text-right p-3">Чистая прибыль</th>
                  <th className="text-right p-3">Ваш приход</th>
                  <th className="text-right p-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.slice(0, 30).map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="p-3">{u.dueDate}</td>
                    <td className="p-3">{u.productName}</td>
                    <td className="p-3 text-right">{fmt(u.amount)}</td>
                    <td className="p-3 text-right">{fmt(u.principalPart)}</td>
                    <td className="p-3 text-right text-emerald-700 font-semibold">
                      +{fmt(u.investorProfit)}
                    </td>
                    <td className="p-3 text-right font-semibold">{fmt(u.investorCashflow)}</td>
                    <td className="p-3 text-right">
                      {u.overdue ? (
                        <Badge variant="destructive">Просрочен</Badge>
                      ) : (
                        <Badge variant="secondary">Ожидается</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 font-semibold">
                <tr className="border-t border-border">
                  <td className="p-3" colSpan={2}>Итого за период</td>
                  <td className="p-3 text-right">{fmt(upcomingTotalAmount)}</td>
                  <td className="p-3 text-right">{fmt(upcomingTotalPrincipal)}</td>
                  <td className="p-3 text-right text-emerald-700">+{fmt(upcomingTotalProfit)}</td>
                  <td className="p-3 text-right">{fmt(upcomingTotalCash)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Monthly projection */}
      {monthlyProjection.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Прогноз поступлений по месяцам
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Месяц</th>
                  <th className="text-right p-3">Возврат тела</th>
                  <th className="text-right p-3">Чистая прибыль</th>
                  <th className="text-right p-3">Всего за месяц</th>
                  <th className="text-right p-3">Накопительно</th>
                </tr>
              </thead>
              <tbody>
                {monthlyProjection.map((m) => (
                  <tr key={m.month} className="border-t border-border">
                    <td className="p-3 font-mono">{m.month}</td>
                    <td className="p-3 text-right">{fmt(m.investorPrincipal)}</td>
                    <td className="p-3 text-right text-emerald-700">
                      +{fmt(m.investorProfit)}
                    </td>
                    <td className="p-3 text-right font-semibold">{fmt(m.investorTotal)}</td>
                    <td className="p-3 text-right text-muted-foreground">
                      {fmt(m.cumulativeTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-muted-foreground">
            Прогноз построен по графику платежей. Чистая прибыль учитывает вашу долю {Math.round(investor.profitShareRate * 100)}%.
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contributions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Взносы и выводы</CardTitle>
          </CardHeader>
          <CardContent>
            {contributions.length === 0 ? (
              <div className="text-sm text-muted-foreground">Операций пока нет.</div>
            ) : (
              <ul className="space-y-2">
                {contributions.map((c) => {
                  const amt = Number(c.amount);
                  return (
                    <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm border-b border-border/60 pb-2 last:border-0">
                      <div>
                        <div className="text-muted-foreground text-xs">{c.operation_date}</div>
                        {c.note && <div>{c.note}</div>}
                      </div>
                      <div className={amt >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                        {amt >= 0 ? "+" : ""}{fmt(amt)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" /> Лента событий
            </CardTitle>
          </CardHeader>
          <CardContent>
            {feed.length === 0 ? (
              <div className="text-sm text-muted-foreground">Событий пока нет.</div>
            ) : (
              <ul className="space-y-2">
                {feed.map((f) => (
                  <li key={f.id} className="flex items-baseline justify-between gap-3 text-sm border-b border-border/60 pb-2 last:border-0">
                    <div>
                      <div className="text-muted-foreground text-xs">
                        {new Date(f.at).toLocaleString("ru-RU")}
                      </div>
                      <div>{f.title}</div>
                      {f.kind === "payment" && f.investorProfit !== undefined && (
                        <div className="text-xs text-emerald-700">
                          ваша чистая прибыль: +{fmt(f.investorProfit)}
                        </div>
                      )}
                    </div>
                    {f.amount !== undefined && (
                      <div className={
                        f.kind === "contribution" && f.amount < 0
                          ? "text-red-600 font-semibold"
                          : "text-foreground font-semibold"
                      }>
                        {fmt(f.amount)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-xl font-extrabold mt-1">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}