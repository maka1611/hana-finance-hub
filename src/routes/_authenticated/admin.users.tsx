import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { adminListUsers, adminSetUserRole, getMyRoles } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Crown, ShieldCheck, Briefcase, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Пользователи — Админка" }] }),
  component: UsersPage,
});

const ROLES = [
  { value: "manager" as const, label: "Менеджер", icon: Briefcase },
  { value: "admin" as const, label: "Админ", icon: ShieldCheck },
  { value: "owner" as const, label: "Владелец", icon: Crown },
];

function UsersPage() {
  const listFn = useServerFn(adminListUsers);
  const setRoleFn = useServerFn(adminSetUserRole);
  const myRolesFn = useServerFn(getMyRoles);
  const qc = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
  });
  const { data: myRoles } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => myRolesFn(),
  });
  const iAmOwner = (myRoles ?? []).includes("owner");

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) =>
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q),
    );
  }, [users, search]);

  const mutation = useMutation({
    mutationFn: (vars: { userId: string; role: "manager" | "admin" | "owner"; grant: boolean }) =>
      setRoleFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Роль обновлена");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Ошибка"),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Доступы
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Пользователи и роли</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Назначайте роли менеджеров и администраторов.{" "}
          {iAmOwner ? "Вы — владелец и можете назначать любые роли." : "Назначать admin/owner может только владелец."}
        </p>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Поиск по email или имени..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Текущие роли</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Загрузка...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Нет пользователей</TableCell></TableRow>
            ) : (
              filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {u.full_name ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{u.email ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">client</span>}
                      {u.roles.map((r) => (
                        <Badge key={r} variant={r === "owner" ? "default" : "secondary"}>{r}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2 flex-wrap">
                      {ROLES.map((R) => {
                        const has = u.roles.includes(R.value);
                        const restricted = (R.value === "admin" || R.value === "owner") && !iAmOwner;
                        return (
                          <Button
                            key={R.value}
                            size="sm"
                            variant={has ? "default" : "outline"}
                            disabled={restricted || mutation.isPending}
                            onClick={() =>
                              mutation.mutate({ userId: u.id, role: R.value, grant: !has })
                            }
                          >
                            <R.icon className="h-3.5 w-3.5 mr-1" />
                            {has ? `Снять ${R.label.toLowerCase()}` : R.label}
                          </Button>
                        );
                      })}
                    </div>
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