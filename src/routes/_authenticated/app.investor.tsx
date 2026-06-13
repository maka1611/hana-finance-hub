import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getInvestorPortalState,
  getMyInvestorDashboard,
  submitInvestorApplication,
} from "@/lib/investor-portal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Wallet, AlertTriangle, Bell, Coins, BarChart3, Lock, Send, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/investor")({
  component: InvestorPortalPage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";

function InvestorPortalPage() {
  const stateFn = useServerFn(getInvestorPortalState);
  const { data: state, isLoading: stateLoading } = useQuery({
    queryKey: ["investor-portal-state"],
    queryFn: () => stateFn(),
  });

  if (stateLoading || !state) {
    return <div className="text-muted-foreground">Загрузка…</div>;
  }

  if (state.isInvestor) {
    return <InvestorDashboard />;
  }

  if (!state.settings.enabled) {
    return <InvestmentsClosed />;
  }

  if (state.latestApplication && state.latestApplication.status === "pending") {
    return <ApplicationStatus app={state.latestApplication} />;
  }

  return (
    <ApplyForm
      minAmount={state.settings.minAmount}
      profile={state.profile}
      lastApp={state.latestApplication}
    />
  );
}

function InvestmentsClosed() {
  return (
    <div className="max-w-xl mx-auto py-12">
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="py-10 text-center space-y-3">
          <Lock className="h-10 w-10 mx-auto text-amber-700" />
          <h1 className="text-2xl font-extrabold tracking-tight">
            Инвестиции пока не принимаются
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Приём заявок временно закрыт. Загляните позже — мы откроем форму, как только появятся свободные места.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicationStatus({
  app,
}: {
  app: {
    id: string;
    full_name: string;
    amount: number | string;
    desired_monthly_rate: number | string;
    term_months: number | null;
    status: string;
    admin_note: string | null;
    created_at: string;
  };
}) {
  const status = app.status;
  const Icon =
    status === "approved" ? CheckCircle2 : status === "rejected" ? XCircle : Clock;
  const title =
    status === "approved"
      ? "Заявка одобрена"
      : status === "rejected"
        ? "Заявка отклонена"
        : "Заявка на рассмотрении";
  const tone =
    status === "approved"
      ? "text-emerald-700"
      : status === "rejected"
        ? "text-red-700"
        : "text-amber-700";

  return (
    <div className="max-w-xl mx-auto py-10 space-y-4">
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <Icon className={`h-10 w-10 mx-auto ${tone}`} />
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Мы получили вашу заявку{" "}
            {new Date(app.created_at).toLocaleDateString("ru-RU")} и свяжемся с вами.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Детали заявки</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row label="Имя" value={app.full_name} />
          <Row label="Сумма" value={fmt(Number(app.amount))} />
          <Row
            label="Желаемая доходность"
            value={`${Number(app.desired_monthly_rate).toFixed(2)}% / мес`}
          />
          {app.term_months && <Row label="Срок" value={`${app.term_months} мес`} />}
          {app.admin_note && (
            <div className="pt-2 border-t border-border/60 text-xs">
              <div className="text-muted-foreground mb-1">Комментарий менеджера</div>
              <div>{app.admin_note}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function ApplyForm({
  minAmount,
  profile,
  lastApp,
}: {
  minAmount: number;
  profile: { full_name: string | null; email: string | null; phone: string | null } | null;
  lastApp: {
    status: string;
    admin_note: string | null;
  } | null;
}) {
  const qc = useQueryClient();
  const submitFn = useServerFn(submitInvestorApplication);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState<string>(minAmount > 0 ? String(minAmount) : "");
  const [rate, setRate] = useState<string>("");
  const [term, setTerm] = useState<string>("12");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName((v) => v || profile.full_name || "");
      setEmail((v) => v || profile.email || "");
      setPhone((v) => v || profile.phone || "");
    }
  }, [profile]);

  const mut = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          amount: Number(amount),
          desiredMonthlyRate: Number(rate),
          termMonths: term ? Number(term) : null,
          comment: comment.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Заявка отправлена. Мы свяжемся с вами.");
      qc.invalidateQueries({ queryKey: ["investor-portal-state"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось отправить заявку"),
  });

  const amountNum = Number(amount);
  const rateNum = Number(rate);
  const valid =
    fullName.trim().length >= 2 &&
    Number.isFinite(amountNum) &&
    amountNum >= minAmount &&
    amountNum > 0 &&
    Number.isFinite(rateNum) &&
    rateNum > 0;

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Кабинет инвестора
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">
          Подать заявку на инвестиции
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Заполните форму — мы рассмотрим заявку и свяжемся с вами для подписания договора.
        </p>
        {minAmount > 0 && (
          <div className="text-sm mt-2">
            Минимальная сумма: <b>{fmt(minAmount)}</b>
          </div>
        )}
      </div>

      {lastApp && lastApp.status === "rejected" && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="py-4 text-sm">
            <div className="font-semibold text-red-800 mb-1">Прошлая заявка отклонена</div>
            {lastApp.admin_note && <div className="text-muted-foreground">{lastApp.admin_note}</div>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>ФИО *</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Сумма инвестиции, ₽ *</Label>
              <Input
                type="number"
                min={minAmount || 0}
                step="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {minAmount > 0 && amountNum > 0 && amountNum < minAmount && (
                <div className="text-xs text-red-600">
                  Меньше минимальной суммы ({fmt(minAmount)})
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Желаемая доходность, % в месяц *</Label>
              <Input
                type="number"
                min={0.01}
                max={100}
                step="0.1"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="например, 2"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Это ориентир для понимания, какую доходность вы хотите получать
                в среднем со своих вложений. Мы не предоставляем гарантированный
                процент — доля от прибыли рассчитывается индивидуально по итогам
                переговоров и фиксируется в договоре.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Желаемый срок, мес</Label>
              <Input
                type="number"
                min={1}
                max={120}
                step="1"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Комментарий</Label>
              <Textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Дополнительные пожелания, источник средств, удобное время связи…"
              />
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!valid || mut.isPending}
            onClick={() => mut.mutate()}
          >
            <Send className="h-4 w-4 mr-2" />
            {mut.isPending ? "Отправка…" : "Отправить заявку"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function InvestorDashboard() {
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

  const { investor, summary, contracts, contributions, feed } = data;
  const { monthlyProjection } = data;
  const displayedYield = summary.displayedAvgMonthlyYieldPct ?? summary.avgMonthlyYieldPct;
  const annualYield = displayedYield * 12;
  const isForecast = !!summary.yieldIsForecast;

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
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Coins className="h-4 w-4 text-emerald-600" />
              Вы получите всего
            </div>
            <div className="text-xl font-extrabold mt-1">
              {fmt(summary.totalPayout)}
            </div>
            <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
              <div>Возврат капитала: <b>{fmt(summary.capital)}</b></div>
              <div>Чистая прибыль: <b className="text-emerald-700">+{fmt(summary.expectedProfitTotal)}</b></div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2 border-t border-border pt-1.5">
              Уже получено: {fmt(summary.principalReturnedToDate + summary.receivedProfit)} · Осталось: {fmt(summary.principalRemaining + summary.profitRemaining)}
            </div>
          </CardContent>
        </Card>
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
          label={isForecast ? "Доходность / мес (прогноз)" : "Доходность / мес"}
          value={`${displayedYield.toFixed(2)}%`}
          hint={
            isForecast
              ? `≈ ${annualYield.toFixed(1)}% годовых по графику · фактическая появится после первых платежей · договоров: ${summary.activeCount}`
              : `≈ ${annualYield.toFixed(1)}% годовых · договоров: ${summary.activeCount}`
          }
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