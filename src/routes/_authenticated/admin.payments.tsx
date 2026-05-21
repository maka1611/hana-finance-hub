import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminListPayments, adminMarkSchedulePaid } from "@/lib/admin.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "Платежи — Админка" }] }),
  component: PaymentsPage,
});

type StatusFilter = "all" | "pending" | "paid" | "overdue";

function PaymentsPage() {
  const listFn = useServerFn(adminListPayments);
  const markFn = useServerFn(adminMarkSchedulePaid);
  const qc = useQueryClient();

  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments", status, search, from, to],
    queryFn: () =>
      listFn({
        data: {
          status,
          search: search || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      }),
  });

  const mark = useMutation({
    mutationFn: (id: string) => markFn({ data: { scheduleId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      toast.success("Платёж отмечен оплаченным");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const items = data?.items ?? [];
  const kpi = data?.kpi;
  const aging = data?.aging;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Финансы
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Платежи</h1>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Clock} label="К оплате в этом месяце" value={formatMoney(kpi?.dueThisMonth ?? 0)} />
        <Kpi icon={AlertTriangle} label="Просрочка" value={formatMoney(kpi?.overdueAmount ?? 0)} sub={`${kpi?.overdueCount ?? 0} платежей`} danger />
        <Kpi icon={CheckCircle2} label="Поступило в этом месяце" value={formatMoney(kpi?.paidThisMonth ?? 0)} />
        <Kpi icon={Wallet} label="Всего записей" value={String(items.length)} />
      </div>

      {/* Aging */}
      <div className="bg-card rounded-2xl ring-1 ring-border p-5">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
          Структура просрочки (aging)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AgingCell label="0–7 дней" value={aging?.d0_7 ?? 0} />
          <AgingCell label="8–30 дней" value={aging?.d8_30 ?? 0} />
          <AgingCell label="31–60 дней" value={aging?.d31_60 ?? 0} />
          <AgingCell label="60+ дней" value={aging?.d60p ?? 0} danger />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Статус</label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="pending">Ожидают</SelectItem>
              <SelectItem value="overdue">Просрочены</SelectItem>
              <SelectItem value="paid">Оплачены</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">С даты</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">По дату</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1 flex-1 min-w-60">
          <label className="text-xs text-muted-foreground">Поиск</label>
          <Input placeholder="Клиент, email или товар..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl ring-1 ring-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead>№</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Загрузка...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Платежей нет</TableCell></TableRow>
            ) : (
              items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">{formatDate(s.due_date)}</TableCell>
                  <TableCell className="font-medium">{s.client_full_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.product_name}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">#{s.seq}</TableCell>
                  <TableCell className="text-right font-bold">{formatMoney(Number(s.amount))}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-right">
                    {s.status !== "paid" && (
                      <Button size="sm" onClick={() => mark.mutate(s.id)} disabled={mark.isPending}>
                        Отметить оплачено
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, danger }: { icon: React.ElementType; label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className={`bg-card rounded-2xl ring-1 p-4 ${danger ? "ring-destructive/40" : "ring-border"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-4 w-4 ${danger ? "text-destructive" : ""}`} />
        {label}
      </div>
      <div className={`text-2xl font-extrabold mt-2 ${danger ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function AgingCell({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="bg-muted/40 rounded-xl p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold mt-1 ${danger ? "text-destructive" : ""}`}>{formatMoney(value)}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") return <Badge className="bg-green-600 hover:bg-green-700">Оплачен</Badge>;
  if (status === "overdue") return <Badge variant="destructive">Просрочен</Badge>;
  return <Badge variant="secondary">Ожидает</Badge>;
}