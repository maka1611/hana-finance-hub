import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyInstallments } from "@/lib/installments.functions";
import { formatMoney, formatDate } from "@/lib/installment";

export const Route = createFileRoute("/_authenticated/app/installments/")({
  head: () => ({ meta: [{ title: "Мои рассрочки — NoorPay" }] }),
  component: InstallmentsPage,
});

function InstallmentsPage() {
  const fn = useServerFn(listMyInstallments);
  const { data, isLoading } = useQuery({ queryKey: ["my-installments"], queryFn: () => fn() });
  const contracts = data ?? [];
  return (
    <div className="space-y-6 w-full min-w-0 overflow-hidden">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Контракты
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Мои рассрочки</h1>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : contracts.length === 0 ? (
        <p className="text-muted-foreground">Нет рассрочек</p>
      ) : (
        <div className="min-w-0 bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
          {contracts.map((c) => (
            <Link
              key={c.id}
              to="/app/installments/$id"
              params={{ id: c.id }}
              className="block p-5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4 min-w-0">
                <div className="min-w-0 w-full">
                  <div className="font-bold text-lg leading-snug break-words">{c.product_name}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-1 break-words">
                    Открыто {formatDate(c.start_date)} · {c.term_months} мес · наценка{" "}
                    {formatMoney(Number(c.markup_amount))}
                  </div>
                </div>
                <div className="sm:text-right shrink-0">
                  <div className="font-extrabold text-lg">
                    {formatMoney(Number(c.total_sale_price))}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {formatMoney(Number(c.monthly_payment))} / мес
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
