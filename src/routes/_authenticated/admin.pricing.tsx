import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  adminBulkAdjustMarkupRate,
  adminListUserRates,
  adminSetDefaultMarkupRate,
  adminSetUserMarkupRate,
} from "@/lib/pricing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Percent, Save, RotateCcw, Pencil, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/pricing")({
  head: () => ({ meta: [{ title: "Тарификация — Админка" }] }),
  component: PricingPage,
});

type Scope = "all" | "custom_only" | "default_only";

function fmtRate(r: number | null | undefined) {
  if (r == null) return "—";
  return `${(r * 100).toFixed(2)}%`;
}

function PricingPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListUserRates);
  const setDefaultFn = useServerFn(adminSetDefaultMarkupRate);
  const setUserFn = useServerFn(adminSetUserMarkupRate);
  const bulkFn = useServerFn(adminBulkAdjustMarkupRate);

  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-rates", search],
    queryFn: () => listFn({ data: { search } }),
  });

  const defaultRate = data?.defaultRate ?? 0.045;
  const [defaultPct, setDefaultPct] = useState<string>("");
  const defaultPctValue =
    defaultPct === "" ? +(defaultRate * 100).toFixed(2) : Number(defaultPct);

  const [delta, setDelta] = useState<string>("0.5");
  const [scope, setScope] = useState<Scope>("all");
  const [confirmBulk, setConfirmBulk] = useState(false);

  const setDefaultMut = useMutation({
    mutationFn: (rate: number) => setDefaultFn({ data: { rate } }),
    onSuccess: () => {
      toast.success("Ставка по умолчанию обновлена");
      setDefaultPct("");
      qc.invalidateQueries({ queryKey: ["admin-user-rates"] });
      qc.invalidateQueries({ queryKey: ["my-effective-markup-rate"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const setUserMut = useMutation({
    mutationFn: (vars: { userId: string; rate: number | null }) =>
      setUserFn({ data: vars }),
    onSuccess: () => {
      toast.success("Ставка пользователя обновлена");
      qc.invalidateQueries({ queryKey: ["admin-user-rates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const bulkMut = useMutation({
    mutationFn: (vars: { deltaPercentPoints: number; scope: Scope }) =>
      bulkFn({ data: vars }),
    onSuccess: (r) => {
      const parts: string[] = [];
      if (r.defaultUpdated)
        parts.push(
          `по умолчанию ${(r.prevDefault * 100).toFixed(2)}% → ${(r.nextDefault * 100).toFixed(2)}%`,
        );
      if (r.usersAffected > 0) parts.push(`персональных: ${r.usersAffected}`);
      toast.success(`Готово: ${parts.join(", ") || "без изменений"}`);
      setConfirmBulk(false);
      qc.invalidateQueries({ queryKey: ["admin-user-rates"] });
      qc.invalidateQueries({ queryKey: ["my-effective-markup-rate"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const deltaNum = Number(delta);
  const deltaValid = Number.isFinite(deltaNum) && deltaNum !== 0;
  const customCount = useMemo(
    () => (data?.users ?? []).filter((u) => u.personalRate != null).length,
    [data],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Настройки
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Percent className="size-7" /> Тарификация
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Управление месячной наценкой: общая ставка по умолчанию, персональные ставки клиентов и
          массовое изменение.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl ring-1 ring-border p-5 space-y-4">
          <div>
            <h2 className="font-bold">Ставка по умолчанию</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Применяется к пользователям без персональной ставки. Текущее значение:{" "}
              <span className="font-mono font-bold text-foreground">
                {fmtRate(defaultRate)}
              </span>
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Новое значение, % в месяц</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={defaultPct === "" ? (defaultRate * 100).toFixed(2) : defaultPct}
                onChange={(e) => setDefaultPct(e.target.value)}
              />
            </div>
            <Button
              disabled={
                setDefaultMut.isPending ||
                !Number.isFinite(defaultPctValue) ||
                defaultPctValue < 0 ||
                defaultPctValue > 100
              }
              onClick={() => setDefaultMut.mutate(defaultPctValue / 100)}
            >
              <Save className="size-4 mr-1" /> Сохранить
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-2xl ring-1 ring-border p-5 space-y-4">
          <div>
            <h2 className="font-bold">Массовое изменение</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Прибавляет или вычитает указанное число процентных пунктов. Персональные ставки
              сдвигаются на ту же величину независимо от их текущего значения.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Дельта, пп (напр. +0.5 или -0.25)</Label>
              <Input
                type="number"
                step="0.05"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Применить к</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всем (дефолт + персональные)</SelectItem>
                  <SelectItem value="default_only">Только ставке по умолчанию</SelectItem>
                  <SelectItem value="custom_only">Только персональным</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!deltaValid || bulkMut.isPending}
              onClick={() => setConfirmBulk(true)}
            >
              Применить
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Персональных ставок сейчас: <b>{customCount}</b>
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <h2 className="font-bold">Персональные ставки</h2>
          <Input
            placeholder="Поиск по имени, email, телефону..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Пользователь</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Действующая ставка</TableHead>
                <TableHead>Персональная</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : (data?.users ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Никого не нашли
                  </TableCell>
                </TableRow>
              ) : (
                (data?.users ?? []).map((u) => (
                  <UserRateRow
                    key={u.id}
                    user={u}
                    defaultRate={defaultRate}
                    onSave={(rate) => setUserMut.mutate({ userId: u.id, rate })}
                    saving={setUserMut.isPending}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите массовое изменение</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Дельта:{" "}
                  <b>
                    {deltaNum > 0 ? "+" : ""}
                    {deltaNum} пп
                  </b>
                </div>
                <div>
                  Область:{" "}
                  <b>
                    {scope === "all"
                      ? "дефолт + персональные"
                      : scope === "default_only"
                        ? "только дефолт"
                        : "только персональные"}
                  </b>
                </div>
                {(scope === "all" || scope === "default_only") && (
                  <div>
                    Ставка по умолчанию:{" "}
                    <span className="font-mono">{fmtRate(defaultRate)}</span> →{" "}
                    <span className="font-mono font-bold">
                      {fmtRate(
                        Math.min(1, Math.max(0, defaultRate + deltaNum / 100)),
                      )}
                    </span>
                  </div>
                )}
                {(scope === "all" || scope === "custom_only") && (
                  <div>
                    Будут изменены персональные ставки у <b>{customCount}</b> пользователей.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                bulkMut.mutate({ deltaPercentPoints: deltaNum, scope })
              }
            >
              Применить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserRateRow({
  user,
  defaultRate,
  onSave,
  saving,
}: {
  user: {
    id: string;
    fullName: string | null;
    email: string | null;
    personalRate: number | null;
    effectiveRate: number;
  };
  defaultRate: number;
  onSave: (rate: number | null) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>("");

  const start = () => {
    setVal(((user.personalRate ?? defaultRate) * 100).toFixed(2));
    setEditing(true);
  };

  const commit = () => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return;
    }
    onSave(n / 100);
    setEditing(false);
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{user.fullName ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground text-sm">{user.email ?? "—"}</TableCell>
      <TableCell className="font-mono">{fmtRate(user.effectiveRate)}</TableCell>
      <TableCell>
        {user.personalRate == null ? (
          <Badge variant="secondary">по умолчанию</Badge>
        ) : (
          <Badge>персональная</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {editing ? (
          <div className="flex justify-end items-center gap-2">
            <Input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="w-24"
              autoFocus
            />
            <span className="text-xs text-muted-foreground">%</span>
            <Button size="sm" variant="default" disabled={saving} onClick={commit}>
              <Check className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex justify-end items-center gap-2">
            {user.personalRate != null && (
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => onSave(null)}
                title="Сбросить к ставке по умолчанию"
              >
                <RotateCcw className="size-3.5 mr-1" /> Сбросить
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={start}>
              <Pencil className="size-3.5 mr-1" /> Изменить
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}