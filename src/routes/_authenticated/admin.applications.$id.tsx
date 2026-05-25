import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import {
  adminGetApplication,
  adminUpdateApplication,
  adminApproveApplication,
  adminRejectApplication,
} from "@/lib/applications.functions";
import { listInvestorsLite } from "@/lib/investors.functions";
import { calcInstallment, formatMoney, MAX_TERM, formatDate, DEFAULT_MARKUP_RATE } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Save, Mail, Phone, User, Plus, Trash2 } from "lucide-react";
import { ContactChannelToggles, autoLabelFromChannels, type ContactChannel } from "@/components/admin/ContactChannels";

export const Route = createFileRoute("/_authenticated/admin/applications/$id")({
  component: AdminApplicationDetail,
});

function AdminApplicationDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetApplication);
  const updateFn = useServerFn(adminUpdateApplication);
  const approveFn = useServerFn(adminApproveApplication);
  const rejectFn = useServerFn(adminRejectApplication);
  const investorsFn = useServerFn(listInvestorsLite);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-application", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const { data: investors } = useQuery({
    queryKey: ["investors-lite"],
    queryFn: () => investorsFn(),
  });

  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState(0);
  const [downPayment, setDownPayment] = useState(0);
  const [termMonths, setTermMonths] = useState(12);
  const [firstPaymentDate, setFirstPaymentDate] = useState("");
  const [clientFullName, setClientFullName] = useState("");
  const [clientTelegram, setClientTelegram] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientComment, setClientComment] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [markupPct, setMarkupPct] = useState<number>(+(DEFAULT_MARKUP_RATE * 100).toFixed(2));
  const [investorId, setInvestorId] = useState<string | null>(null);

  type GPhone = { phone: string; label: string; channels: ContactChannel[] };
  type GEmail = { email: string; label: string };
  type Guarantor = { fullName: string; comment: string; phones: GPhone[]; emails: GEmail[] };
  const emptyGuarantor = (): Guarantor => ({
    fullName: "",
    comment: "",
    phones: [{ phone: "", label: "", channels: ["phone"] }],
    emails: [],
  });
  const [guarantors, setGuarantors] = useState<Guarantor[]>([]);

  useEffect(() => {
    const a = data?.application;
    if (!a) return;
    setProductName(a.product_name ?? "");
    setProductDescription(a.product_description ?? "");
    setProductPrice(Number(a.product_price ?? 0));
    setDownPayment(Number(a.down_payment ?? 0));
    setTermMonths(a.term_months ?? 12);
    setFirstPaymentDate(a.first_payment_date ?? "");
    setClientFullName(a.client_full_name ?? "");
    setClientTelegram(a.client_telegram ?? "");
    setClientPhone(a.client_phone ?? "");
    setClientComment(a.client_comment ?? "");
    setAdminNote(a.admin_note ?? "");
  }, [data?.application]);

  const calc = useMemo(
    () => calcInstallment({ productPrice, downPayment, termMonths, markupRate: markupPct / 100 }),
    [productPrice, downPayment, termMonths, markupPct],
  );

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id,
          productName,
          productDescription: productDescription || null,
          productPrice,
          downPayment,
          termMonths,
          firstPaymentDate: firstPaymentDate || null,
          clientFullName: clientFullName || null,
          clientTelegram: clientTelegram || null,
          clientPhone: clientPhone || null,
          clientComment: clientComment || null,
          adminNote: adminNote || null,
        },
      }),
    onSuccess: () => { toast.success("Сохранено"); qc.invalidateQueries({ queryKey: ["admin-application", id] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const approve = useMutation({
    mutationFn: async () => {
      // сначала сохраняем правки, потом одобряем
      await updateFn({
        data: {
          id, productName, productDescription: productDescription || null,
          productPrice, downPayment, termMonths,
          firstPaymentDate: firstPaymentDate || null,
          clientFullName: clientFullName || null,
          clientTelegram: clientTelegram || null,
          clientPhone: clientPhone || null,
          clientComment: clientComment || null,
          adminNote: adminNote || null,
        },
      });
      return approveFn({
        data: {
          id,
          investorId,
          markupRate: markupPct / 100,
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
        },
      });
    },
    onSuccess: (r) => {
      toast.success("Заявка одобрена, рассрочка оформлена");
      navigate({ to: "/admin/contracts/$id", params: { id: r.contractId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const reject = useMutation({
    mutationFn: () => rejectFn({ data: { id, note: adminNote || undefined } }),
    onSuccess: () => { toast.success("Заявка отклонена"); qc.invalidateQueries({ queryKey: ["admin-application", id] }); navigate({ to: "/admin/applications" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Загрузка...</p>;
  const a = data.application;
  const isPending = a.status === "pending";

  return (
    <div className="space-y-6 max-w-5xl">
      <Link to="/admin/applications" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-3.5" /> К списку
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">Заявка</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{a.product_name}</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Создана {formatDate(a.created_at)}</p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
          a.status === "pending" ? "bg-amber-400/15 text-amber-700" :
          a.status === "approved" ? "bg-primary/15 text-primary" :
          "bg-destructive/10 text-destructive"
        }`}>
          {a.status === "pending" ? "На рассмотрении" : a.status === "approved" ? "Одобрена" : "Отклонена"}
        </span>
      </div>

      {/* Клиент */}
      <div className="bg-card rounded-2xl ring-1 ring-border p-5 space-y-2 text-sm">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Клиент</div>
        <div className="flex items-center gap-2"><User className="size-3.5 text-muted-foreground" /> {data.profile?.full_name ?? "—"}</div>
        <div className="flex items-center gap-2"><Mail className="size-3.5 text-muted-foreground" /> {data.profile?.email ?? "—"}</div>
        {data.profile?.phone && <div className="flex items-center gap-2"><Phone className="size-3.5 text-muted-foreground" /> {data.profile.phone}</div>}
        {data.phones.length > 0 && (
          <div className="text-xs text-muted-foreground pt-1">
            Доп. телефоны: {data.phones.map((p) => `${p.phone}${p.label ? ` (${p.label})` : ""}`).join(", ")}
          </div>
        )}
      </div>

      {/* Форма редактирования */}
      <div className="bg-card rounded-2xl ring-1 ring-border p-6 space-y-5">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Условия</div>
        <div className="space-y-2">
          <Label>Товар</Label>
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} disabled={!isPending} />
        </div>
        <div className="space-y-2">
          <Label>Описание</Label>
          <Textarea value={productDescription} onChange={(e) => setProductDescription(e.target.value)} rows={2} disabled={!isPending} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Сумма товара</Label>
            <Input type="number" value={productPrice || ""} onChange={(e) => setProductPrice(Number(e.target.value) || 0)} disabled={!isPending} />
          </div>
          <div className="space-y-2">
            <Label>Первый взнос</Label>
            <Input type="number" value={downPayment || ""} onChange={(e) => setDownPayment(Math.min(Number(e.target.value) || 0, productPrice))} disabled={!isPending} />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Срок</Label>
              <span className="text-sm font-mono text-primary font-bold">{termMonths} мес</span>
            </div>
            <Slider min={1} max={MAX_TERM} step={1} value={[termMonths]} onValueChange={(v) => setTermMonths(v[0])} disabled={!isPending} />
          </div>
          <div className="space-y-2">
            <Label>Дата первого платежа</Label>
            <Input type="date" value={firstPaymentDate} onChange={(e) => setFirstPaymentDate(e.target.value)} disabled={!isPending} />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>ФИО клиента</Label>
            <Input value={clientFullName} onChange={(e) => setClientFullName(e.target.value)} disabled={!isPending} />
          </div>
          <div className="space-y-2">
            <Label>Telegram</Label>
            <Input value={clientTelegram} onChange={(e) => setClientTelegram(e.target.value)} disabled={!isPending} />
          </div>
          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} disabled={!isPending} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Комментарий клиента</Label>
          <Textarea value={clientComment} onChange={(e) => setClientComment(e.target.value)} rows={2} disabled={!isPending} />
        </div>
        <div className="space-y-2">
          <Label>Заметка администратора</Label>
          <Textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} placeholder="Причина решения, договорённости..." />
        </div>

        <div className="bg-muted/40 rounded-xl p-5 space-y-2 text-sm">
          <Row k="Остаток" v={formatMoney(calc.principal)} />
          <Row k="Наценка" v={formatMoney(calc.markupAmount)} />
          <Row k="Ежемесячный платёж" v={formatMoney(calc.monthlyPayment)} bold />
          <Row k="Итоговая цена" v={formatMoney(calc.totalSalePrice)} bold />
        </div>

        {isPending ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => approve.mutate()} disabled={approve.isPending || save.isPending}>
              <Check className="size-4" /> {approve.isPending ? "Оформление..." : "Одобрить и оформить"}
            </Button>
            <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="size-4" /> Сохранить правки
            </Button>
            <Button variant="ghost" onClick={() => reject.mutate()} disabled={reject.isPending} className="text-destructive hover:text-destructive">
              <X className="size-4" /> Отклонить
            </Button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground pt-2">
            Заявка уже обработана.
            {a.contract_id && (
              <>
                {" "}
                <Link to="/admin/contracts/$id" params={{ id: a.contract_id }} className="text-primary underline">
                  Перейти к договору
                </Link>
              </>
            )}
          </div>
        )}
      </div>
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