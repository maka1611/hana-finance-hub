import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { adminListClients, adminCreateInstallment } from "@/lib/admin.functions";
import {
  listInvestorsLite,
  getInvestorAllocationPolicy,
} from "@/lib/investors.functions";
import { getCompanyFundsLite } from "@/lib/company-funds.functions";
import { calcInstallment, formatMoney, MAX_TERM, DEFAULT_MARKUP_RATE } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
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
import { ContactChannelToggles, autoLabelFromChannels, type ContactChannel } from "@/components/admin/ContactChannels";
import { AddressFields, emptyAddress, type AddressValue } from "@/components/AddressFields";

export const Route = createFileRoute("/_authenticated/admin/installments/new")({
  component: AdminNewInstallment,
});

type Mode = "existing" | "new";

function AdminNewInstallment() {
  const navigate = useNavigate();
  const listFn = useServerFn(adminListClients);
  const createFn = useServerFn(adminCreateInstallment);
  const investorsFn = useServerFn(listInvestorsLite);
  const policyFn = useServerFn(getInvestorAllocationPolicy);
  const companyFundsFn = useServerFn(getCompanyFundsLite);
  const { data: clients } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: () => listFn(),
  });
  const { data: investors } = useQuery({
    queryKey: ["investors-lite"],
    queryFn: () => investorsFn(),
  });
  const { data: policyData } = useQuery({
    queryKey: ["investor-allocation-policy"],
    queryFn: () => policyFn(),
  });
  const { data: companyFunds } = useQuery({
    queryKey: ["company-funds-lite"],
    queryFn: () => companyFundsFn(),
  });
  const policy = policyData?.policy ?? "suggest";

  const [mode, setMode] = useState<Mode>("existing");
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  type PhoneRow = { phone: string; label: string; channels: ContactChannel[] };
  const [phones, setPhones] = useState<PhoneRow[]>([
    { phone: "", label: "", channels: [] },
  ]);
  const [address, setAddress] = useState<AddressValue>(emptyAddress());

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
  const [passportPhotos, setPassportPhotos] = useState<PhotoFile[]>([]);
  const [driverLicensePhotos, setDriverLicensePhotos] = useState<PhotoFile[]>([]);

  // Поручители
  type GuarantorPhone = { phone: string; label: string; channels: ContactChannel[] };
  type GuarantorEmail = { email: string; label: string };
  type Guarantor = {
    fullName: string;
    comment: string;
    phones: GuarantorPhone[];
    emails: GuarantorEmail[];
  };
  const emptyGuarantor = (): Guarantor => ({
    fullName: "",
    comment: "",
    phones: [{ phone: "", label: "", channels: ["phone"] }],
    emails: [],
  });
  const [guarantors, setGuarantors] = useState<Guarantor[]>([]);
  const [investorId, setInvestorId] = useState<string | null>(null);
  const [investorProfitLocked, setInvestorProfitLocked] = useState<boolean>(false);
  const [investorProfitAmount, setInvestorProfitAmount] = useState<number>(0);

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

  // Единый список кандидатов на размещение: инвесторы + средства компании.
  // id=null означает «Средства компании».
  type Candidate = {
    id: string | null;
    full_name: string;
    free: number;
    idleRatio: number;
    idleDays: number | null;
    loadRatio: number;
    kind: "company" | "investor";
  };
  const candidates = useMemo<Candidate[]>(() => {
    const rows: Candidate[] = (investors ?? []).map((i) => ({
      id: i.id,
      full_name: i.full_name,
      free: i.free,
      idleRatio: i.idleRatio,
      idleDays: i.idleDays,
      loadRatio: i.loadRatio,
      kind: "investor",
    }));
    if (companyFunds) {
      rows.push({
        id: null,
        full_name: "Средства компании",
        free: companyFunds.freeCash,
        idleRatio: companyFunds.idleRatio ?? 0,
        idleDays: companyFunds.idleDays ?? null,
        loadRatio: companyFunds.loadRatio ?? 0,
        kind: "company",
      });
    }
    return rows;
  }, [investors, companyFunds]);

  const rankedFitting = useMemo(() => {
    return candidates
      .filter((c) => c.free >= calc.principal)
      .sort((a, b) => {
        if (b.idleRatio !== a.idleRatio) return b.idleRatio - a.idleRatio;
        const ad = a.idleDays ?? 9999;
        const bd = b.idleDays ?? 9999;
        return bd - ad;
      });
  }, [candidates, calc.principal]);

  const primary = rankedFitting[0] ?? null;
  // Fallback: следующий в очереди другого типа (компания ↔ инвестор).
  const fallback = useMemo(() => {
    if (!primary) return null;
    return rankedFitting.slice(1).find((c) => c.kind !== primary.kind) ?? null;
  }, [rankedFitting, primary]);

  // Auto-pick under enforce.
  useEffect(() => {
    if (policy !== "enforce") return;
    if (!primary) return;
    if (investorId === primary.id) return;
    // Разрешаем ручное переключение только между primary и fallback.
    if (fallback && investorId === fallback.id) return;
    setInvestorId(primary.id);
  }, [policy, primary, fallback, investorId]);

  // База прибыли инвестора = principal × DEFAULT_MARKUP_RATE × срок × доля инвестора.
  // Пока пользователь не «зафиксировал» — сумма пересчитывается динамически по этой формуле.
  const baseInvestorProfit = useMemo(() => {
    const inv = (investors ?? []).find((i) => i.id === investorId);
    if (!inv) return 0;
    const baseMarkup = calc.principal * DEFAULT_MARKUP_RATE * termMonths;
    return Math.round(baseMarkup * Number(inv.profit_share_rate));
  }, [investors, investorId, calc.principal, termMonths]);

  useEffect(() => {
    if (!investorProfitLocked) {
      setInvestorProfitAmount(baseInvestorProfit);
    }
  }, [baseInvestorProfit, investorProfitLocked]);

  // Сброс фиксации при смене / отмене инвестора.
  useEffect(() => {
    if (!investorId) {
      setInvestorProfitLocked(false);
      setInvestorProfitAmount(0);
    }
  }, [investorId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) return toast.error("Укажите название товара");
    if (mode === "existing" && !clientId) return toast.error("Выберите клиента");
    if (mode === "new") {
      if (!newEmail.trim()) return toast.error("Email обязателен");
      if (!newName.trim()) return toast.error("ФИО обязательно");
      // Телефон необязателен — идентификация клиента идёт по email.
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
                  phone: phones[0]?.phone.trim() || null,
                  address,
                },
          productName,
          productDescription: productDescription || null,
          productPrice,
          downPayment,
          termMonths,
          firstPaymentDate,
          clientComment: comment || null,
          markupRate: markupPct / 100,
          investorId: investorId,
          investorProfitLocked: investorProfitLocked && !!investorId,
          investorProfitAmount:
            investorProfitLocked && !!investorId ? investorProfitAmount : null,
          extraPhones:
            mode === "new"
              ? phones
                  .slice(phones[0]?.phone.trim() ? 1 : 0)
                  .filter((p) => p.phone.trim().length > 0)
                  .map((p) => ({
                    phone: p.phone.trim(),
                    label: p.label.trim() || autoLabelFromChannels(p.channels),
                    channels: p.channels,
                  }))
              : undefined,
          guarantors:
            guarantors.length > 0
              ? guarantors
                  .filter((g) => g.fullName.trim().length > 0)
                  .map((g) => ({
                    fullName: g.fullName.trim(),
                    comment: g.comment.trim() || null,
                    phones: g.phones
                      .filter((p) => p.phone.trim().length > 0)
                      .map((p) => ({
                        phone: p.phone.trim(),
                        label: p.label.trim() || autoLabelFromChannels(p.channels),
                        channels: p.channels,
                      })),
                    emails: g.emails
                      .filter((e) => e.email.trim().length > 0)
                      .map((e) => ({
                        email: e.email.trim(),
                        label: e.label.trim() || null,
                      })),
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
                  passportPhotos: passportPhotos.map((p) => ({
                    fileName: p.fileName,
                    contentType: p.contentType,
                    dataBase64: p.dataBase64,
                  })),
                  driverLicensePhotos: driverLicensePhotos.map((p) => ({
                    fileName: p.fileName,
                    contentType: p.contentType,
                    dataBase64: p.dataBase64,
                  })),
                }
              : undefined,
        },
      });
      if (res.tempPassword) {
        toast.success("Клиент создан. Пароль доступен в профиле клиента", { duration: 8000 });
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
                <p className="text-xs text-muted-foreground">
                  Клиент увидит свои рассрочки, войдя под этим email. Идентификация идёт только по email — совпадение телефонов не связывает аккаунты.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Телефоны для связи <span className="text-xs text-muted-foreground font-normal">(необязательно)</span></Label>
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
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-2">
                      <PhoneInput
                        value={row.phone}
                        onChange={(v) =>
                          setPhones((arr) =>
                            arr.map((p, i) => (i === idx ? { ...p, phone: v } : p)),
                          )
                        }
                        required={false}
                      />
                      <Input
                        value={row.label}
                        onChange={(e) =>
                          setPhones((arr) =>
                            arr.map((p, i) => (i === idx ? { ...p, label: e.target.value } : p)),
                          )
                        }
                        placeholder={autoLabelFromChannels(row.channels)}
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

              <AddressFields value={address} onChange={setAddress} title="Адрес клиента" />

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
                        photos={passportPhotos}
                        onChange={setPassportPhotos}
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
                        photos={driverLicensePhotos}
                        onChange={setDriverLicensePhotos}
                        readFile={readFile}
                      />
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Будет создан аккаунт клиента. Временный пароль сохранится в профиле клиента и будет доступен для админов в любое время.
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

        <div className="h-px bg-border" />

        <div className="space-y-3">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Инвестор <span className="font-normal normal-case tracking-normal text-[11px]">(необязательно)</span>
          </h2>
          {candidates.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Список инвесторов пуст. Добавить можно в разделе «Инвесторы».
            </p>
          ) : (
            <>
              {(() => {
                const recommended = primary;
                const selectedCand =
                  candidates.find((c) => c.id === investorId) ?? null;
                const avgIdle =
                  candidates.length > 0
                    ? candidates.reduce((s, i) => s + i.idleRatio, 0) / candidates.length
                    : 0;
                const showWarn =
                  policy !== "manual" &&
                  recommended &&
                  selectedCand &&
                  selectedCand.id !== recommended.id &&
                  selectedCand.idleRatio + 0.2 < avgIdle;
                return (
                  <div className="space-y-2">
                    {recommended && (
                      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl bg-primary/10 ring-1 ring-primary/30 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mr-2">
                            Рекомендуется
                          </span>
                          <span className="font-bold">{recommended.full_name}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · свободно {formatMoney(recommended.free)} ·
                            простой {Math.round(recommended.idleRatio * 100)}%
                            {recommended.idleDays !== null
                              ? ` · ${recommended.idleDays} дн без новых`
                              : " · ещё не использовался"}
                          </span>
                        </div>
                        {investorId !== recommended.id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setInvestorId(recommended.id)}
                          >
                            Подобрать автоматически
                          </Button>
                        )}
                      </div>
                    )}
                    {policy !== "manual" && !recommended && (
                      <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                        Ни у одного источника (инвесторы или средства компании) нет
                        достаточно свободных средств на сумму {formatMoney(calc.principal)}.
                        Увеличьте капитал инвестора или пополните средства компании.
                      </div>
                    )}
                    {showWarn && (
                      <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                        У выбранного инвестора загрузка значительно выше средней. Чтобы
                        средства распределялись равномерно, рекомендуется
                        «{recommended!.full_name}» (свободно{" "}
                        {Math.round(recommended!.idleRatio * 100)}%).
                      </div>
                    )}
                  </div>
                );
              })()}
              <select
                value={investorId ?? ""}
                onChange={(e) => setInvestorId(e.target.value || null)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                disabled={policy === "enforce" && !fallback}
              >
                <option
                  value=""
                  disabled={
                    policy === "enforce" &&
                    !(primary?.id === null || (fallback != null && fallback.id === null))
                  }
                >
                  — Собственные средства компании
                  {companyFunds
                    ? ` · свободно ${formatMoney(companyFunds.freeCash)} · в обороте ${formatMoney(companyFunds.capitalInUse)}`
                    : ""}
                  {" —"}
                </option>
                {(investors ?? []).map((inv) => {
                  const allowedInEnforce =
                    primary?.id === inv.id || fallback?.id === inv.id;
                  return (
                    <option
                      key={inv.id}
                      value={inv.id}
                      disabled={policy === "enforce" && !allowedInEnforce}
                    >
                      {inv.full_name} · свободно {formatMoney(inv.free)} · загрузка{" "}
                      {Math.round(inv.loadRatio * 100)}%
                      {inv.idleDays !== null ? ` · ${inv.idleDays} дн без новых` : ""}
                      {" · доля "}
                      {(Number(inv.profit_share_rate) * 100).toFixed(0)}%
                    </option>
                  );
                })}
              </select>
              {policy === "enforce" && (
                <p className="text-[11px] text-muted-foreground">
                  Действует политика «обязательный автоподбор» — выбран наиболее
                  свободный источник ({primary?.full_name ?? "—"}).
                  {fallback ? (
                    <>
                      {" "}Разрешена ручная замена только на следующего в очереди:{" "}
                      <span className="font-bold text-foreground">{fallback.full_name}</span>.
                    </>
                  ) : null}
                </p>
              )}
              {investorId && (() => {
                const inv = (investors ?? []).find((x) => x.id === investorId);
                if (!inv) return null;
                const afterPlacement = inv.free - calc.principal;
                const dynamicInvestorProfit =
                  calc.markupAmount * Number(inv.profit_share_rate);
                const investorProfit = investorProfitLocked
                  ? investorProfitAmount
                  : dynamicInvestorProfit;
                const ourProfit = calc.markupAmount - investorProfit;
                const discountFromBase =
                  baseInvestorProfit / Number(inv.profit_share_rate || 1) -
                  calc.markupAmount;
                return (
                  <div className="space-y-3">
                  <div className="rounded-xl bg-muted/30 ring-1 ring-border p-3 grid sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">У инвестора останется</div>
                      <div className={`font-extrabold text-sm ${afterPlacement < 0 ? "text-destructive" : ""}`}>
                        {formatMoney(afterPlacement)}
                      </div>
                      {afterPlacement < 0 && (
                        <div className="text-[10px] text-destructive">Превышает свободные средства</div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        Прибыль инвестора{investorProfitLocked ? " (фикс.)" : ""}
                      </div>
                      <div className="font-extrabold text-sm">{formatMoney(investorProfit)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Наша прибыль</div>
                      <div className={`font-extrabold text-sm ${ourProfit < 0 ? "text-destructive" : ""}`}>
                        {formatMoney(ourProfit)}
                      </div>
                      {ourProfit < 0 && (
                        <div className="text-[10px] text-destructive">
                          Сделка убыточна для компании
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl ring-1 ring-border p-3 space-y-3 bg-background">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={investorProfitLocked}
                        onChange={(e) => setInvestorProfitLocked(e.target.checked)}
                        className="mt-1 size-4 accent-primary"
                      />
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold">
                          Зафиксировать прибыль инвестора
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Позволяет сделать скидку клиенту (уменьшить наценку %), сохранив
                          прибыль инвестора в рублях. Разница вычтется из нашей доли.
                        </div>
                      </div>
                    </label>
                    {investorProfitLocked && (
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Прибыль инвестора, ₽</Label>
                          <Input
                            type="number"
                            min={0}
                            value={investorProfitAmount || ""}
                            onChange={(e) =>
                              setInvestorProfitAmount(
                                Math.max(0, Number(e.target.value) || 0),
                              )
                            }
                            className="font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setInvestorProfitAmount(baseInvestorProfit)}
                            className="text-[10px] font-mono uppercase tracking-wider text-primary hover:underline"
                          >
                            Сбросить к базовой: {formatMoney(baseInvestorProfit)}
                          </button>
                        </div>
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          <div>
                            База: наценка{" "}
                            {(DEFAULT_MARKUP_RATE * 100).toFixed(1)}% × {termMonths} мес
                            × доля {(Number(inv.profit_share_rate) * 100).toFixed(0)}%
                          </div>
                          {discountFromBase > 0 && (
                            <div>
                              Скидка клиенту от базовой:{" "}
                              <span className="font-bold text-foreground">
                                {formatMoney(discountFromBase)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                );
              })()}
              {!investorId && companyFunds && (() => {
                const after = companyFunds.freeCash - calc.principal;
                const over = after < 0;
                return (
                  <div className="rounded-xl bg-muted/30 ring-1 ring-border p-3 grid sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Свободно</div>
                      <div className="font-extrabold text-sm">{formatMoney(companyFunds.freeCash)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">В обороте</div>
                      <div className="font-extrabold text-sm">{formatMoney(companyFunds.capitalInUse)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Останется после оформления</div>
                      <div className={`font-extrabold text-sm ${over ? "text-destructive" : ""}`}>
                        {formatMoney(after)}
                      </div>
                      {over && (
                        <div className="text-[10px] text-destructive">Превышает свободные средства компании</div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        <div className="h-px bg-border" />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Поручители <span className="font-normal normal-case tracking-normal text-[11px]">(необязательно)</span>
            </h2>
            <button
              type="button"
              onClick={() => setGuarantors((arr) => [...arr, emptyGuarantor()])}
              className="text-xs font-semibold text-primary inline-flex items-center gap-1 hover:underline"
            >
              <Plus className="size-3.5" /> Добавить поручителя
            </button>
          </div>
          {guarantors.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Можно добавить нескольких поручителей с ФИО, телефонами, email и комментарием.
            </p>
          )}
          {guarantors.map((g, gi) => (
            <div
              key={gi}
              className="rounded-xl ring-1 ring-border bg-muted/20 p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Поручитель {gi + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setGuarantors((arr) => arr.filter((_, i) => i !== gi))}
                  className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                >
                  <Trash2 className="size-3.5" /> Удалить
                </button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">ФИО</Label>
                <Input
                  value={g.fullName}
                  onChange={(e) =>
                    setGuarantors((arr) =>
                      arr.map((x, i) => (i === gi ? { ...x, fullName: e.target.value } : x)),
                    )
                  }
                  placeholder="Иванов Иван Иванович"
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Телефоны</Label>
                  <button
                    type="button"
                    onClick={() =>
                      setGuarantors((arr) =>
                        arr.map((x, i) =>
                          i === gi
                            ? {
                                ...x,
                                phones: [
                                  ...x.phones,
                                  { phone: "", label: "", channels: ["phone"] as ContactChannel[] },
                                ],
                              }
                            : x,
                        ),
                      )
                    }
                    className="text-[11px] font-semibold text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <Plus className="size-3" /> Добавить номер
                  </button>
                </div>
                {g.phones.map((p, pi) => (
                  <div key={pi} className="bg-card rounded-lg p-3 space-y-2 ring-1 ring-border">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-2">
                      <PhoneInput
                        value={p.phone}
                        onChange={(v) =>
                          setGuarantors((arr) =>
                            arr.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    phones: x.phones.map((y, j) =>
                                      j === pi ? { ...y, phone: v } : y,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      <Input
                        value={p.label}
                        onChange={(e) =>
                          setGuarantors((arr) =>
                            arr.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    phones: x.phones.map((y, j) =>
                                      j === pi ? { ...y, label: e.target.value } : y,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                        placeholder={autoLabelFromChannels(p.channels)}
                        maxLength={50}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <ContactChannelToggles
                        value={p.channels}
                        onChange={(v) =>
                          setGuarantors((arr) =>
                            arr.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    phones: x.phones.map((y, j) =>
                                      j === pi ? { ...y, channels: v } : y,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                        size="sm"
                      />
                      {g.phones.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setGuarantors((arr) =>
                              arr.map((x, i) =>
                                i === gi
                                  ? { ...x, phones: x.phones.filter((_, j) => j !== pi) }
                                  : x,
                              ),
                            )
                          }
                          className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                        >
                          <Trash2 className="size-3" /> Удалить
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Email</Label>
                  <button
                    type="button"
                    onClick={() =>
                      setGuarantors((arr) =>
                        arr.map((x, i) =>
                          i === gi
                            ? { ...x, emails: [...x.emails, { email: "", label: "" }] }
                            : x,
                        ),
                      )
                    }
                    className="text-[11px] font-semibold text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <Plus className="size-3" /> Добавить email
                  </button>
                </div>
                {g.emails.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Email не указан</p>
                )}
                {g.emails.map((e, ei) => (
                  <div key={ei} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2">
                    <Input
                      type="email"
                      value={e.email}
                      onChange={(ev) =>
                        setGuarantors((arr) =>
                          arr.map((x, i) =>
                            i === gi
                              ? {
                                  ...x,
                                  emails: x.emails.map((y, j) =>
                                    j === ei ? { ...y, email: ev.target.value } : y,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="email@example.com"
                      maxLength={200}
                    />
                    <Input
                      value={e.label}
                      onChange={(ev) =>
                        setGuarantors((arr) =>
                          arr.map((x, i) =>
                            i === gi
                              ? {
                                  ...x,
                                  emails: x.emails.map((y, j) =>
                                    j === ei ? { ...y, label: ev.target.value } : y,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="Метка"
                      maxLength={50}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setGuarantors((arr) =>
                          arr.map((x, i) =>
                            i === gi
                              ? { ...x, emails: x.emails.filter((_, j) => j !== ei) }
                              : x,
                          ),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Комментарий</Label>
                <Textarea
                  value={g.comment}
                  onChange={(ev) =>
                    setGuarantors((arr) =>
                      arr.map((x, i) => (i === gi ? { ...x, comment: ev.target.value } : x)),
                    )
                  }
                  rows={2}
                  maxLength={2000}
                />
              </div>
            </div>
          ))}
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
  photos,
  onChange,
  readFile,
}: {
  label: string;
  photos: Array<{ fileName: string; contentType: string; dataBase64: string; previewUrl: string }>;
  onChange: React.Dispatch<
    React.SetStateAction<
      Array<{ fileName: string; contentType: string; dataBase64: string; previewUrl: string }>
    >
  >;
  readFile: (
    file: File,
  ) => Promise<{ fileName: string; contentType: string; dataBase64: string; previewUrl: string }>;
}) {
  const inputId = `photo-${label.replace(/\s+/g, "-")}`;
  const MAX = 5;
  const limitReached = photos.length >= MAX;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-[10px] font-mono text-muted-foreground">{photos.length} / {MAX}</span>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, idx) => (
            <div key={idx} className="relative">
              <img
                src={p.previewUrl}
                alt={`${label} ${idx + 1}`}
                className="w-full h-24 rounded-lg ring-1 ring-border object-cover"
              />
              <button
                type="button"
                onClick={() => onChange((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute -top-2 -right-2 bg-background ring-1 ring-border rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground"
                aria-label="Удалить"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {!limitReached && (
        <label
          htmlFor={inputId}
          className="flex items-center justify-center gap-2 h-20 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary cursor-pointer transition-colors"
        >
          <Upload className="size-4" /> Добавить фото
        </label>
      )}
      {limitReached && (
        <p className="text-[11px] text-muted-foreground">Достигнут лимит {MAX} фото</p>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length === 0) return;
          try {
            const slotsLeft = MAX - photos.length;
            const toRead = files.slice(0, slotsLeft);
            const newOnes = await Promise.all(toRead.map((f) => readFile(f)));
            onChange((prev) => [...prev, ...newOnes].slice(0, MAX));
            if (files.length > slotsLeft) {
              toast.error(`Можно загрузить не больше ${MAX} фото`);
            }
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