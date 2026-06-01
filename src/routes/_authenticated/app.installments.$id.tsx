import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getInstallmentById } from "@/lib/installments.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидается",
  paid: "Оплачен",
  partial: "Частично оплачен",
  carried_over: "Остаток перенесён",
  rescheduled: "Перенесён",
  overdue: "Просрочен",
  closed_manual: "Закрыт вручную",
};

export const Route = createFileRoute("/_authenticated/app/installments/$id")({
  head: () => ({ meta: [{ title: "Рассрочка — NoorPay" }] }),
  component: InstallmentDetail,
});

function InstallmentDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getInstallmentById);
  const { data, isLoading } = useQuery({
    queryKey: ["installment", id],
    queryFn: () => fn({ data: { id } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Загрузка...</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Не найдено</p>;

  const { contract, schedule, payments, history, carryovers } = data;
  const paid = schedule.filter((s) => s.status === "paid").length;
  const progress = schedule.length > 0 ? (paid / schedule.length) * 100 : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 md:space-y-8 w-full min-w-0 overflow-hidden">
      <Link
        to="/app/installments"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="size-3.5" /> К списку
      </Link>

      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 break-words">
          Контракт #{contract.id.slice(0, 8)}
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight break-words">
          {contract.product_name}
        </h1>
      </div>

      <div className="grid min-w-0 md:grid-cols-2 gap-4">
        <div className="min-w-0 bg-primary text-primary-foreground rounded-2xl p-4 md:p-6 overflow-hidden">
          <div className="opacity-60 text-xs font-bold uppercase tracking-widest mb-2">
            Ежемесячный платёж
          </div>
          <div className="text-3xl md:text-4xl font-extrabold truncate">
            {formatMoney(Number(contract.monthly_payment))}
          </div>
          <div className="mt-6 space-y-2 text-sm">
            <Row k="Цена товара" v={formatMoney(Number(contract.product_price))} />
            <Row k="Первый взнос" v={formatMoney(Number(contract.down_payment))} />
            <Row k="Наценка" v={formatMoney(Number(contract.markup_amount))} />
            <Row k="Итоговая цена" v={formatMoney(Number(contract.total_sale_price))} bold />
          </div>
        </div>

        <div className="min-w-0 bg-card rounded-2xl ring-1 ring-border p-4 md:p-6 overflow-hidden">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
            Прогресс
          </div>
          <div className="text-3xl font-extrabold">
            {paid} / {schedule.length}
          </div>
          <div className="text-sm text-muted-foreground mt-1">платежей выполнено</div>
          <div className="h-2 bg-muted rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-6 text-xs font-mono uppercase tracking-wider text-muted-foreground break-words">
            Начало: {formatDate(contract.start_date)} · Срок: {contract.term_months} мес
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4">График платежей</h2>
        <div className="min-w-0 bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
          {schedule.map((s) => {
            const sRow = s as typeof s & {
              paid_amount?: number;
              carried_in?: number;
              carried_out?: number;
              original_due_date?: string | null;
            };
            const due =
              Number(sRow.amount) + Number(sRow.carried_in ?? 0) - Number(sRow.carried_out ?? 0);
            const paidAmt = Number(sRow.paid_amount ?? 0);
            const remaining = Math.max(0, due - paidAmt);
            const overdue = s.status === "pending" && s.due_date < today;
            return (
              <div key={s.id} className="p-4 min-w-0">
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-lg bg-muted flex items-center justify-center font-mono text-xs font-bold">
                      {s.seq}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{formatDate(s.due_date)}</div>
                      {sRow.original_due_date && sRow.original_due_date !== s.due_date && (
                        <div className="text-[11px] text-muted-foreground">
                          перенесён с {formatDate(sRow.original_due_date)}
                        </div>
                      )}
                      <div className="mt-1">
                        <Badge
                          variant={
                            s.status === "paid"
                              ? "default"
                              : s.status === "partial" || s.status === "carried_over"
                                ? "secondary"
                                : overdue
                                  ? "destructive"
                                  : "outline"
                          }
                        >
                          {overdue && s.status === "pending"
                            ? "Просрочен"
                            : (STATUS_LABEL[s.status] ?? s.status)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold">{formatMoney(due)}</div>
                    {Number(sRow.carried_in ?? 0) > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        базовый {formatMoney(Number(sRow.amount))} + перенос {formatMoney(Number(sRow.carried_in))}
                      </div>
                    )}
                    {paidAmt > 0 && s.status !== "paid" && (
                      <div className="text-[11px] text-muted-foreground">
                        оплачено {formatMoney(paidAmt)} · остаток {formatMoney(remaining)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {history && history.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4">История переносов даты</h2>
          <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
            {history.map((h) => {
              const sch = schedule.find((s) => s.id === h.schedule_id);
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

      {payments && payments.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4">История оплат</h2>
          <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
            {payments.map((p) => {
              const pn = (p as { note?: string | null }).note;
              return (
                <div key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-semibold text-sm">{formatDate(p.paid_at)}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.method ?? "—"}
                      {pn ? ` · ${pn}` : ""}
                    </div>
                  </div>
                  <div className="font-bold">{formatMoney(Number(p.amount))}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {carryovers && carryovers.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {carryovers.length} операций переноса остатка зарегистрировано — итоговая цена не изменилась.
        </div>
      )}
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3 min-w-0">
      <span className="opacity-60 min-w-0 truncate">{k}</span>
      <span className={`shrink-0 ${bold ? "font-bold" : "font-medium"}`}>{v}</span>
    </div>
  );
}
