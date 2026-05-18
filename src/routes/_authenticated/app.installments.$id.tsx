import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getInstallmentById } from "@/lib/installments.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { ArrowLeft } from "lucide-react";

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

  const { contract, schedule } = data;
  const paid = schedule.filter((s) => s.status === "paid").length;
  const progress = schedule.length > 0 ? (paid / schedule.length) * 100 : 0;

  return (
    <div className="space-y-8">
      <Link
        to="/app/installments"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="size-3.5" /> К списку
      </Link>

      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Контракт #{contract.id.slice(0, 8)}
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight">{contract.product_name}</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-primary text-primary-foreground rounded-2xl p-6">
          <div className="opacity-60 text-xs font-bold uppercase tracking-widest mb-2">
            Ежемесячный платёж
          </div>
          <div className="text-4xl font-extrabold">
            {formatMoney(Number(contract.monthly_payment))}
          </div>
          <div className="mt-6 space-y-2 text-sm">
            <Row k="Цена товара" v={formatMoney(Number(contract.product_price))} />
            <Row k="Первый взнос" v={formatMoney(Number(contract.down_payment))} />
            <Row k="Наценка" v={formatMoney(Number(contract.markup_amount))} />
            <Row k="Итоговая цена" v={formatMoney(Number(contract.total_sale_price))} bold />
          </div>
        </div>

        <div className="bg-card rounded-2xl ring-1 ring-border p-6">
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
          <div className="mt-6 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Начало: {formatDate(contract.start_date)} · Срок: {contract.term_months} мес
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4">График платежей</h2>
        <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
          {schedule.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-4">
                <div className="size-9 rounded-lg bg-muted flex items-center justify-center font-mono text-xs font-bold">
                  {s.seq}
                </div>
                <div>
                  <div className="font-semibold text-sm">{formatDate(s.due_date)}</div>
                  <div className="text-xs text-muted-foreground capitalize">{s.status}</div>
                </div>
              </div>
              <div className="font-bold">{formatMoney(Number(s.amount))}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="opacity-60">{k}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{v}</span>
    </div>
  );
}
