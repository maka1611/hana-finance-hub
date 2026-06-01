import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyRoles } from "@/lib/admin.functions";
import { getMyInvestorFlag } from "@/lib/investor-portal.functions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ClientSidebar } from "@/components/client/ClientSidebar";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const location = useLocation();
  const rolesFn = useServerFn(getMyRoles);
  const { data: roles } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const isStaff = (roles ?? []).some((r) => r === "manager" || r === "admin" || r === "owner");
  const investorFlagFn = useServerFn(getMyInvestorFlag);
  const { data: investorFlag } = useQuery({
    queryKey: ["my-investor-flag"],
    queryFn: () => investorFlagFn(),
  });
  const showInvestorCabinet =
    !!investorFlag &&
    (investorFlag.cabinetPublic || investorFlag.isInvestor || investorFlag.wasInvestor);
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null } | null>(
    null,
  );

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ClientSidebar isStaff={isStaff} showInvestorCabinet={showInvestorCabinet} />
        <div className="min-w-0 flex-1 flex flex-col">
          <header className="min-h-16 pt-safe border-b border-border flex items-center px-4 gap-3 bg-background md:sticky md:top-0 z-30">
            <SidebarTrigger />
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground hidden sm:block">
              Личный кабинет
            </div>
            <div className="ml-auto flex items-center gap-2.5 pl-2 pr-3 py-1 rounded-full bg-muted/60 border border-border/60">
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
          </header>
          <main className="min-w-0 max-w-full flex-1 px-4 md:px-8 pt-8 pb-6 md:py-10 px-safe pb-safe overflow-x-hidden">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={location.pathname}
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="page-transition w-full min-w-0 max-w-7xl mx-auto overflow-hidden"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
