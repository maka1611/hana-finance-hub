import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  getMyProfileFull,
  addMyPhone,
  deleteMyPhone,
  updateMyProfile,
} from "@/lib/applications.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/installment";
import { toast } from "sonner";
import {
  Phone,
  Plus,
  Trash2,
  Star,
  Mail,
  User,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Award,
} from "lucide-react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "Профиль — NoorPay" }] }),
  component: ProfilePage,
});

const tierLabels: Record<string, { label: string; cls: string }> = {
  new: { label: "Новый клиент", cls: "bg-muted text-muted-foreground" },
  bronze: { label: "Бронза", cls: "bg-amber-700/15 text-amber-700" },
  silver: { label: "Серебро", cls: "bg-slate-400/20 text-slate-500" },
  gold: { label: "Золото", cls: "bg-amber-400/15 text-amber-600" },
  platinum: { label: "Платина", cls: "bg-primary/15 text-primary" },
};

function ProfilePage() {
  const qc = useQueryClient();
  const fn = useServerFn(getMyProfileFull);
  const addPhoneFn = useServerFn(addMyPhone);
  const delPhoneFn = useServerFn(deleteMyPhone);
  const updateFn = useServerFn(updateMyProfile);
  const { data, isLoading } = useQuery({ queryKey: ["my-profile-full"], queryFn: () => fn() });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneLabel, setNewPhoneLabel] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  const changePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Пароль должен быть не короче 8 символов");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }
    setChangingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Пароль обновлён");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setChangingPwd(false);
    }
  };

  useEffect(() => {
    if (data?.profile) {
      setFullName(data.profile.full_name ?? "");
      setPhone(data.profile.phone ?? "");
    }
  }, [data?.profile]);

  const saveProfile = useMutation({
    mutationFn: () => updateFn({ data: { fullName, phone } }),
    onSuccess: () => {
      toast.success("Профиль обновлён");
      qc.invalidateQueries({ queryKey: ["my-profile-full"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  const addPhone = useMutation({
    mutationFn: () => addPhoneFn({ data: { phone: newPhone, label: newPhoneLabel || null } }),
    onSuccess: () => {
      toast.success("Телефон добавлен");
      setNewPhone("");
      setNewPhoneLabel("");
      qc.invalidateQueries({ queryKey: ["my-profile-full"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  const delPhone = useMutation({
    mutationFn: (id: string) => delPhoneFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["my-profile-full"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Загрузка...</p>;

  const r = data.rating;
  const tier = tierLabels[r.tier];

  return (
    <div className="space-y-6 md:space-y-8 w-full min-w-0 max-w-5xl overflow-hidden">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Аккаунт
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Профиль</h1>
      </div>

      {/* Карточка пользователя + рейтинг */}
      <div className="grid min-w-0 md:grid-cols-3 gap-4">
        <div className="min-w-0 md:col-span-2 bg-card rounded-2xl ring-1 ring-border p-4 md:p-6 space-y-4 overflow-hidden">
          <div className="flex items-center gap-3 md:gap-4 min-w-0 overflow-hidden">
            <div className="size-14 md:size-16 shrink-0 rounded-full bg-primary/15 text-primary font-bold text-xl flex items-center justify-center">
              {(data.profile?.full_name || data.profile?.email || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base md:text-lg font-bold leading-snug break-words">
                {data.profile?.full_name || "Без имени"}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                <Mail className="size-3.5 shrink-0" />{" "}
                <span className="min-w-0 break-all">{data.profile?.email ?? "—"}</span>
              </div>
              {data.profile?.phone && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                  <Phone className="size-3.5 shrink-0" />{" "}
                  <span className="min-w-0 break-all">{data.profile.phone}</span>
                </div>
              )}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">ФИО</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Основной телефон</Label>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                maxLength={50}
              />
            </div>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => saveProfile.mutate()}
            disabled={saveProfile.isPending}
          >
            <User className="size-4" /> Сохранить
          </Button>
        </div>

        <div className="min-w-0 bg-card rounded-2xl ring-1 ring-border p-4 md:p-6 space-y-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Рейтинг
            </span>
            <Award className="size-4 text-primary" />
          </div>
          <div className="text-5xl font-extrabold">
            {r.score}
            <span className="text-xl text-muted-foreground">/100</span>
          </div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={`size-5 ${i <= r.stars ? "fill-primary text-primary" : "text-muted"}`}
              />
            ))}
          </div>
          <div
            className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${tier.cls}`}
          >
            {tier.label}
          </div>
          <div className="text-xs text-muted-foreground pt-2 leading-relaxed break-words">
            Рейтинг рассчитывается из доли оплаченных платежей. Просрочки снижают его.
          </div>
        </div>
      </div>

      {/* Статистика по платежам */}
      <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <StatBox
          icon={<CheckCircle2 className="size-4 text-emerald-600" />}
          label="Оплачено"
          value={`${r.paidCount}`}
          sub={formatMoney(r.paidAmount)}
        />
        <StatBox
          icon={<AlertTriangle className="size-4 text-destructive" />}
          label="Просрочено"
          value={`${r.overdueCount}`}
          sub={formatMoney(r.overdueAmount)}
          danger={r.overdueCount > 0}
        />
        <StatBox
          icon={<Clock className="size-4 text-muted-foreground" />}
          label="Предстоящие"
          value={`${r.pendingCount}`}
        />
      </div>

      {/* Доп. телефоны */}
      <div className="min-w-0 bg-card rounded-2xl ring-1 ring-border p-4 md:p-6 space-y-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Дополнительные телефоны</h2>
        </div>
        {data.phones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока не добавлены</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.phones.map((p) => (
              <li key={p.id} className="py-3 flex items-center justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.phone}</div>
                  {p.label && (
                    <div className="text-xs text-muted-foreground truncate">{p.label}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => delPhone.mutate(p.id)}
                  disabled={delPhone.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid min-w-0 md:grid-cols-[minmax(0,1fr)_180px_auto] gap-2 pt-2 border-t border-border">
          <PhoneInput
            value={newPhone}
            onChange={setNewPhone}
            maxLength={50}
          />
          <Input
            placeholder="Метка (мама, работа)"
            value={newPhoneLabel}
            onChange={(e) => setNewPhoneLabel(e.target.value)}
            maxLength={50}
          />
          <Button
            className="w-full md:w-auto"
            onClick={() => newPhone.trim() && addPhone.mutate()}
            disabled={addPhone.isPending || !newPhone.trim()}
          >
            <Plus className="size-4" /> Добавить
          </Button>
        </div>
      </div>

      {/* Безопасность */}
      <div className="min-w-0 bg-card rounded-2xl ring-1 ring-border p-4 md:p-6 space-y-4 overflow-hidden">
        <h2 className="font-bold inline-flex items-center gap-2">
          <Lock className="size-4 text-primary" /> Безопасность
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Новый пароль</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              maxLength={100}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Повторите пароль</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              maxLength={100}
              autoComplete="new-password"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Минимум 8 символов.</p>
        <Button
          className="w-full sm:w-auto"
          onClick={changePassword}
          disabled={changingPwd || !newPassword || !confirmPassword}
        >
          <Lock className="size-4" /> Изменить пароль
        </Button>
      </div>
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  sub,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl p-4 ring-1 overflow-hidden ${danger ? "bg-destructive/5 ring-destructive/20" : "bg-card ring-border"}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 min-w-0">
        {icon} {label}
      </div>
      <div className="text-2xl font-extrabold truncate">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
