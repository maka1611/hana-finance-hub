import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  getCompanyFundsSummary,
  getCompanyFundsByInvestor,
  getCompanyFundsTimeline,
  listCompanyFundsOperations,
  listCompanyExpenses,
  recordCompanyFundsOperation,
  recordCompanyExpense,
  deleteCompanyFundsOperation,
  deleteCompanyExpense,
  getCompanyFundsMinReserve,
  setCompanyFundsMinReserve,
} from "@/lib/company-funds.functions";
import { getMyRoles } from "@/lib/admin.functions";
import { formatMoney } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { toast } from "sonner";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, AlertTriangle, Trash2, Plus, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/company-funds")({
  head: () => ({ meta: [{ title: "Средства компании — NoorPay" }] }),
  component: CompanyFundsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Не найдено</div>,
});

type Period = "all" | "year" | "quarter" | "month" | "week" | "today" | "custom";
const periodLabels: Record<Period, string> = {
  all: "Всё время",
  year: "Год",
  quarter: "3 месяца",
  month: "Этот месяц",
  week: "Неделя",
  today: "Сегодня",
  custom: "Произвольно",
};

const chartConfig = {
  balance: { label: "Баланс компании", color: "var(--chart-1)" },
} satisfies ChartConfig;

const todayKey = () => new Date().toISOString().slice(0, 10);

function CompanyFundsPage() {
  const rolesFn = useServerFn(getMyRoles);
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => rolesFn(),
  });
  const isOwner = (roles ?? []).includes("owner");

  if (rolesLoading) return <p className="text-sm text-muted-foreground">Загрузка...</p>;
  if (!isOwner) {
    return (
      <div className="max-w-md mx-auto bg-card rounded-2xl ring-1 ring-border p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="text-xl font-bold">Только для владельца</h1>
        <p className="text-sm text-muted-foreground">Этот раздел виден только владельцу проекта.</p>
      </div>
    );
  }
  return <OwnerView />;
}

