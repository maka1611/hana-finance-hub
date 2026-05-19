import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyInstallments } from "@/lib/installments.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { FileCheck2, TrendingUp, Calendar, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Личный кабинет — NoorPay" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fn = useServerFn(listMyInstallments);
  const { data, isLoading } = useQuery({ queryKey: ["my-installments"], queryFn: () => fn() });
  const router = useRouter();

  const contracts = data ?? [];
  const active = contracts.filter((c) => c.status === "active");
  const totalDebt = active.reduce(
    (s, c) => s + Number(c.principal) + Number(c.markup_amount),
    0,
  );
  const monthlyTotal = active.reduce((s, c) => s + Number(c.monthly_payment), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Обзор
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight">Личный кабинет</h1>
        </div>
        <Button onClick={() => router.navigate({ to: "/app/new" })}>
          <FileCheck2 className="size-4" /> Подать заявку
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="Активных рассрочек"
          value={String(active.length)}
        />
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Долг к оплате"
          value={formatMoney(totalDebt)}
        />
        <StatCard
          icon={<Calendar className="size-4" />}
          label="Ежемесячно"
          value={formatMoney(monthlyTotal)}
        />
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4">Последние рассрочки</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : contracts.length === 0 ? (
          <div className="bg-card rounded-2xl ring-1 ring-border p-10 text-center">
            <p className="text-muted-foreground mb-4">У вас пока нет рассрочек</p>
            <Button onClick={() => router.navigate({ to: "/app/new" })}>
              Подать первую заявку
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {contracts.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to="/app/installments/$id"
                params={{ id: c.id }}
                className="block bg-card hover:bg-muted/40 rounded-xl ring-1 ring-border p-4 transition-colors"
              >
                <div className="flex justify-between items-center gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.product_name}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {formatDate(c.start_date)} · {c.term_months} мес
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatMoney(Number(c.monthly_payment))}/мес</div>
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-2xl ring-1 ring-border p-5">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
        {icon} {label}
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-primary/10 text-primary",
    closed: "bg-muted text-muted-foreground",
    overdue: "bg-destructive/10 text-destructive",
    pending: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    active: "активна",
    closed: "закрыта",
    overdue: "просрочена",
    pending: "ожидает",
  };
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 ${map[status] ?? ""}`}>
      {label[status] ?? status}
    </span>
  );
}
