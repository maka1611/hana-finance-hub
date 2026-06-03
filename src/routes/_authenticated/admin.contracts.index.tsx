import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Archive, RotateCcw } from "lucide-react";
import { adminListContracts, adminRestoreContract, getMyRoles } from "@/lib/admin.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type StatusFilter = "all" | "active" | "overdue" | "closed" | "pending";

export const Route = createFileRoute("/_authenticated/admin/contracts/")({
  component: ContractsPage,
});

function ContractsPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fn = useServerFn(adminListContracts);
  const restoreFn = useServerFn(adminRestoreContract);
  const rolesFn = useServerFn(getMyRoles);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-contracts", status, showDeleted],
    queryFn: () => fn({ data: { status, includeDeleted: showDeleted } }),
  });
  const { data: myRoles } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const isOwner = (myRoles ?? []).includes("owner");

  const filtered = (data ?? []).filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const prof = (r as { profile?: { full_name?: string; email?: string } }).profile;
    return (
      (r.product_name ?? "").toLowerCase().includes(q) ||
      (prof?.full_name ?? "").toLowerCase().includes(q) ||
      (prof?.email ?? "").toLowerCase().includes(q)
    );
  });

  const handleRestore = async (id: string) => {
    try {
      await restoreFn({ data: { id } });
      toast.success("Контракт восстановлен");
      qc.invalidateQueries({ queryKey: ["admin-contracts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка восстановления");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
            Портфель
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">Контракты</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по клиенту или товару..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Button
            variant={showDeleted ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDeleted((v) => !v)}
          >
            <Archive className="size-4 mr-2" />
            {showDeleted ? "Скрыть удалённые" : "Показать удалённые / завершённые"}
          </Button>
        </div>
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
              {showDeleted && <TableHead>Удалён</TableHead>}
              {showDeleted && <TableHead className="w-[60px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={showDeleted ? 9 : 7} className="text-center text-muted-foreground py-10">Загрузка...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={showDeleted ? 9 : 7} className="text-center text-muted-foreground py-10">{searchQuery ? "Ничего не найдено" : "Нет контрактов"}</TableCell></TableRow>
            ) : (
              filtered.map((r) => {
                const prof = (r as { profile?: { full_name?: string; email?: string } }).profile;
                const isDeleted = !!(r as { deleted_at?: string | null }).deleted_at;
                const deletedByName = (r as { deleted_by_name?: string | null }).deleted_by_name ?? null;
                return (
                  <TableRow key={r.id} className={`cursor-pointer hover:bg-muted/40 ${isDeleted ? "opacity-60" : ""}`}>
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
                    <TableCell><StatusPill status={isDeleted ? "deleted" : r.status} /></TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{formatDate(r.start_date)}</TableCell>
                    {showDeleted && (
                      <TableCell className="text-xs">
                        {isDeleted ? (
                          <div>
                            <div className="font-mono text-muted-foreground">{formatDate((r as { deleted_at?: string }).deleted_at!)}</div>
                            <div className="text-muted-foreground">{deletedByName ?? "—"}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    {showDeleted && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isDeleted && isOwner ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-primary hover:bg-primary/10"
                            onClick={() => handleRestore(r.id)}
                            title="Восстановить контракт"
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    )}
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
    deleted: "bg-destructive/20 text-destructive",
  };
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${map[status] ?? ""}`}>
      {status === "deleted" ? "удалён" : status}
    </span>
  );
}