function OwnerView() {
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayKey());

  const summaryFn = useServerFn(getCompanyFundsSummary);
  const byInvestorFn = useServerFn(getCompanyFundsByInvestor);
  const timelineFn = useServerFn(getCompanyFundsTimeline);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["cf-summary", period, from, to],
    queryFn: () =>
      summaryFn({ data: { period, from: from || undefined, to: to || undefined } }),
  });
  const { data: byInv } = useQuery({
    queryKey: ["cf-by-investor"],
    queryFn: () => byInvestorFn(),
  });
  const { data: timeline } = useQuery({
    queryKey: ["cf-timeline", period, from, to],
    queryFn: () =>
      timelineFn({ data: { period, from: from || undefined, to: to || undefined } }),
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Финансы
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Средства компании</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Полная отчётность по собственному капиталу, обороту и прибыли.
        </p>
      </div>

      <PeriodPicker
        period={period}
        from={from}
        to={to}
        onPeriod={setPeriod}
        onFrom={setFrom}
        onTo={setTo}
      />

      {isLoading || !summary ? (
        <div className="h-32 rounded-2xl bg-muted animate-pulse" />
      ) : (
        <>
          {summary.belowReserve && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-amber-700 dark:text-amber-400">
                  Резерв ликвидности нарушен
                </div>
                <div className="text-muted-foreground">
                  Свободно {formatMoney(summary.freeCash)} — ниже установленного минимума{" "}
                  {formatMoney(summary.minReserve)}.
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Капитал компании" value={formatMoney(summary.capital.injected)} sub="внесено всего" />
            <KPI label="Баланс сейчас" value={formatMoney(summary.balance)} sub="с учётом прибыли и расходов" />
            <KPI label="В обороте" value={formatMoney(summary.capitalInUse)} sub={`загрузка ${summary.loadPct.toFixed(0)}%`} />
            <KPI label="Свободно" value={formatMoney(summary.freeCash)} sub="простаивает" tone={summary.belowReserve ? "danger" : "default"} />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Прибыль (свои средства)" value={formatMoney(summary.profit.own)} sub="по факту платежей" tone="success" />
            <KPI label="Прибыль с инвесторов" value={formatMoney(summary.profit.fromInvestors)} sub="наша доля" tone="success" />
            <KPI label="Итого прибыль" value={formatMoney(summary.profit.total)} sub="без вычета расходов" tone="success" />
            <KPI label="Выплачено инвесторам" value={formatMoney(summary.profit.toInvestors)} sub="их доля" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Расходы" value={formatMoney(summary.expensesTotal)} sub="всего" />
            <KPI label="Чистая прибыль" value={formatMoney(summary.profit.netOfExpenses)} sub="за вычетом расходов" tone="success" />
            <KPI label="Доходность годовых" value={`${summary.roiAnnualPct.toFixed(1)}%`} sub={`за ${summary.daysActive} дн.`} />
            <KPI label="К получению (30 дн.)" value={formatMoney(summary.forecast.d30)} sub={`просрочка: ${formatMoney(summary.forecast.overdue)}`} />
          </div>

          <div className="bg-card rounded-2xl ring-1 ring-border p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
              За выбранный период ({summary.period.from} — {summary.period.to})
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Flow label="Пополнения" value={summary.period_stats.deposits} tone="success" />
              <Flow label="Выводы" value={summary.period_stats.withdrawals} tone="danger" />
              <Flow label="Расходы" value={summary.period_stats.expenses} tone="danger" />
              <Flow label="Корректировки" value={summary.period_stats.adjustments} />
              <Flow label="Прибыль (свои)" value={summary.period_stats.profitOwn} tone="success" />
              <Flow label="Прибыль с инвесторов" value={summary.period_stats.profitFromInvestors} tone="success" />
              <Flow label="Итого прибыль" value={summary.period_stats.profitTotal} tone="success" />
              <Flow label="Выплачено инвесторам" value={summary.period_stats.profitToInvestors} />
            </div>
          </div>

          {timeline && timeline.chart.length > 0 && (
            <div className="bg-card rounded-2xl ring-1 ring-border p-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
                Динамика баланса компании
              </h2>
              <ChartContainer config={chartConfig} className="h-72 w-full aspect-auto">
                <AreaChart data={timeline.chart} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={74}
                    tickFormatter={(v) =>
                      Math.abs(v) >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)} млн`
                        : Math.abs(v) >= 1_000
                          ? `${Math.round(v / 1_000)} тыс`
                          : String(v)
                    }
                  />
                  <ChartTooltip />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="var(--color-balance)"
                    fill="url(#balFill)"
                    strokeWidth={2}
                    name="Баланс"
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          )}
        </>
      )}

      <Tabs defaultValue="ops" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ops">Операции</TabsTrigger>
          <TabsTrigger value="expenses">Расходы</TabsTrigger>
          <TabsTrigger value="investors">По инвесторам</TabsTrigger>
          <TabsTrigger value="forecast">Прогноз</TabsTrigger>
          <TabsTrigger value="settings">Настройки</TabsTrigger>
        </TabsList>
        <TabsContent value="ops">
          <OperationsTab />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab />
        </TabsContent>
        <TabsContent value="investors">
          <InvestorBreakdownTab rows={byInv ?? []} />
        </TabsContent>
        <TabsContent value="forecast">
          <ForecastTab summary={summary} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PeriodPicker({
  period,
  from,
  to,
  onPeriod,
  onFrom,
  onTo,
}: {
  period: Period;
  from: string;
  to: string;
  onPeriod: (p: Period) => void;
  onFrom: (s: string) => void;
  onTo: (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={period} onValueChange={(v) => onPeriod(v as Period)}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(periodLabels) as Period[]).map((k) => (
            <SelectItem key={k} value={k}>
              {periodLabels[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {period === "custom" && (
        <>
          <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="w-40" />
          <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="w-40" />
        </>
      )}
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "danger";
}) {
  const color =
    tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-destructive" : "";
  return (
    <div className="bg-card rounded-2xl ring-1 ring-border p-5">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function Flow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "danger";
}) {
  const color =
    tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-destructive" : "";
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-xl font-bold ${color}`}>{formatMoney(value)}</div>
    </div>
  );
}

function OperationsTab() {
  const listFn = useServerFn(listCompanyFundsOperations);
  const recordFn = useServerFn(recordCompanyFundsOperation);
  const deleteFn = useServerFn(deleteCompanyFundsOperation);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["cf-ops"],
    queryFn: () => listFn(),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["cf-ops"] });
    qc.invalidateQueries({ queryKey: ["cf-summary"] });
    qc.invalidateQueries({ queryKey: ["cf-timeline"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <OpDialog
          type="deposit"
          icon={<ArrowDownToLine className="size-4" />}
          label="Пополнить"
          onDone={refreshAll}
          recordFn={recordFn}
        />
        <OpDialog
          type="withdraw"
          icon={<ArrowUpFromLine className="size-4" />}
          label="Вывести"
          onDone={refreshAll}
          recordFn={recordFn}
        />
        <OpDialog
          type="adjustment"
          icon={<SlidersHorizontal className="size-4" />}
          label="Корректировка"
          onDone={refreshAll}
          recordFn={recordFn}
        />
      </div>
      <div className="bg-card rounded-2xl ring-1 ring-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/30">
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Тип</th>
              <th className="px-4 py-3 text-right">Сумма</th>
              <th className="px-4 py-3">Комментарий</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Загрузка...
                </td>
              </tr>
            )}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Операций ещё нет
                </td>
              </tr>
            )}
            {(data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 whitespace-nowrap">{r.operation_date}</td>
                <td className="px-4 py-3">
                  <OpBadge type={r.op_type} />
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    r.op_type === "withdraw" ? "text-destructive" : "text-emerald-600"
                  }`}
                >
                  {r.op_type === "withdraw" ? "−" : "+"}
                  {formatMoney(r.amount)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.note ?? "—"}</td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      if (!confirm("Удалить операцию?")) return;
                      try {
                        await deleteFn({ data: { id: r.id } });
                        toast.success("Удалено");
                        refreshAll();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Ошибка");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpBadge({ type }: { type: "deposit" | "withdraw" | "adjustment" }) {
  const map = {
    deposit: { label: "Пополнение", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    withdraw: { label: "Вывод", cls: "bg-red-500/10 text-red-700 dark:text-red-400" },
    adjustment: { label: "Корректировка", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  } as const;
  const it = map[type];
  return <span className={`px-2 py-1 rounded-md text-xs font-medium ${it.cls}`}>{it.label}</span>;
}

function OpDialog({
  type,
  label,
  icon,
  onDone,
  recordFn,
}: {
  type: "deposit" | "withdraw" | "adjustment";
  label: string;
  icon: React.ReactNode;
  onDone: () => void;
  recordFn: ReturnType<typeof useServerFn<typeof recordCompanyFundsOperation>>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = Number(amount.replace(",", "."));
    if (!isFinite(n) || n <= 0) {
      toast.error("Введите положительную сумму");
      return;
    }
    setBusy(true);
    try {
      await recordFn({
        data: { op_type: type, amount: n, operation_date: date, note: note || undefined },
      });
      toast.success("Сохранено");
      setOpen(false);
      setAmount("");
      setNote("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={type === "withdraw" ? "outline" : "default"}>
          {icon}
          <span className="ml-2">{label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} средств компании</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Сумма (₽)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Дата</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Комментарий</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpensesTab() {
  const listFn = useServerFn(listCompanyExpenses);
  const recordFn = useServerFn(recordCompanyExpense);
  const deleteFn = useServerFn(deleteCompanyExpense);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["cf-expenses"],
    queryFn: () => listFn(),
  });

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayKey());
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["cf-expenses"] });
    qc.invalidateQueries({ queryKey: ["cf-summary"] });
    qc.invalidateQueries({ queryKey: ["cf-timeline"] });
  };

  const submit = async () => {
    const n = Number(amount.replace(",", "."));
    if (!category.trim()) return toast.error("Укажите категорию");
    if (!isFinite(n) || n <= 0) return toast.error("Введите сумму");
    setBusy(true);
    try {
      await recordFn({
        data: {
          category: category.trim(),
          amount: n,
          expense_date: date,
          description: desc || undefined,
        },
      });
      toast.success("Сохранено");
      setOpen(false);
      setCategory("");
      setAmount("");
      setDesc("");
      refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4 mr-2" />
            Добавить расход
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Расход компании</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Категория</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Зарплата, аренда, реклама..."
              />
            </div>
            <div>
              <Label>Сумма (₽)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Дата</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Описание</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-card rounded-2xl ring-1 ring-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/30">
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Категория</th>
              <th className="px-4 py-3 text-right">Сумма</th>
              <th className="px-4 py-3">Описание</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Загрузка...
                </td>
              </tr>
            )}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Расходов ещё нет
                </td>
              </tr>
            )}
            {(data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 whitespace-nowrap">{r.expense_date}</td>
                <td className="px-4 py-3 font-medium">{r.category}</td>
                <td className="px-4 py-3 text-right text-destructive font-semibold">
                  −{formatMoney(r.amount)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.description ?? "—"}</td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      if (!confirm("Удалить расход?")) return;
                      try {
                        await deleteFn({ data: { id: r.id } });
                        toast.success("Удалено");
                        refreshAll();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Ошибка");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvestorBreakdownTab({
  rows,
}: {
  rows: Array<{
    id: string;
    name: string;
    isActive: boolean;
    shareRate: number;
    capital: number;
    contributed: number;
    inUse: number;
    idle: number;
    loadPct: number;
    investorEarned: number;
    companyEarnedFromInvestor: number;
  }>;
}) {
  return (
    <div className="bg-card rounded-2xl ring-1 ring-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/30">
            <th className="px-4 py-3">Инвестор</th>
            <th className="px-4 py-3 text-right">Внесено</th>
            <th className="px-4 py-3 text-right">В обороте</th>
            <th className="px-4 py-3 text-right">Простаивает</th>
            <th className="px-4 py-3 text-right">Загрузка</th>
            <th className="px-4 py-3 text-right">Заработал инвестор</th>
            <th className="px-4 py-3 text-right">Заработала компания</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                Инвесторов ещё нет
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const loadColor =
              r.loadPct >= 80
                ? "text-emerald-600"
                : r.loadPct >= 40
                  ? "text-amber-600"
                  : "text-destructive";
            return (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name}</div>
                  {!r.isActive && (
                    <div className="text-[10px] uppercase text-muted-foreground">неактивен</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{formatMoney(r.capital)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(r.inUse)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {formatMoney(r.idle)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold ${loadColor}`}>
                  {r.loadPct.toFixed(0)}%
                </td>
                <td className="px-4 py-3 text-right">{formatMoney(r.investorEarned)}</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                  {formatMoney(r.companyEarnedFromInvestor)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ForecastTab({
  summary,
}: {
  summary:
    | {
        forecast: { d30: number; d60: number; d90: number; own: number; investor: number; overdue: number };
      }
    | undefined;
}) {
  if (!summary) return <p className="text-sm text-muted-foreground">Загрузка...</p>;
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <KPI label="К получению — 30 дн." value={formatMoney(summary.forecast.d30)} tone="success" />
        <KPI label="К получению — 60 дн." value={formatMoney(summary.forecast.d60)} tone="success" />
        <KPI label="К получению — 90 дн." value={formatMoney(summary.forecast.d90)} tone="success" />
      </div>
      <div className="bg-card rounded-2xl ring-1 ring-border p-6">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
          Источник риска (90 дней)
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <Flow label="Свои средства" value={summary.forecast.own} />
          <Flow label="Средства инвесторов" value={summary.forecast.investor} />
          <Flow label="Просрочка сейчас" value={summary.forecast.overdue} tone="danger" />
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const getFn = useServerFn(getCompanyFundsMinReserve);
  const setFn = useServerFn(setCompanyFundsMinReserve);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["cf-reserve"], queryFn: () => getFn() });
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data && !val) setVal(String(data.reserve));
  }, [data, val]);

  const save = async () => {
    const n = Number(val.replace(",", "."));
    if (!isFinite(n) || n < 0) return toast.error("Введите 0 или положительное число");
    setBusy(true);
    try {
      await setFn({ data: { reserve: n } });
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["cf-reserve"] });
      qc.invalidateQueries({ queryKey: ["cf-summary"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl ring-1 ring-border p-6 max-w-lg space-y-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Резерв ликвидности
        </h3>
        <p className="text-sm text-muted-foreground">
          Минимальная сумма свободных средств компании. Если свободно меньше — будет показано предупреждение.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={isLoading}
          placeholder="0"
        />
        <Button onClick={save} disabled={busy || isLoading}>
          {busy ? "..." : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}

export { Wallet };