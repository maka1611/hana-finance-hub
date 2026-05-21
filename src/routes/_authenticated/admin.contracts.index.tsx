import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminListContracts } from "@/lib/admin.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type StatusFilter = "all" | "active" | "overdue" | "closed" | "pending";

export const Route = createFileRoute("/_authenticated/admin/contracts/")({
  component: ContractsPage,
});

function ContractsPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const fn = useServerFn(adminListContracts);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-contracts", status],
    queryFn: () => fn({ data: { status } }),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Портфель
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Контракты</h1>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="all">Все</TabsTrigger>
          <TabsTrigger value="active">Активные</TabsTrigger>
          <TabsTrigger value="overdue">Просрочка</TabsTrigger>
          <TabsTrigger value="closed">Закрытые</TabsTrigger>
          <TabsTrigger value="pending">Ожидают</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="bg-card rounded-2xl ring-1 ring-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Клиент</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead className="text-right">Цена</TableHead>
              <TableHead className="text-right">Платёж/мес</TableHead>
              <TableHead className="text-center">Срок</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Открыт</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Загрузка...</TableCell></TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Нет контрактов</TableCell></TableRow>
            ) : (
              (data ?? []).map((r) => {
                const prof = (r as { profile?: { full_name?: string; email?: string } }).profile;
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell>
                      <Link to="/admin/contracts/$id" params={{ id: r.id }} className="block">
                        <div className="font-medium">{prof?.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{prof?.email ?? ""}</div>
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{r.product_name}</TableCell>
                    <TableCell className="text-right">{formatMoney(Number(r.total_sale_price))}</TableCell>
                    <TableCell className="text-right font-bold">{formatMoney(Number(r.monthly_payment))}</TableCell>
                    <TableCell className="text-center">{r.term_months} мес</TableCell>
                    <TableCell><StatusPill status={r.status} /></TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{formatDate(r.start_date)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-primary/10 text-primary",
    closed: "bg-muted text-muted-foreground",
    overdue: "bg-destructive/10 text-destructive",
    pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  };
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}
