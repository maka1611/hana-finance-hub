import { Link, useRouterState } from "@tanstack/react-router";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Users, FileText, BarChart3, ArrowLeft, Wallet, ShieldCheck, Inbox, FilePlus2 } from "lucide-react";

const items = [
  { title: "Обзор", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Заявки", url: "/admin/applications", icon: Inbox, exact: false },
  { title: "Оформить рассрочку", url: "/admin/installments/new", icon: FilePlus2, exact: false },
  { title: "Клиенты", url: "/admin/clients", icon: Users, exact: false },
  { title: "Контракты", url: "/admin/contracts", icon: FileText, exact: false },
  { title: "Платежи", url: "/admin/payments", icon: Wallet, exact: false },
  { title: "Аналитика", url: "/admin/analytics", icon: BarChart3, exact: false },
  { title: "Пользователи", url: "/admin/users", icon: ShieldCheck, exact: false },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string, exact: boolean) =>
    exact ? pathname === url : pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border h-16 flex items-center justify-center">
        <Link to="/admin" className="font-extrabold text-lg tracking-tighter uppercase">
          {collapsed ? (
            <span className="text-primary">N</span>
          ) : (
            <>Noor<span className="text-primary">Admin</span></>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Управление</SidebarGroupLabel>
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/app" className="flex items-center gap-2 text-muted-foreground">
                    <ArrowLeft className="h-4 w-4" />
                    {!collapsed && <span>В ЛК клиента</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
