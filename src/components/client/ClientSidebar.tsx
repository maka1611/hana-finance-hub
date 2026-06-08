import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  List,
  User,
  FilePlus2,
  ShieldCheck,
  LogOut,
  Calculator as CalculatorIcon,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

const baseItems = [
  { title: "Обзор", url: "/app", icon: LayoutDashboard, exact: true },
  { title: "Калькулятор", url: "/app/calculator", icon: CalculatorIcon, exact: false },
  { title: "Мои рассрочки", url: "/app/installments", icon: List, exact: false },
  { title: "Профиль", url: "/app/profile", icon: User, exact: false },
];

export function ClientSidebar({
  isStaff,
  showInvestorCabinet = true,
}: {
  isStaff: boolean;
  showInvestorCabinet?: boolean;
}) {
  // Fallback: query roles directly from supabase so the admin link
  // appears even if the getMyRoles serverFn fails (e.g. expired token).
  const [clientIsStaff, setClientIsStaff] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      if (cancelled) return;
      const roles = (data ?? []).map((r) => r.role as string);
      setClientIsStaff(
        roles.includes("manager") || roles.includes("admin") || roles.includes("owner"),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const staff = isStaff || clientIsStaff;
  const items = [
    ...baseItems,
    ...(showInvestorCabinet
      ? [{ title: "Кабинет инвестора", url: "/app/investor", icon: TrendingUp, exact: false }]
      : []),
  ];
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const isActive = (url: string, exact: boolean) =>
    exact ? pathname === url : pathname.startsWith(url);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b border-sidebar-border h-16 flex items-center justify-center">
        <Link to="/app" className="font-extrabold text-lg tracking-tighter uppercase">
          Noor<span className="text-primary">Pay</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link
                  to="/app/new"
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-800 text-white hover:bg-emerald-900 transition-colors shadow-md py-3 px-4 font-semibold text-sm"
                >
                  <FilePlus2 className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Подать заявку</span>}
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Кабинет</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => (
                <SidebarMenuItem key={it.url}>
                  <SidebarMenuButton asChild isActive={isActive(it.url, it.exact)}>
                    <Link to={it.url} className="flex items-center gap-2">
                      <it.icon className="h-4 w-4" />
                      {!collapsed && <span>{it.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {staff && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/admin" className="flex items-center gap-2 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                  {!collapsed && <span>В админку</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Выйти</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}