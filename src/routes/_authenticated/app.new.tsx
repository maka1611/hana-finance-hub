import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, type FormEvent } from "react";
import { calcInstallment, formatMoney, MAX_TERM } from "@/lib/installment";
import { createInstallment } from "@/lib/installments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

type NewSearch = { price?: number; down?: number; term?: number };

export const Route = createFileRoute("/_authenticated/app/new")({
  head: () => ({ meta: [{ title: "Новая рассрочка — NoorPay" }] }),
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
  const fn = useServerFn(createInstallment);

  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState<number>(search.price ?? 250000);
  const [downPayment, setDownPayment] = useState<number>(search.down ?? 50000);
  const [termMonths, setTermMonths] = useState<number>(search.term ?? 12);
  const [loading, setLoading] = useState(false);

  const calc = useMemo(
    () => calcInstallment({ productPrice, downPayment, termMonths }),
    [productPrice, downPayment, termMonths],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) return toast.error("Укажите название товара");
    setLoading(true);
    try {
      const res = await fn({
        data: { productName, productPrice, downPayment, termMonths },
      });
      toast.success("Рассрочка оформлена");
      navigate({ to: "/app/installments/$id", params: { id: res.id } });
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
          Шаг 1 из 1
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight">Новая рассрочка</h1>
      </div>

      <form onSubmit={submit} className="bg-card rounded-2xl ring-1 ring-border p-6 md:p-8 space-y-6">
        <div className="space-y-2">
          <Label>Название товара</Label>
          <Input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="iPhone 16 Pro, диван и т.д."
            required
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

        <div className="bg-muted/40 rounded-xl p-5 space-y-2 text-sm">
          <Row k="Остаток" v={formatMoney(calc.principal)} />
          <Row k="Наценка за рассрочку" v={formatMoney(calc.markupAmount)} />
          <Row k="Ежемесячный платёж" v={formatMoney(calc.monthlyPayment)} bold />
          <Row k="Итоговая цена продажи" v={formatMoney(calc.totalSalePrice)} bold />
        </div>

        <Button type="submit" className="w-full py-6 text-base font-bold" disabled={loading}>
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
