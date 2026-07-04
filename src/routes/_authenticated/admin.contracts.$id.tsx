import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  adminGetContract,
  adminRecordPayment,
  adminUpdateContractStatus,
  adminDeleteContract,
  adminReschedulePayment,
  adminCarryOverRemainder,
  adminCloseScheduleManually,
  adminRestoreContract,
  getMyRoles,
} from "@/lib/admin.functions";
import { listInvestorsLite, setContractInvestor } from "@/lib/investors.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Briefcase, MoreVertical, Archive, RotateCcw } from "lucide-react";

type ScheduleRow = {
  id: string;
  seq: number;
  due_date: string;
  original_due_date: string | null;
  amount: number;
  paid_amount: number;
  carried_in: number;
  carried_out: number;
  carried_to_schedule_id: string | null;
  status: string;
};

type HistoryRow = {
  id: string;
  schedule_id: string;
  old_due_date: string;
  new_due_date: string;
  reason: string | null;
  comment: string | null;
  changed_at: string;
};

type CarryoverRow = {
  id: string;
  from_schedule_id: string;
  to_schedule_id: string | null;
  amount: number;
  mode: string;
  note: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидается",
  paid: "Оплачен",
  partial: "Частично оплачен",
  carried_over: "Остаток перенесён",
  rescheduled: "Перенесён",
  overdue: "Просрочен",
  closed_manual: "Закрыт вручную",
};

function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const label = overdue && status === "pending" ? "Просрочен" : STATUS_LABEL[status] ?? status;
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "paid"
      ? "default"
      : status === "partial" || status === "carried_over"
        ? "secondary"
        : overdue || status === "overdue"
          ? "destructive"
          : "outline";
  return <Badge variant={variant}>{label}</Badge>;
}

export const Route = createFileRoute("/_authenticated/admin/contracts/$id")({
  component: AdminContractDetail,
});

function AdminContractDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fn = useServerFn(adminGetContract);
  const recordFn = useServerFn(adminRecordPayment);
  const statusFn = useServerFn(adminUpdateContractStatus);
  const deleteFn = useServerFn(adminDeleteContract);
  const restoreFn = useServerFn(adminRestoreContract);
  const rolesFn = useServerFn(getMyRoles);
  const investorsFn = useServerFn(listInvestorsLite);
  const setInvFn = useServerFn(setContractInvestor);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-contract", id],
    queryFn: () => fn({ data: { id } }),
  });
  const { data: myRoles } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const isOwner = (myRoles ?? []).includes("owner");
  const { data: investors } = useQuery({
    queryKey: ["investors-lite"],
    queryFn: () => investorsFn(),
  });
  const [deleting, setDeleting] = useState(false);

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Загрузка...</p>;

  const { contract, schedule, profile, payments, history, carryovers } = data;
  const currentInvestor = (investors ?? []).find(
    (i) => i.id === (contract as { investor_id?: string | null }).investor_id,
  );

  const changeInvestor = async (val: string) => {
    try {
      await setInvFn({ data: { contract_id: id, investor_id: val || null } });
      toast.success("Инвестор обновлён");
      qc.invalidateQueries({ queryKey: ["admin-contract", id] });
      qc.invalidateQueries({ queryKey: ["investors"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-contract", id] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const changeStatus = async (s: string) => {
    try {
      await statusFn({ data: { id, status: s as "active" | "closed" | "overdue" | "pending" } });
      toast.success("Статус обновлён");
      qc.invalidateQueries({ queryKey: ["admin-contract", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFn({ data: { id } });
      toast.success("Контракт архивирован");
      qc.invalidateQueries({ queryKey: ["admin-contracts"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      navigate({ to: "/admin/contracts" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      setDeleting(false);
    }
  };

  const handleRestore = async () => {
    try {
      await restoreFn({ data: { id } });
      toast.success("Контракт восстановлен");
      qc.invalidateQueries({ queryKey: ["admin-contract", id] });
      qc.invalidateQueries({ queryKey: ["admin-contracts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div className="space-y-8">
      {(contract as { deleted_at?: string | null }).deleted_at && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
          <Archive className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-destructive">Контракт в архиве</div>
            <div className="text-muted-foreground">
              Удалён {formatDate((contract as { deleted_at: string }).deleted_at)}
              {(contract as { deleted_by_name?: string | null }).deleted_by_name
                ? ` пользователем ${(contract as { deleted_by_name: string }).deleted_by_name}`
                : ""}
              {(contract as { deleted_reason?: string | null }).deleted_reason
                ? ` · причина: ${(contract as { deleted_reason: string }).deleted_reason}`
                : ""}
            </div>
          </div>
          {isOwner && (
            <Button onClick={handleRestore} size="sm">
              <RotateCcw className="size-4 mr-2" /> Восстановить
            </Button>
          )}
        </div>
      )}
      <Link to="/admin/contracts" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-3.5" /> К контрактам
      </Link>

      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
            Контракт #{contract.id.slice(0, 8)}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">{contract.product_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Клиент:{" "}
            <Link
              to="/admin/clients/$id"
              params={{ id: contract.client_id }}
              className="text-foreground font-medium hover:text-primary underline-offset-4 hover:underline"
            >
              {profile?.full_name ?? "—"}
            </Link>
            {profile?.email && <> · {profile.email}</>}
            {profile?.phone && <> · {profile.phone}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Статус:</span>
          <Select value={contract.status} onValueChange={changeStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">ожидает</SelectItem>
              <SelectItem value="active">активна</SelectItem>
              <SelectItem value="overdue">просрочена</SelectItem>
              <SelectItem value="closed">закрыта</SelectItem>
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleting}>
                <Trash2 className="size-4" /> Удалить
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить контракт?</AlertDialogTitle>
                <AlertDialogDescription>
                  Контракт «{contract.product_name}» и все связанные платежи и график
                  будут безвозвратно удалены. Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Mini label="Цена товара" value={formatMoney(Number(contract.product_price))} />
        <Mini label="Первый взнос" value={formatMoney(Number(contract.down_payment))} />
        <Mini
          label={`Наценка ${(Number(contract.markup_rate) * 100).toFixed(2)}%/мес · ${contract.term_months} мес`}
          value={formatMoney(Number(contract.markup_amount))}
        />
        <Mini
          label="Итоговая наценка"
          value={`${(Number(contract.markup_rate) * Number(contract.term_months) * 100).toFixed(1)}%`}
        />
        <Mini label="Итоговая цена" value={formatMoney(Number(contract.total_sale_price))} highlight />
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border p-4 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Briefcase className="size-4 text-muted-foreground" />
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Инвестор:</span>
            {currentInvestor ? (
              <Link
                to="/admin/investors/$id"
                params={{ id: currentInvestor.id }}
                className="font-bold hover:text-primary underline-offset-4 hover:underline"
              >
                {currentInvestor.full_name}
              </Link>
            ) : (
              <span className="text-muted-foreground">— собственные средства —</span>
            )}
            {currentInvestor && (
              (() => {
                const c = contract as {
                  markup_amount: number | string;
                  investor_profit_amount?: number | string | null;
                  investor_profit_locked?: boolean | null;
                };
                const markup = Number(c.markup_amount);
                const investorProfit = c.investor_profit_locked
                  ? Number(c.investor_profit_amount ?? 0)
                  : markup * Number(currentInvestor.profit_share_rate);
                const ourProfit = markup - investorProfit;
                return (
                  <span className="text-xs text-muted-foreground">
                    · доля {(Number(currentInvestor.profit_share_rate) * 100).toFixed(0)}% ·
                    прибыль инвестора{c.investor_profit_locked ? " (фикс.)" : ""}{" "}
                    {formatMoney(investorProfit)} · наша{" "}
                    <span className={ourProfit < 0 ? "text-destructive font-semibold" : ""}>
                      {formatMoney(ourProfit)}
                    </span>
                  </span>
                );
              })()
            )}
          </div>
          <select
            value={(contract as { investor_id?: string | null }).investor_id ?? ""}
            onChange={(e) => changeInvestor(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— без инвестора —</option>
            {(investors ?? []).map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.full_name} · свободно {formatMoney(inv.free)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4">График платежей</h2>
        <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
          {(schedule as ScheduleRow[]).map((s) => (
            <ScheduleRowItem
              key={s.id}
              row={s}
              recordFn={recordFn}
              onChanged={refresh}
            />
          ))}
        </div>
      </div>

      {history && history.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4">История переносов даты</h2>
          <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
            {(history as HistoryRow[]).map((h) => {
              const sch = (schedule as ScheduleRow[]).find((s) => s.id === h.schedule_id);
              return (
                <div key={h.id} className="p-4 text-sm">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div>
                      <span className="font-semibold">Платёж №{sch?.seq ?? "?"}</span>
                      {" · "}
                      {formatDate(h.old_due_date)} → {formatDate(h.new_due_date)}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(h.changed_at)}</div>
                  </div>
                  {h.reason && <div className="text-xs mt-1">Причина: {h.reason}</div>}
                  {h.comment && <div className="text-xs text-muted-foreground mt-0.5">{h.comment}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {carryovers && carryovers.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4">История переносов остатка</h2>
          <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
            {(carryovers as CarryoverRow[]).map((c) => {
              const from = (schedule as ScheduleRow[]).find((s) => s.id === c.from_schedule_id);
              const to = (schedule as ScheduleRow[]).find((s) => s.id === c.to_schedule_id);
              const modeLabel =
                c.mode === "next" ? "на следующий" : c.mode === "distribute" ? "распределено" : "оставлен";
              return (
                <div key={c.id} className="p-4 text-sm">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div>
                      <span className="font-semibold">Платёж №{from?.seq ?? "?"}</span>
                      {" · "}
                      {formatMoney(Number(c.amount))} ({modeLabel}
                      {to ? ` → №${to.seq}` : ""})
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(c.created_at)}</div>
                  </div>
                  {c.note && <div className="text-xs text-muted-foreground mt-0.5">{c.note}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold mb-4">История платежей</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Платежей пока нет</p>
        ) : (
          <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-semibold text-sm">{formatDate(p.paid_at)}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.method ?? "—"}
                    {(p as { note?: string | null }).note ? ` · ${(p as { note?: string | null }).note}` : ""}
                  </div>
                </div>
                <div className="font-bold">{formatMoney(Number(p.amount))}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${highlight ? "bg-primary text-primary-foreground ring-transparent" : "bg-card ring-border"}`}>
      <div className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${highlight ? "opacity-70" : "text-muted-foreground"}`}>{label}</div>
      <div className="font-extrabold text-lg">{value}</div>
    </div>
  );
}

type RecordFn = (args: { data: { scheduleId: string; amount: number; method?: string; note?: string | null } }) => Promise<unknown>;

function ScheduleRowItem({
  row,
  recordFn,
  onChanged,
}: {
  row: ScheduleRow;
  recordFn: RecordFn;
  onChanged: () => void;
}) {
  const rescheduleFn = useServerFn(adminReschedulePayment);
  const carryFn = useServerFn(adminCarryOverRemainder);
  const closeFn = useServerFn(adminCloseScheduleManually);

  const today = new Date().toISOString().slice(0, 10);
  const due = Number(row.amount) + Number(row.carried_in) - Number(row.carried_out);
  const paid = Number(row.paid_amount);
  const remaining = Math.max(0, due - paid);
  const overdue = row.status === "pending" && row.due_date < today;

  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState<"full" | "partial" | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState(row.due_date);
  const [reason, setReason] = useState("");
  const [reschedComment, setReschedComment] = useState("");

  const [carryOpen, setCarryOpen] = useState(false);
  const [carryMode, setCarryMode] = useState<"next" | "distribute" | "keep">("next");
  const [carryNote, setCarryNote] = useState("");

  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const closedLike = row.status === "paid" || row.status === "closed_manual";

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-lg bg-muted flex items-center justify-center font-mono text-xs font-bold">
            {row.seq}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm">{formatDate(row.due_date)}</div>
            {row.original_due_date && row.original_due_date !== row.due_date && (
              <div className="text-[11px] text-muted-foreground">
                перенесён с {formatDate(row.original_due_date)}
              </div>
            )}
            <div className="mt-1"><StatusBadge status={row.status} overdue={overdue} /></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="font-bold">{formatMoney(due)}</div>
            <div className="text-[11px] text-muted-foreground">
              базовый {formatMoney(Number(row.amount))}
              {Number(row.carried_in) > 0 && <> · +перенос {formatMoney(Number(row.carried_in))}</>}
              {Number(row.carried_out) > 0 && <> · −перенос {formatMoney(Number(row.carried_out))}</>}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" disabled={busy}>
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={closedLike || remaining <= 0}
                onClick={() =>
                  wrap(
                    () => recordFn({ data: { scheduleId: row.id, amount: remaining, method: "cash" } }),
                    "Платёж принят",
                  )
                }
              >
                Принять оплату
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={closedLike || remaining <= 0}
                onClick={() => {
                  setPayAmount("");
                  setPayNote("");
                  setPayOpen("partial");
                }}
              >
                Частичная оплата
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={closedLike}
                onClick={() => {
                  setNewDate(row.due_date);
                  setReason("");
                  setReschedComment("");
                  setRescheduleOpen(true);
                }}
              >
                Перенести дату
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={closedLike || remaining <= 0}
                onClick={() => {
                  setCarryMode("next");
                  setCarryNote("");
                  setCarryOpen(true);
                }}
              >
                Перенести остаток
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={closedLike}
                onClick={() =>
                  wrap(() => closeFn({ data: { scheduleId: row.id } }), "Платёж закрыт")
                }
              >
                Закрыть вручную
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(paid > 0 || remaining < due) && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded bg-muted/40 px-2 py-1">
            <div className="text-muted-foreground">оплачено</div>
            <div className="font-semibold">{formatMoney(paid)}</div>
          </div>
          <div className="rounded bg-muted/40 px-2 py-1">
            <div className="text-muted-foreground">остаток</div>
            <div className="font-semibold">{formatMoney(remaining)}</div>
          </div>
          <div className="rounded bg-muted/40 px-2 py-1">
            <div className="text-muted-foreground">перенесено</div>
            <div className="font-semibold">{formatMoney(Number(row.carried_out))}</div>
          </div>
        </div>
      )}

      {/* Partial payment dialog */}
      <Dialog open={payOpen === "partial"} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Частичная оплата</DialogTitle>
            <DialogDescription>
              Остаток к оплате: {formatMoney(remaining)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Сумма, ₽</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                min={1}
                max={remaining}
              />
            </div>
            <div>
              <Label>Комментарий</Label>
              <Textarea value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Отмена</Button>
            <Button
              disabled={busy || !payAmount || Number(payAmount) <= 0}
              onClick={() =>
                wrap(async () => {
                  await recordFn({
                    data: {
                      scheduleId: row.id,
                      amount: Number(payAmount),
                      method: "cash",
                      note: payNote || null,
                    },
                  });
                  setPayOpen(null);
                }, "Платёж принят")
              }
            >
              Принять
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Перенести дату платежа</DialogTitle>
            <DialogDescription>Текущая дата: {formatDate(row.due_date)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Новая дата</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div>
              <Label>Причина *</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: просьба клиента" />
            </div>
            <div>
              <Label>Комментарий</Label>
              <Textarea value={reschedComment} onChange={(e) => setReschedComment(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Отмена</Button>
            <Button
              disabled={busy || !reason || !newDate}
              onClick={() =>
                wrap(async () => {
                  await rescheduleFn({
                    data: {
                      scheduleId: row.id,
                      newDueDate: newDate,
                      reason,
                      comment: reschedComment || null,
                    },
                  });
                  setRescheduleOpen(false);
                }, "Дата перенесена")
              }
            >
              Перенести
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carryover dialog */}
      <Dialog open={carryOpen} onOpenChange={setCarryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Перенести остаток</DialogTitle>
            <DialogDescription>
              Остаток: {formatMoney(remaining)}. Итоговая цена и наценка не изменяются.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Что сделать с остатком</Label>
              <Select value={carryMode} onValueChange={(v) => setCarryMode(v as typeof carryMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="next">Перенести на следующий месяц</SelectItem>
                  <SelectItem value="distribute">Распределить по оставшимся</SelectItem>
                  <SelectItem value="keep">Оставить на текущем платеже</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Комментарий</Label>
              <Textarea value={carryNote} onChange={(e) => setCarryNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCarryOpen(false)}>Отмена</Button>
            <Button
              disabled={busy}
              onClick={() =>
                wrap(async () => {
                  await carryFn({
                    data: {
                      scheduleId: row.id,
                      mode: carryMode,
                      note: carryNote || null,
                    },
                  });
                  setCarryOpen(false);
                }, "Готово")
              }
            >
              Применить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
