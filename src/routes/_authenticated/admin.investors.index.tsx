import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listInvestors, getInvestorsAggregate } from "@/lib/investors.functions";
import {
  getInvestorAllocationPolicy,
  setInvestorAllocationPolicy,
} from "@/lib/investors.functions";
import {
  adminGetInvestmentSettings,
  adminListInvestorApplications,
  adminSetInvestmentSettings,
  adminUpdateInvestorApplication,
} from "@/lib/investor-portal.functions";
import { formatMoney } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Briefcase, Plus, AlertTriangle, Settings2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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

  const today = Date.now();

  const totals = data.reduce(
    (acc, inv) => {
      acc.invested += inv.invested;
      acc.placed += inv.placed;
      acc.free += inv.free;
      acc.totalMarkup += inv.totalMarkup;
      acc.expectedProfit += inv.expectedProfit;
      acc.receivedProfit += inv.receivedProfit;
      acc.contractsCount += inv.contractsCount;
      acc.activeCount += inv.activeCount;
      acc.overdueCount += inv.overdueCount;
      acc.overdueAmount += inv.overdueAmount;
      if (inv.is_active) acc.activeInvestors += 1;
      else acc.archivedInvestors += 1;
      return acc;
    },
    {
      invested: 0, placed: 0, free: 0, totalMarkup: 0, expectedProfit: 0,
      receivedProfit: 0, contractsCount: 0, activeCount: 0,
      overdueCount: 0, overdueAmount: 0, activeInvestors: 0, archivedInvestors: 0,
    },
  );

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

      <InvestmentIntakeBlock />

      {data.length > 0 && (
        <div className="rounded-2xl bg-card ring-1 ring-border p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-bold">
              Общая сводка
              <span className="text-muted-foreground font-normal ml-2">
                · {data.length} инвестор(ов)
                {totals.archivedInvestors > 0 && <> · {totals.activeInvestors} активн.</>}
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Всего вложено" value={formatMoney(totals.invested)} />
            <Stat label="Размещено" value={formatMoney(totals.placed)} />
            <Stat label="Свободно" value={formatMoney(totals.free)} highlight />
            <Stat label="Общая наценка" value={formatMoney(totals.totalMarkup)} />
            <Stat label="Ожид. прибыль" value={formatMoney(totals.expectedProfit)} />
            <Stat label="Получено прибыли" value={formatMoney(totals.receivedProfit)} />
            <Stat label="Контрактов" value={`${totals.activeCount} акт / ${totals.contractsCount}`} />
            <Stat
              label="Просрочки"
              value={`${totals.overdueCount} · ${formatMoney(totals.overdueAmount)}`}
            />
          </div>
        </div>
      )}

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

function InvestmentIntakeBlock() {
  const qc = useQueryClient();
  const getSettings = useServerFn(adminGetInvestmentSettings);
  const setSettings = useServerFn(adminSetInvestmentSettings);
  const listApps = useServerFn(adminListInvestorApplications);
  const updateApp = useServerFn(adminUpdateInvestorApplication);

  const { data: settings } = useQuery({
    queryKey: ["investment-settings"],
    queryFn: () => getSettings(),
  });
  const { data: appsData } = useQuery({
    queryKey: ["investor-applications"],
    queryFn: () => listApps(),
  });

  const [enabled, setEnabled] = useState(false);
  const [minAmount, setMinAmount] = useState("0");
  const [cabinetPublic, setCabinetPublic] = useState(true);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setMinAmount(String(settings.minAmount));
      setCabinetPublic(settings.cabinetPublic);
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () =>
      setSettings({
        data: { enabled, minAmount: Number(minAmount) || 0, cabinetPublic },
      }),
    onSuccess: () => {
      toast.success("Настройки сохранены");
      qc.invalidateQueries({ queryKey: ["investment-settings"] });
      qc.invalidateQueries({ queryKey: ["my-investor-flag"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; status: "approved" | "rejected" | "pending"; adminNote: string }) =>
      updateApp({ data: vars }),
    onSuccess: () => {
      toast.success("Заявка обновлена");
      qc.invalidateQueries({ queryKey: ["investor-applications"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const apps = appsData?.applications ?? [];
  const pending = apps.filter((a) => a.status === "pending");

  return (
    <div className="rounded-2xl bg-card ring-1 ring-border p-5 space-y-5">
      <div>
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Settings2 className="size-4" /> Приём инвестиций
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Управление кнопкой «Кабинет инвестора» для всех пользователей.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm font-medium">
            {enabled ? "Заявки принимаются" : "Заявки закрыты"}
          </span>
        </label>
        <div className="space-y-1">
          <Label className="text-xs">Минимальная сумма заявки, ₽</Label>
          <Input
            type="number"
            min={0}
            step="1000"
            className="w-48"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <Switch checked={cabinetPublic} onCheckedChange={setCabinetPublic} />
          <span className="text-sm font-medium">
            {cabinetPublic
              ? "Кнопка видна всем пользователям"
              : "Кнопка видна только инвесторам"}
          </span>
        </label>
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          Сохранить
        </Button>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-sm font-bold">
          Заявки на инвестиции{" "}
          <span className="text-muted-foreground font-normal">
            · всего {apps.length}
            {pending.length > 0 && ` · на рассмотрении ${pending.length}`}
          </span>
        </h3>
        {apps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Заявок пока нет.</p>
        ) : (
          <div className="space-y-2">
            {apps.map((a) => (
              <ApplicationRow
                key={a.id}
                app={a}
                onUpdate={(status, adminNote) =>
                  updateMut.mutate({ id: a.id, status, adminNote })
                }
                saving={updateMut.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApplicationRow({
  app,
  onUpdate,
  saving,
}: {
  app: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    amount: number | string;
    desired_monthly_rate: number | string;
    term_months: number | null;
    comment: string | null;
    status: string;
    admin_note: string | null;
    created_at: string;
  };
  onUpdate: (status: "approved" | "rejected" | "pending", note: string) => void;
  saving: boolean;
}) {
  const [note, setNote] = useState(app.admin_note ?? "");
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-left"
      >
        <div className="min-w-0">
          <div className="font-semibold truncate">{app.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {app.phone || app.email || "—"} ·{" "}
            {new Date(app.created_at).toLocaleDateString("ru-RU")}
          </div>
        </div>
        <div className="text-sm font-bold">{formatMoney(Number(app.amount))}</div>
        <div className="text-xs text-muted-foreground">
          {Number(app.desired_monthly_rate).toFixed(2)}%/мес
          {app.term_months ? ` · ${app.term_months} мес` : ""}
        </div>
        <StatusBadge status={app.status} />
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {app.comment && (
            <div className="text-sm">
              <div className="text-xs text-muted-foreground mb-1">Комментарий клиента</div>
              <div>{app.comment}</div>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Комментарий менеджера (виден клиенту)</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={saving}
              onClick={() => onUpdate("approved", note)}
            >
              Одобрить
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={saving}
              onClick={() => onUpdate("rejected", note)}
            >
              Отклонить
            </Button>
            {app.status !== "pending" && (
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => onUpdate("pending", note)}
              >
                Вернуть на рассмотрение
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-emerald-600">одобрена</Badge>;
  if (status === "rejected") return <Badge variant="destructive">отклонена</Badge>;
  return <Badge variant="secondary">на рассмотрении</Badge>;
}