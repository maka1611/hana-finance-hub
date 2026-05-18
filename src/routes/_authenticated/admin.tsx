import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getMyRoles, adminMakeMeOwner } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Админка — NoorPay" }] }),
  component: AdminShell,
});

function AdminShell() {
  const rolesFn = useServerFn(getMyRoles);
  const { data: roles, isLoading, refetch } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => rolesFn(),
  });

  if (isLoading) {
    return <div className="p-10 text-sm text-muted-foreground">Проверка доступа...</div>;
  }

  const isStaff = (roles ?? []).some(
    (r) => r === "manager" || r === "admin" || r === "owner",
  );

  if (!isStaff) {
    return <NoAccess onPromoted={() => refetch()} />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b border-border flex items-center px-4 gap-3 bg-background sticky top-0 z-30">
            <SidebarTrigger />
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Панель администратора
            </div>
          </header>
          <main className="flex-1 p-8 bg-muted/20">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function NoAccess({ onPromoted }: { onPromoted: () => void }) {
  const promote = useServerFn(adminMakeMeOwner);
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try {
      await promote();
      toast.success("Вы стали владельцем");
      onPromoted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md bg-card rounded-2xl ring-1 ring-border p-8 text-center space-y-4">
        <div className="size-12 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="text-2xl font-extrabold">Доступ запрещён</h1>
        <p className="text-sm text-muted-foreground">
          У вас нет роли сотрудника. Если вы основатель проекта, назначьте себя владельцем —
          это возможно один раз, пока владелец ещё не назначен.
        </p>
        <Button onClick={handle} disabled={loading} className="w-full">
          {loading ? "..." : "Стать владельцем"}
        </Button>
      </div>
    </div>
  );
}
