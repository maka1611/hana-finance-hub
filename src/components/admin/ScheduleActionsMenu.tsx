import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminRecordPayment,
  adminReschedulePayment,
  adminCarryOverRemainder,
  adminCloseScheduleManually,
} from "@/lib/admin.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";

export type ScheduleLike = {
  id: string;
  due_date: string;
  amount: number | string;
  paid_amount: number | string;
  carried_in: number | string;
  carried_out: number | string;
  status: string;
};

export function ScheduleActionsMenu({
  row,
  onChanged,
  triggerLabel,
}: {
  row: ScheduleLike;
  onChanged: () => void;
  triggerLabel?: string;
}) {
  const recordFn = useServerFn(adminRecordPayment);
  const rescheduleFn = useServerFn(adminReschedulePayment);
  const carryFn = useServerFn(adminCarryOverRemainder);
  const closeFn = useServerFn(adminCloseScheduleManually);

  const due = Number(row.amount) + Number(row.carried_in) - Number(row.carried_out);
  const paid = Number(row.paid_amount);
  const remaining = Math.max(0, due - paid);

  const [busy, setBusy] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {triggerLabel ? (
            <Button variant="outline" size="sm" disabled={busy}>
              {triggerLabel}
            </Button>
          ) : (
            <Button variant="outline" size="icon" disabled={busy}>
              <MoreVertical className="size-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={closedLike || remaining <= 0}
            onClick={() =>
              wrap(
                () =>
                  recordFn({
                    data: { scheduleId: row.id, amount: remaining, method: "cash" },
                  }),
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
              setPartialOpen(true);
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
            onClick={() => wrap(() => closeFn({ data: { scheduleId: row.id } }), "Платёж закрыт")}
          >
            Закрыть вручную
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={partialOpen} onOpenChange={setPartialOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Частичная оплата</DialogTitle>
            <DialogDescription>Остаток к оплате: {formatMoney(remaining)}</DialogDescription>
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
            <Button variant="outline" onClick={() => setPartialOpen(false)}>
              Отмена
            </Button>
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
                  setPartialOpen(false);
                }, "Платёж принят")
              }
            >
              Принять
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Например: просьба клиента"
              />
            </div>
            <div>
              <Label>Комментарий</Label>
              <Textarea
                value={reschedComment}
                onChange={(e) => setReschedComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>
              Отмена
            </Button>
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
              <Select
                value={carryMode}
                onValueChange={(v) => setCarryMode(v as typeof carryMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
            <Button variant="outline" onClick={() => setCarryOpen(false)}>
              Отмена
            </Button>
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
    </>
  );
}