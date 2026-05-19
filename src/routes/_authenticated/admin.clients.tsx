import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminListClients } from "@/lib/admin.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/clients")({
  component: ClientsPage,
});

function ClientsPage() {
  const fn = useServerFn(adminListClients);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["admin-clients"], queryFn: () => fn() });
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          База
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Клиенты</h1>
      </div>
      <div className="bg-card rounded-2xl ring-1 ring-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead className="text-center">Контрактов</TableHead>
              <TableHead className="text-center">Активных</TableHead>
              <TableHead className="text-right">Долг</TableHead>
              <TableHead>Регистрация</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Загрузка...</TableCell></TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Нет клиентов</TableCell></TableRow>
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
                  <TableCell className="text-center">{c.contracts_count}</TableCell>
                  <TableCell className="text-center">{c.active_count}</TableCell>
                  <TableCell className="text-right font-bold">{formatMoney(Number(c.total_debt))}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{formatDate(c.created_at)}</TableCell>
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
    </div>
  );
}
