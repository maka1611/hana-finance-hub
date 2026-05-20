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
import { Check, ChevronsUpDown, FilePlus2, UserPlus, Users, Plus, Trash2, FileText, ChevronDown, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContactChannelToggles, type ContactChannel } from "@/components/admin/ContactChannels";

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
  type PhoneRow = { phone: string; label: string; channels: ContactChannel[] };
  const [phones, setPhones] = useState<PhoneRow[]>([
    { phone: "", label: "Основной", channels: ["phone"] },
  ]);

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

  // Документы нового клиента
  const [docsOpen, setDocsOpen] = useState(false);
  const [passportSeries, setPassportSeries] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportIssuedBy, setPassportIssuedBy] = useState("");
  const [passportIssuedAt, setPassportIssuedAt] = useState("");
  const [driverLicenseNumber, setDriverLicenseNumber] = useState("");
  const [driverLicenseCategories, setDriverLicenseCategories] = useState("");
  const [driverLicenseIssuedAt, setDriverLicenseIssuedAt] = useState("");
  type PhotoFile = { fileName: string; contentType: string; dataBase64: string; previewUrl: string };
  const [passportPhoto, setPassportPhoto] = useState<PhotoFile | null>(null);
  const [driverLicensePhoto, setDriverLicensePhoto] = useState<PhotoFile | null>(null);

  const readFile = (file: File): Promise<PhotoFile> =>
    new Promise((resolve, reject) => {
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error("Файл больше 8 МБ"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const dataBase64 = result.split(",")[1] ?? "";
        resolve({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64,
          previewUrl: result,
        });
      };
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });

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
      if (!phones[0]?.phone.trim()) return toast.error("Телефон обязателен");
    }
    setLoading(true);
    try {
      const res = await createFn({
        data: {
          client:
            mode === "existing"
              ? { kind: "existing", id: clientId! }
              : {
                  kind: "new",
                  email: newEmail.trim(),
                  fullName: newName.trim(),
                  phone: phones[0].phone.trim(),
                },
          productName,
          productDescription: productDescription || null,
          productPrice,
          downPayment,
          termMonths,
          firstPaymentDate,
          clientComment: comment || null,
          markupRate: markupPct / 100,
          extraPhones:
            mode === "new"
              ? phones
                  .slice(1)
                  .filter((p) => p.phone.trim().length > 0)
                  .map((p) => ({
                    phone: p.phone.trim(),
                    label: p.label.trim() || null,
                    channels: p.channels,
                  }))
              : undefined,
          documents:
            mode === "new" && docsOpen
              ? {
                  passportSeries: passportSeries.trim() || null,
                  passportNumber: passportNumber.trim() || null,
                  passportIssuedBy: passportIssuedBy.trim() || null,
                  passportIssuedAt: passportIssuedAt || null,
                  driverLicenseNumber: driverLicenseNumber.trim() || null,
                  driverLicenseCategories: driverLicenseCategories.trim() || null,
                  driverLicenseIssuedAt: driverLicenseIssuedAt || null,
                  passportPhoto: passportPhoto
                    ? {
                        fileName: passportPhoto.fileName,
                        contentType: passportPhoto.contentType,
                        dataBase64: passportPhoto.dataBase64,
                      }
                    : null,
                  driverLicensePhoto: driverLicensePhoto
                    ? {
                        fileName: driverLicensePhoto.fileName,
                        contentType: driverLicensePhoto.contentType,
                        dataBase64: driverLicensePhoto.dataBase64,
                      }
                    : null,
                }
              : undefined,
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Телефоны для связи</Label>
                  <button
                    type="button"
                    onClick={() =>
                      setPhones((arr) => [...arr, { phone: "", label: "", channels: [] }])
                    }
                    className="text-xs font-semibold text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <Plus className="size-3.5" /> Добавить номер
                  </button>
                </div>
                {phones.map((row, idx) => (
                  <div key={idx} className="bg-muted/30 rounded-xl p-3 space-y-2 ring-1 ring-border">
                    <div className="grid grid-cols-[1fr_160px] gap-2">
                      <Input
                        value={row.phone}
                        onChange={(e) =>
                          setPhones((arr) =>
                            arr.map((p, i) => (i === idx ? { ...p, phone: e.target.value } : p)),
                          )
                        }
                        placeholder={idx === 0 ? "+7 ... (основной)" : "+7 ..."}
                        required={idx === 0}
                        inputMode="tel"
                      />
                      <Input
                        value={row.label}
                        onChange={(e) =>
                          setPhones((arr) =>
                            arr.map((p, i) => (i === idx ? { ...p, label: e.target.value } : p)),
                          )
                        }
                        placeholder="Комментарий"
                        maxLength={50}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <ContactChannelToggles
                        value={row.channels}
                        onChange={(v) =>
                          setPhones((arr) =>
                            arr.map((p, i) => (i === idx ? { ...p, channels: v } : p)),
                          )
                        }
                        size="sm"
                      />
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPhones((arr) => arr.filter((_, i) => i !== idx))
                          }
                          className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                        >
                          <Trash2 className="size-3.5" /> Удалить
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Подсветите иконки для предпочтительных способов связи: звонок, WhatsApp, Telegram.
                </p>
              </div>

              <div className="rounded-xl ring-1 ring-border bg-muted/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDocsOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <FileText className="size-4" />
                    Добавить документы
                    <span className="text-xs font-normal text-muted-foreground">
                      (паспорт и в/у — по желанию)
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("size-4 transition-transform", docsOpen && "rotate-180")}
                  />
                </button>
                {docsOpen && (
                  <div className="p-4 space-y-5 border-t border-border">
                    <div className="space-y-3">
                      <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                        Паспорт
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Серия</Label>
                          <Input
                            value={passportSeries}
                            onChange={(e) => setPassportSeries(e.target.value)}
                            maxLength={20}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Номер</Label>
                          <Input
                            value={passportNumber}
                            onChange={(e) => setPassportNumber(e.target.value)}
                            maxLength={20}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Кем выдан</Label>
                        <Input
                          value={passportIssuedBy}
                          onChange={(e) => setPassportIssuedBy(e.target.value)}
                          maxLength={300}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Дата выдачи</Label>
                        <Input
                          type="date"
                          value={passportIssuedAt}
                          onChange={(e) => setPassportIssuedAt(e.target.value)}
                        />
                      </div>
                      <PhotoPicker
                        label="Фото паспорта"
                        photo={passportPhoto}
                        onChange={setPassportPhoto}
                        readFile={readFile}
                      />
                    </div>

                    <div className="h-px bg-border" />

                    <div className="space-y-3">
                      <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                        Водительские права
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Номер</Label>
                          <Input
                            value={driverLicenseNumber}
                            onChange={(e) => setDriverLicenseNumber(e.target.value)}
                            maxLength={50}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Категории</Label>
                          <Input
                            value={driverLicenseCategories}
                            onChange={(e) => setDriverLicenseCategories(e.target.value)}
                            placeholder="B, C"
                            maxLength={50}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Дата выдачи</Label>
                        <Input
                          type="date"
                          value={driverLicenseIssuedAt}
                          onChange={(e) => setDriverLicenseIssuedAt(e.target.value)}
                        />
                      </div>
                      <PhotoPicker
                        label="Фото водительских прав"
                        photo={driverLicensePhoto}
                        onChange={setDriverLicensePhoto}
                        readFile={readFile}
                      />
                    </div>
                  </div>
                )}
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

        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <Label>Наценка в месяц</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={markupPct}
                onChange={(e) => setMarkupPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="w-24 text-right font-mono"
              />
              <span className="text-sm font-mono text-muted-foreground">% / мес</span>
            </div>
          </div>
          <Slider
            min={0}
            max={15}
            step={0.1}
            value={[markupPct]}
            onValueChange={(v) => setMarkupPct(+v[0].toFixed(2))}
          />
          <p className="text-[11px] text-muted-foreground">
            По умолчанию: {(DEFAULT_MARKUP_RATE * 100).toFixed(1)}%. Итоговая наценка = % × срок.
          </p>
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

function PhotoPicker({
  label,
  photo,
  onChange,
  readFile,
}: {
  label: string;
  photo: { fileName: string; contentType: string; dataBase64: string; previewUrl: string } | null;
  onChange: (
    p: { fileName: string; contentType: string; dataBase64: string; previewUrl: string } | null,
  ) => void;
  readFile: (
    file: File,
  ) => Promise<{ fileName: string; contentType: string; dataBase64: string; previewUrl: string }>;
}) {
  const inputId = `photo-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {photo ? (
        <div className="relative inline-block">
          <img
            src={photo.previewUrl}
            alt={label}
            className="h-32 w-auto rounded-lg ring-1 ring-border object-cover"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-2 -right-2 bg-background ring-1 ring-border rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Удалить"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex items-center justify-center gap-2 h-24 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary cursor-pointer transition-colors"
        >
          <Upload className="size-4" /> Загрузить фото
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const p = await readFile(file);
            onChange(p);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Ошибка загрузки");
          } finally {
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}