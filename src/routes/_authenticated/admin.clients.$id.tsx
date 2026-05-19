import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  adminGetClient,
  adminUpdateClient,
  adminAddClientPhone,
  adminDeleteClientPhone,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate } from "@/lib/installment";
import { toast } from "sonner";
import {
  ArrowLeft, Mail, Phone, Plus, Trash2, Star, Award,
  CheckCircle2, AlertTriangle, Clock, User, Save,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/clients/$id")({
  head: () => ({ meta: [{ title: "Профиль клиента — Админка" }] }),
  component: ClientProfilePage,
});

const tierLabels: Record<string, { label: string; cls: string }> = {
  new: { label: "Новый клиент", cls: "bg-muted text-muted-foreground" },
  bronze: { label: "Bronze", cls: "bg-amber-700/15 text-amber-700" },
  silver: { label: "Silver", cls: "bg-slate-400/20 text-slate-500" },
  gold: { label: "Gold", cls: "bg-amber-400/15 text-amber-600" },
  platinum: { label: "Platinum", cls: "bg-primary/15 text-primary" },
};

function ClientProfilePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetClient);
  const updateFn = useServerFn(adminUpdateClient);
  const addPhoneFn = useServerFn(adminAddClientPhone);
  const delPhoneFn = useServerFn(adminDeleteClientPhone);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-client", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneLabel, setNewPhoneLabel] = useState("");

  useEffect(() => {
    if (data?.profile) {
      setFullName(data.profile.full_name ?? "");
      setEmail(data.profile.email ?? "");
      setPhone(data.profile.phone ?? "");
    }
  }, [data?.profile]);

  const save = useMutation({
    mutationFn: () => updateFn({ data: { id, fullName, email, phone } }),
    onSuccess: () => {
      toast.success("Профиль обновлён");
      qc.invalidateQueries({ queryKey: ["admin-client", id] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const addPhone = useMutation({
    mutationFn: () => addPhoneFn({ data: { userId: id, phone: newPhone, label: newPhoneLabel || null } }),
    onSuccess: () => {
      toast.success("Телефон добавлен");
      setNewPhone(""); setNewPhoneLabel("");
      qc.invalidateQueries({ queryKey: ["admin-client", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const delPhone = useMutation({
    mutationFn: (phoneId: string) => delPhoneFn({ data: { id: phoneId } }),
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["admin-client", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Загрузка...</p>;
  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to="/admin/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> К клиентам
        </Link>
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Клиент не найден"}</p>
      </div>
    );
  }

  const r = data.rating;
  const tier = tierLabels[r.tier];

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <Link to="/admin/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="size-4" /> К клиентам
        </Link>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">Клиент</p>
        <h1 className="text-3xl font-extrabold tracking-tight">{data.profile.full_name || "Без имени"}</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          {data.roles.length === 0 ? (
            <Badge variant="secondary">client</Badge>
          ) : (
            data.roles.map((r) => (
              <Badge key={r} variant={r === "owner" ? "default" : "secondary"}>{r}</Badge>
            ))
          )}
        </div>
      </div>

      {/* Карточка + рейтинг */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-card rounded-2xl ring-1 ring-border p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full bg-primary/15 text-primary font-bold text-xl flex items-center justify-center">
              {(data.profile.full_name || data.profile.email || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold truncate">{data.profile.full_name || "Без имени"}</div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="size-3.5" /> {data.profile.email ?? "—"}
              </div>
              {data.profile.phone && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="size-3.5" /> {data.profile.phone}
                </div>
              )}
              <div className="text-[11px] font-mono text-muted-foreground mt-1">
                Регистрация: {formatDate(data.profile.created_at)}
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">ФИО</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} placeholder="+7 ..." />
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="size-4" /> Сохранить изменения
          </Button>
        </div>

        <div className="bg-card rounded-2xl ring-1 ring-border p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Рейтинг</span>
            <Award className="size-4 text-primary" />
          </div>
          <div className="text-5xl font-extrabold">{r.score}<span className="text-xl text-muted-foreground">/100</span></div>
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map((i) => (
              <Star key={i} className={`size-5 ${i <= r.stars ? "fill-primary text-primary" : "text-muted"}`} />
            ))}
          </div>
          <div className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${tier.cls}`}>
            {tier.label}
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatBox icon={<CheckCircle2 className="size-4 text-emerald-600" />} label="Оплачено" value={`${r.paidCount}`} sub={formatMoney(r.paidAmount)} />
        <StatBox icon={<AlertTriangle className="size-4 text-destructive" />} label="Просрочено" value={`${r.overdueCount}`} sub={formatMoney(r.overdueAmount)} danger={r.overdueCount > 0} />
        <StatBox icon={<Clock className="size-4 text-muted-foreground" />} label="Предстоящие" value={`${r.pendingCount}`} sub={formatMoney(r.pendingAmount)} />
      </div>

      {/* Доп. телефоны */}
      <div className="bg-card rounded-2xl ring-1 ring-border p-6 space-y-4">
        <h2 className="font-bold">Дополнительные телефоны</h2>
        {data.phones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Не добавлены</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.phones.map((p) => (
              <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{p.phone}</div>
                  {p.label && <div className="text-xs text-muted-foreground">{p.label}</div>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => delPhone.mutate(p.id)} disabled={delPhone.isPending}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid md:grid-cols-[1fr_180px_auto] gap-2 pt-2 border-t border-border">
          <Input placeholder="+7 ..." value={newPhone} onChange={(e) => setNewPhone(e.target.value)} maxLength={50} />
          <Input placeholder="Метка" value={newPhoneLabel} onChange={(e) => setNewPhoneLabel(e.target.value)} maxLength={50} />
          <Button onClick={() => newPhone.trim() && addPhone.mutate()} disabled={addPhone.isPending || !newPhone.trim()}>
            <Plus className="size-4" /> Добавить
          </Button>
        </div>
      </div>

      {/* Заявки */}
      <div className="bg-card rounded-2xl ring-1 ring-border p-6 space-y-4">
        <h2 className="font-bold">Заявки</h2>
        {data.applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Заявок нет</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.applications.map((a) => (
              <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                <Link
                  to="/admin/applications/$id"
                  params={{ id: a.id }}
                  className="min-w-0 flex-1 hover:text-primary transition-colors"
                >
                  <div className="font-medium truncate">{a.product_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {formatDate(a.created_at)} · {formatMoney(Number(a.product_price))} · {a.term_months} мес
                  </div>
                </Link>
                <AppStatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Контракты */}
      <div className="bg-card rounded-2xl ring-1 ring-border p-6 space-y-4">
        <h2 className="font-bold">Рассрочки</h2>
        {data.contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Контрактов нет</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.contracts.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                <Link
                  to="/admin/contracts/$id"
                  params={{ id: c.id }}
                  className="min-w-0 flex-1 hover:text-primary transition-colors"
                >
                  <div className="font-medium truncate">{c.product_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {formatDate(c.start_date)} · {c.term_months} мес · {formatMoney(Number(c.monthly_payment))}/мес · <span className="uppercase">{c.status}</span>
                  </div>
                </Link>
                <div className="text-sm font-bold">{formatMoney(Number(c.total_sale_price))}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Платежи */}
      <div className="bg-card rounded-2xl ring-1 ring-border p-6 space-y-4">
        <h2 className="font-bold">История платежей</h2>
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Платежей нет</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.payments.slice(0, 30).map((p) => (
              <li key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="font-mono text-xs text-muted-foreground">{formatDate(p.paid_at)}</div>
                <div className="text-muted-foreground text-xs">{p.method ?? "—"}</div>
                <div className="font-bold">{formatMoney(Number(p.amount))}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatBox({ icon, label, value, sub, danger }: { icon: React.ReactNode; label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${danger ? "bg-destructive/5 ring-destructive/20" : "bg-card ring-border"}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
        {icon} {label}
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function AppStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "На рассмотрении", cls: "bg-amber-400/15 text-amber-700" },
    approved: { label: "Одобрена", cls: "bg-primary/15 text-primary" },
    rejected: { label: "Отклонена", cls: "bg-destructive/10 text-destructive" },
  };
  const v = map[status] ?? { label: status, cls: "bg-muted" };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${v.cls}`}>
      {v.label}
    </span>
  );
}

function _useUserIcon() { return User; }