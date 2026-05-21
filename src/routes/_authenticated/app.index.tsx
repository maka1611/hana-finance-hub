import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyDashboard } from "@/lib/installments.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Calendar,
  Wallet,
  Clock,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Личный кабинет — NoorPay" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fn = useServerFn(getMyDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["my-dashboard"], queryFn: () => fn() });
  const router = useRouter();

  const nextPayment = data?.nextPayment ?? null;
  const totalRemaining = data?.totalRemaining ?? 0;
  const activeCount = data?.activeCount ?? 0;
  const pendingApps = data?.pendingApplicationsCount ?? 0;
  const upcoming = data?.upcomingPayments ?? [];
  const activeContracts = data?.activeContracts ?? [];

  return (
    <div className="space-y-6 md:space-y-8 w-full min-w-0 overflow-hidden">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Обзор
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Личный кабинет</h1>
      </div>

      <div className="grid min-w-0 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Clock className="size-4" />}
          label="Ближайший платёж"
          value={nextPayment ? formatMoney(nextPayment.amount) : "—"}
          hint={
            nextPayment
              ? `${formatDate(nextPayment.dueDate)}${nextPayment.overdue ? " · просрочен" : ""}`
              : "Нет активных платежей"
          }
          tone={nextPayment?.overdue ? "danger" : "default"}
          onClick={() => router.navigate({ to: "/app/installments" })}
        />
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Остаток к выплате"
          value={formatMoney(totalRemaining)}
          hint="По всем активным рассрочкам"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="Активные рассрочки"
          value={String(activeCount)}
          hint={activeCount === 0 ? "Пока пусто" : "Открытые контракты"}
          onClick={
            activeCount > 0 ? () => router.navigate({ to: "/app/installments" }) : undefined
          }
        />
        <StatCard
          icon={<Calendar className="size-4" />}
          label="Заявки на рассмотрении"
          value={String(pendingApps)}
          hint={pendingApps === 0 ? "Нет ожидающих" : "Ждут решения"}
          muted={pendingApps === 0}
        />
      </div>

      <div className="grid min-w-0 lg:grid-cols-2 gap-6">
        <div className="min-w-0">
          <h2 className="text-lg font-bold mb-4">Ближайшие платежи</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : upcoming.length === 0 ? (
            <div className="bg-card rounded-2xl ring-1 ring-border p-8 text-center text-sm text-muted-foreground">
              Нет предстоящих платежей
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((p) => (
                <Link
                  key={p.id}
                  to="/app/installments/$id"
                  params={{ id: p.contractId }}
                  className={`block rounded-xl ring-1 p-4 transition-colors ${
                    p.overdue
                      ? "bg-destructive/5 ring-destructive/30 hover:bg-destructive/10"
                      : "bg-card ring-border hover:bg-muted/40"
                  }`}
                >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-4 min-w-0">
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-1.5">
                        {p.overdue && (
                          <AlertTriangle className="size-3.5 text-destructive shrink-0" />
                        )}
                        {p.productName}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        Платёж №{p.seq} · {formatDate(p.dueDate)}
                      </div>
                    </div>
                    <div className={`font-bold shrink-0 ${p.overdue ? "text-destructive" : ""}`}>
                      {formatMoney(p.amount)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h2 className="text-lg font-bold mb-4">Мои рассрочки</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : activeContracts.length === 0 ? (
            <div className="bg-card rounded-2xl ring-1 ring-border p-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                У вас пока нет активных рассрочек
              </p>
              <Button onClick={() => router.navigate({ to: "/app/new" })}>
                Подать первую заявку
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeContracts.map((c) => {
                const pct = c.total > 0 ? Math.round((c.paid / c.total) * 100) : 0;
                return (
                  <Link
                    key={c.id}
                    to="/app/installments/$id"
                    params={{ id: c.id }}
                    className="block bg-card hover:bg-muted/40 rounded-xl ring-1 ring-border p-4 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4 mb-2 min-w-0">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{c.productName}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          Оплачено {c.paid} из {c.total}
                        </div>
                      </div>
                      <div className="sm:text-right shrink-0">
                        <div className="font-bold text-sm">
                          {formatMoney(c.monthlyPayment)}/мес
                        </div>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
  muted = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
  muted?: boolean;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "danger"
      ? "bg-destructive/5 ring-destructive/30"
      : muted
        ? "bg-card/60 ring-border/60"
        : "bg-card ring-border";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`text-left w-full rounded-2xl ring-1 p-5 transition-colors ${toneClass} ${
        onClick ? "hover:bg-muted/40 cursor-pointer" : ""
      }`}
    >
      <div
        className={`flex items-center gap-2 text-xs font-mono uppercase tracking-wider mb-2 ${
          tone === "danger" ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {icon} {label}
      </div>
      <div
        className={`text-2xl font-extrabold ${
          tone === "danger" ? "text-destructive" : muted ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Tag>
  );
}
