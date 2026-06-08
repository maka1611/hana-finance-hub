import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminStats } from "@/lib/admin.functions";
import { formatMoney } from "@/lib/installment";
import { TrendingUp, Users, AlertTriangle, Wallet, FileText, Calendar, CalendarClock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const fn = useServerFn(adminStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
            Обзор
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">Дашборд</h1>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Портфель" value={formatMoney(data.portfolio)} icon={<Wallet className="size-4" />} highlight />
            <Stat label="Клиенты" value={String(data.clientsCount)} icon={<Users className="size-4" />} />
            <Stat label="Контракты" value={String(data.contractsTotal)} icon={<FileText className="size-4" />} />
            <Stat label="Прибыль (наценка)" value={formatMoney(data.totalMarkup)} icon={<TrendingUp className="size-4" />} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Активные" value={String(data.contractsActive)} icon={<TrendingUp className="size-4 text-primary" />} />
            <Stat label="Закрытые" value={String(data.contractsClosed)} icon={<CheckCircle2 className="size-4 text-muted-foreground" />} />
            <Stat label="Просроченные" value={String(data.contractsOverdue)} tone="danger" icon={<AlertTriangle className="size-4" />} />
            <Stat label="Собрано платежей" value={formatMoney(data.paymentsCollected)} icon={<Wallet className="size-4" />} />
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <Stat label="К оплате сегодня" value={formatMoney(data.duesToday)} icon={<Calendar className="size-4" />} highlight />
            <Stat label="К оплате за неделю" value={formatMoney(data.duesWeek)} icon={<CalendarClock className="size-4" />} />
            <Stat label="Просроченная задолженность" value={formatMoney(data.overdueAmount)} tone="danger" icon={<AlertTriangle className="size-4" />} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label, value, icon, highlight, tone,
}: { label: string; value: string; icon: React.ReactNode; highlight?: boolean; tone?: "danger" }) {
  return (
    <div className={`rounded-2xl p-5 ring-1 ${
      highlight ? "bg-primary text-primary-foreground ring-transparent" :
      tone === "danger" ? "bg-destructive/5 ring-destructive/20" :
      "bg-card ring-border"
    }`}>
      <div className={`flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest mb-2 ${highlight ? "opacity-70" : "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
