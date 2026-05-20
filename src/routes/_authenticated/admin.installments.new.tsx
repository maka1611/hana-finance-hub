import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { adminListClients, adminCreateInstallment } from "@/lib/admin.functions";
import { calcInstallment, formatMoney, MAX_TERM, DEFAULT_MARKUP_RATE } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Check, ChevronsUpDown, FilePlus2, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/installments/new")({
  component: AdminNewInstallment,
});

type Mode = "existing" | "new";

function AdminNewInstallment() {
  const navigate = useNavigate();
  const listFn = useServerFn(adminListClients);
  const createFn = useServerFn(adminCreateInstallment);
  const { data: clients } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: () => listFn(),
  });

  const [mode, setMode] = useState<Mode>("existing");
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState<number>(250000);
  const [downPayment, setDownPayment] = useState<number>(50000);
  const [termMonths, setTermMonths] = useState<number>(12);
  const [markupPct, setMarkupPct] = useState<number>(+(DEFAULT_MARKUP_RATE * 100).toFixed(2));
  const [firstPaymentDate, setFirstPaymentDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => (clients ?? []).find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  const calc = useMemo(
    () => calcInstallment({ productPrice, downPayment, termMonths, markupRate: markupPct / 100 }),
    [productPrice, downPayment, termMonths, markupPct],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) return toast.error("Укажите название товара");
    if (mode === "existing" && !clientId) return toast.error("Выберите клиента");
    if (mode === "new") {
      if (!newEmail.trim()) return toast.error("Email обязателен");
      if (!newName.trim()) return toast.error("ФИО обязательно");
      if (!newPhone.trim()) return toast.error("Телефон обязателен");
    }
    setLoading(true);
    try {
      const res = await createFn({
        data: {
          client:
            mode === "existing"
              ? { kind: "existing", id: clientId! }
              : { kind: "new", email: newEmail.trim(), fullName: newName.trim(), phone: newPhone.trim() },
          productName,
          productDescription: productDescription || null,
          productPrice,
          downPayment,
          termMonths,
          firstPaymentDate,
          clientComment: comment || null,
          markupRate: markupPct / 100,
        },
      });
      if (res.tempPassword) {
        toast.success("Клиент создан. Временный пароль: " + res.tempPassword, { duration: 15000 });
      } else {
        toast.success("Рассрочка оформлена");
      }
      navigate({ to: "/admin/contracts/$id", params: { id: res.contractId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка оформления");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Админ
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <FilePlus2 className="size-7" /> Оформление рассрочки
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Создание контракта напрямую, минуя поток заявок клиента.
        </p>
      </div>

      <form onSubmit={submit} className="bg-card rounded-2xl ring-1 ring-border p-6 md:p-8 space-y-6">
        <div className="space-y-3">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Клиент
          </h2>
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-lg">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={cn(
                "flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-md transition-colors",
                mode === "existing" ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <Users className="size-4" /> Существующий
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={cn(
                "flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-md transition-colors",
                mode === "new" ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <UserPlus className="size-4" /> Новый
            </button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <Label>Клиент</Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selected
                      ? `${selected.full_name ?? "Без имени"} — ${selected.email ?? "—"}`
                      : "Выберите клиента..."}
                    <ChevronsUpDown className="size-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Поиск по имени, email, телефону..." />
                    <CommandList>
                      <CommandEmpty>Не найдено</CommandEmpty>
                      <CommandGroup>
                        {(clients ?? []).map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.full_name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`}
                            onSelect={() => { setClientId(c.id); setOpen(false); }}
                          >
                            <Check className={cn("mr-2 size-4", clientId === c.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span className="font-medium">{c.full_name ?? "Без имени"}</span>
                              <span className="text-xs text-muted-foreground">
                                {c.email ?? "—"} {c.phone ? `· ${c.phone}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>ФИО</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Иванов Иван" required />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="client@mail.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Телефон</Label>
                  <Input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+7 ..."
                    required
                    inputMode="tel"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Будет создан аккаунт клиента. Временный пароль покажется после сохранения — передайте его клиенту.
              </p>
            </div>
          )}
        </div>

        <div className="h-px bg-border" />

        <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Товар и условия
        </h2>

        <div className="space-y-2">
          <Label>Название товара</Label>
          <Input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="iPhone 16 Pro"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Описание <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
          <Textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Сумма товара</Label>
            <Input
              type="number"
              value={productPrice || ""}
              onChange={(e) => setProductPrice(Number(e.target.value) || 0)}
              min={1}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Первый взнос</Label>
            <Input
              type="number"
              value={downPayment || ""}
              onChange={(e) => setDownPayment(Math.min(Number(e.target.value) || 0, productPrice))}
              min={0}
              max={productPrice}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Срок</Label>
              <span className="text-sm font-mono text-primary font-bold">{termMonths} мес</span>
            </div>
            <Slider
              min={1}
              max={MAX_TERM}
              step={1}
              value={[termMonths]}
              onValueChange={(v) => setTermMonths(v[0])}
            />
          </div>
          <div className="space-y-2">
            <Label>Дата первого платежа</Label>
            <Input
              type="date"
              value={firstPaymentDate}
              onChange={(e) => setFirstPaymentDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Комментарий <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
        </div>

        <div className="bg-muted/40 rounded-xl p-5 space-y-2 text-sm">
          <Row k="Остаток" v={formatMoney(calc.principal)} />
          <Row k="Наценка" v={formatMoney(calc.markupAmount)} />
          <Row k="Ежемесячный платёж" v={formatMoney(calc.monthlyPayment)} bold />
          <Row k="Итоговая цена" v={formatMoney(calc.totalSalePrice)} bold />
        </div>

        <Button type="submit" className="w-full py-6 text-base font-bold" disabled={loading}>
          <FilePlus2 className="size-4" />
          {loading ? "Оформление..." : "Оформить рассрочку"}
        </Button>
      </form>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{v}</span>
    </div>
  );
}