import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Home, Plus, List, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyRoles } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const rolesFn = useServerFn(getMyRoles);
  const { data: roles } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const isStaff = (roles ?? []).some((r) => r === "manager" || r === "admin" || r === "owner");
  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="font-extrabold text-xl tracking-tighter uppercase">
              Noor<span className="text-primary">Pay</span>
            </Link>
            <div className="hidden md:flex items-center gap-1 text-sm">
              <Link
                to="/app"
                activeOptions={{ exact: true }}
                activeProps={{ className: "bg-muted" }}
                className="px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-muted transition-colors"
              >
                <Home className="size-3.5" /> Обзор
              </Link>
              <Link
                to="/app/installments"
                activeProps={{ className: "bg-muted" }}
                className="px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-muted transition-colors"
              >
                <List className="size-3.5" /> Рассрочки
              </Link>
              <Link
                to="/app/new"
                activeProps={{ className: "bg-muted" }}
                className="px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-muted transition-colors"
              >
                <Plus className="size-3.5" /> Новая
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isStaff && (
              <Link
                to="/admin"
                className="text-sm font-semibold px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="size-3.5" /> Админка
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="size-4" /> Выйти
            </Button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
