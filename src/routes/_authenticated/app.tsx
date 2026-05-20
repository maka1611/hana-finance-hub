import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Home, FileCheck2, List, ShieldCheck, User } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyRoles } from "@/lib/admin.functions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const rolesFn = useServerFn(getMyRoles);
  const { data: roles } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const isStaff = (roles ?? []).some((r) => r === "manager" || r === "admin" || r === "owner");
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null } | null>(null);

  // Track navigation depth to decide slide direction
  const ROUTE_DEPTH: Record<string, number> = {
    "/app": 0,
    "/app/installments": 1,
    "/app/new": 1,
    "/app/profile": 1,
  };
  const prevDepthRef = useRef<number>(ROUTE_DEPTH[location.pathname] ?? 1);
  const currentDepth = (() => {
    if (ROUTE_DEPTH[location.pathname] !== undefined) return ROUTE_DEPTH[location.pathname];
    // Deeper detail routes like /app/installments/:id
    return location.pathname.split("/").filter(Boolean).length - 1;
  })();
  const direction = currentDepth >= prevDepthRef.current ? 1 : -1;
  useEffect(() => {
    prevDepthRef.current = currentDepth;
  }, [currentDepth]);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      setProfile({
        full_name:
          data?.full_name ??
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        email: data?.email ?? user.email ?? null,
      });
    })();
  }, []);
  const displayName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "Пользователь";
  const initials = (profile?.full_name || profile?.email || "U")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };
  return (
    <div className="min-h-screen bg-background pb-safe">
      <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between px-safe">
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
                <FileCheck2 className="size-3.5" /> Заявка
              </Link>
              <Link
                to="/app/profile"
                activeProps={{ className: "bg-muted" }}
                className="px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-muted transition-colors"
              >
                <User className="size-3.5" /> Профиль
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
            <div className="flex items-center gap-2.5 pl-2 pr-3 py-1 rounded-full bg-muted/60 border border-border/60">
              <Avatar className="size-7">
                <AvatarFallback className="text-[11px] font-semibold bg-primary/15 text-primary">
                  {initials || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-xs font-semibold truncate max-w-[160px]">{displayName}</span>
                {profile?.email && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                    {profile.email}
                  </span>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="size-4" /> Выйти
            </Button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-10 px-safe overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={location.pathname}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="page-transition"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
