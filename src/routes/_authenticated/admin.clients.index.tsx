import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminListClients, adminDeleteClient } from "@/lib/admin.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Star, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/clients/")({
  component: ClientsPage,
});

function ClientsPage() {
  const fn = useServerFn(adminListClients);
  const delFn = useServerFn(adminDeleteClient);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-clients"], queryFn: () => fn() });
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await delFn({ data: { id: toDelete.id } });
      toast.success("Клиент удалён");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка удаления");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
            База
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">Клиенты</h1>
        </div>
        <Button asChild>
          <Link to="/admin/installments/new">
            <Plus className="size-4" /> Оформить рассрочку
          </Link>
        </Button>
      </div>
      <div className="bg-card rounded-2xl ring-1 ring-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Рейтинг</TableHead>
              <TableHead className="text-right">Оплачено</TableHead>
              <TableHead className="text-center">Контрактов</TableHead>
              <TableHead className="text-right">Долг</TableHead>
              <TableHead>Регистрация</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">Загрузка...</TableCell></TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">Нет клиентов</TableCell></TableRow>
            ) : (
              (data ?? []).map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => navigate({ to: "/admin/clients/$id", params: { id: c.id } })}
                >
                  <TableCell className="font-medium text-primary">{c.full_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell>
                    <RatingCell score={c.rating_score} stars={c.rating_stars} overdue={c.overdue_count} />
                  </TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    {formatMoney(Number(c.paid_amount))}
                  </TableCell>
                  <TableCell className="text-center">{c.contracts_count}</TableCell>
                  <TableCell className="text-right font-bold">{formatMoney(Number(c.total_debt))}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setToDelete({ id: c.id, name: c.full_name ?? c.email ?? "клиента" })}
                      title="Удалить клиента"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Подсказка: в детальную карточку контракта можно перейти из{" "}
        <Link to="/admin/contracts" className="text-primary underline">раздела контрактов</Link>.
      </p>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить клиента?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет удалён <b>{toDelete?.name}</b> вместе со всеми его контрактами, графиками, платежами и заявками.
              Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RatingCell({
  score,
  stars,
  overdue,
}: {
  score: number | null;
  stars: number;
  overdue: number;
}) {
  if (score === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`size-3.5 ${
              i < stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
            }`}
          />
        ))}
        <span className="ml-1 text-xs font-mono font-semibold">{score}</span>
      </div>
      {overdue > 0 && (
        <span className="text-[10px] text-destructive font-medium">
          {overdue} просроч.
        </span>
      )}
    </div>
  );
}
