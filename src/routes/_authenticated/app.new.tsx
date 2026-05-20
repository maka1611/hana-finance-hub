import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, type FormEvent } from "react";
import { calcInstallment, formatMoney, MAX_TERM } from "@/lib/installment";
import { submitApplication } from "@/lib/applications.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FileCheck2 } from "lucide-react";

type NewSearch = { price?: number; down?: number; term?: number };

export const Route = createFileRoute("/_authenticated/app/new")({
  head: () => ({ meta: [{ title: "Заявка на рассрочку — NoorPay" }] }),
  validateSearch: (s: Record<string, unknown>): NewSearch => ({
    price: s.price ? Number(s.price) : undefined,
    down: s.down ? Number(s.down) : undefined,
    term: s.term ? Number(s.term) : undefined,
  }),
  component: NewInstallment,
});

function NewInstallment() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const fn = useServerFn(submitApplication);

  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState<number>(search.price ?? 250000);
  const [downPayment, setDownPayment] = useState<number>(search.down ?? 50000);
  const [termMonths, setTermMonths] = useState<number>(search.term ?? 12);
  const [clientFullName, setClientFullName] = useState("");
  const [clientTelegram, setClientTelegram] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientComment, setClientComment] = useState("");
  const [firstPaymentDate, setFirstPaymentDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);

  // Подтягиваем ФИО/телефон из профиля
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.full_name) setClientFullName(data.full_name);
      if (data?.phone) setClientPhone(data.phone);
    })();
  }, []);

  const calc = useMemo(
    () => calcInstallment({ productPrice, downPayment, termMonths }),
    [productPrice, downPayment, termMonths],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) return toast.error("Укажите название товара");
    if (!clientFullName.trim()) return toast.error("Укажите ФИО клиента");
    if (!clientPhone.trim()) return toast.error("Укажите номер телефона");
    setLoading(true);
    try {
      await fn({
        data: {
          productName,
          productDescription: productDescription || null,
          productPrice,
          downPayment,
          termMonths,
          clientFullName,
          clientTelegram: clientTelegram || null,
          clientPhone: clientPhone || null,
          clientComment: clientComment || null,
          firstPaymentDate,
        },
      });
      toast.success("Заявка отправлена. Менеджер свяжется с вами");
      navigate({ to: "/app/profile" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Заявка
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight">Подать заявку на рассрочку</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Заполните заявку — менеджер проверит данные, при необходимости свяжется
          с вами и оформит рассрочку. После одобрения договор и график появятся в личном кабинете.
        </p>
      </div>

      <form onSubmit={submit} className="bg-card rounded-2xl ring-1 ring-border p-6 md:p-8 space-y-6">
        <div className="space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Данные клиента
          </h2>
          <div className="space-y-2">
            <Label>ФИО</Label>
            <Input
              value={clientFullName}
              onChange={(e) => setClientFullName(e.target.value)}
              placeholder="Иванов Иван Иванович"
              required
            />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Telegram <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
              <Input
                value={clientTelegram}
                onChange={(e) => setClientTelegram(e.target.value)}
                placeholder="@username"
              />
            </div>
            <div className="space-y-2">
              <Label>Телефон</Label>
              <Input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+7 ..."
                required
                inputMode="tel"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Комментарий менеджеру <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
            <Textarea
              value={clientComment}
              onChange={(e) => setClientComment(e.target.value)}
              placeholder="Дополнительная информация"
              rows={2}
            />
          </div>
        </div>

        <div className="h-px bg-border" />

        <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Данные товара
        </h2>

        <div className="space-y-2">
          <Label>Название товара</Label>
          <Input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="iPhone 16 Pro, диван и т.д."
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Описание товара <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
          <Textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            placeholder="Цвет, модель, состояние и т.д."
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
              onChange={(e) =>
                setDownPayment(Math.min(Number(e.target.value) || 0, productPrice))
              }
              min={0}
              max={productPrice}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Срок рассрочки</Label>
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

        <div className="bg-muted/40 rounded-xl p-5 space-y-2 text-sm">
          <Row k="Остаток" v={formatMoney(calc.principal)} />
          <Row k="Наценка за рассрочку (предв.)" v={formatMoney(calc.markupAmount)} />
          <Row k="Ежемесячный платёж (предв.)" v={formatMoney(calc.monthlyPayment)} bold />
          <Row k="Итоговая цена (предв.)" v={formatMoney(calc.totalSalePrice)} bold />
          <p className="text-[11px] text-muted-foreground pt-1">
            Окончательные условия определит менеджер при одобрении заявки.
          </p>
        </div>

        <Button type="submit" className="w-full py-6 text-base font-bold" disabled={loading}>
          <FileCheck2 className="size-4" /> {loading ? "Отправка..." : "Отправить заявку"}
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
