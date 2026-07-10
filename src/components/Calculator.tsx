import { useMemo, useState } from "react";
import { useEffect, useState as useStateReact } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  calcInstallment,
  DEFAULT_MARKUP_RATE,
  formatMoney,
  MAX_TERM,
} from "@/lib/installment";
import { getEffectiveMarkupRate } from "@/lib/pricing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { PaymentScheduleStrip } from "@/components/PaymentScheduleStrip";

interface CalculatorProps {
  onSubmit?: (result: ReturnType<typeof calcInstallment>) => void;
  compact?: boolean;
  markupRate?: number;
}

export function Calculator({ onSubmit, compact, markupRate }: CalculatorProps) {
  const navigate = useNavigate();
  const [productPrice, setProductPrice] = useState<number>(50000);
  const [downPayment, setDownPayment] = useState<number>(20000);
  const [termMonths, setTermMonths] = useState<number>(12);

  const rateFn = useServerFn(getEffectiveMarkupRate);
  const [isAuthed, setIsAuthed] = useStateReact(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setIsAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);
  const { data: rateInfo } = useQuery({
    queryKey: ["my-effective-markup-rate"],
    queryFn: () => rateFn(),
    enabled: markupRate === undefined && isAuthed,
    staleTime: 60_000,
  });
  const effectiveRate =
    markupRate ?? rateInfo?.rate ?? DEFAULT_MARKUP_RATE;

  const result = useMemo(
    () => calcInstallment({ productPrice, downPayment, termMonths, markupRate: effectiveRate }),
    [productPrice, downPayment, termMonths, effectiveRate],
  );

  const handleSubmit = () => {
    if (onSubmit) {
      onSubmit(result);
      return;
    }
    const params = new URLSearchParams({
      price: String(result.productPrice),
      down: String(result.downPayment),
      term: String(result.termMonths),
    });
    navigate({ to: "/app/new", search: Object.fromEntries(params) as never });
  };

  return (
    <div className="bg-card rounded-3xl ring-1 ring-border shadow-2xl shadow-primary/5 p-6 md:p-8">
      <div className="grid md:grid-cols-2 gap-8 md:gap-10">
        <div className="space-y-7">
          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Сумма товара
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={productPrice || ""}
              onChange={(e) => setProductPrice(Number(e.target.value) || 0)}
              className="text-3xl md:text-4xl font-extrabold px-4 py-3 h-auto bg-background border-border rounded-xl shadow-none focus-visible:ring-2 focus-visible:ring-primary/30 no-spinner"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Первый взнос
              </Label>
              <span className="text-xs font-mono text-muted-foreground">
                {productPrice > 0
                  ? Math.round((downPayment / productPrice) * 100)
                  : 0}
                %
              </span>
            </div>
            <Input
              type="number"
              min={0}
              max={productPrice}
              value={downPayment || ""}
              onChange={(e) =>
                setDownPayment(
                  Math.min(Number(e.target.value) || 0, productPrice),
                )
              }
              className="text-3xl md:text-4xl font-extrabold px-4 py-3 h-auto bg-background border-border rounded-xl shadow-none focus-visible:ring-2 focus-visible:ring-primary/30 no-spinner"
            />
            <Slider
              min={0}
              max={productPrice}
              step={1000}
              value={[downPayment]}
              onValueChange={(v) => setDownPayment(v[0])}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Срок рассрочки
              </Label>
              <span className="text-sm font-mono text-primary font-bold">
                {termMonths} мес.
              </span>
            </div>
            <Slider
              min={1}
              max={MAX_TERM}
              step={1}
              value={[termMonths]}
              onValueChange={(v) => setTermMonths(v[0])}
            />
            <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <span>1 мес</span>
              <span>{MAX_TERM} мес</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted rounded-xl p-3">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">
                Остаток
              </div>
              <div className="font-bold mt-1">
                {formatMoney(result.principal)}
              </div>
            </div>
            <div className="bg-muted rounded-xl p-3">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">
                Наценка / мес
              </div>
              <div className="font-bold mt-1">
                {(effectiveRate * 100).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        <div className="bg-primary text-primary-foreground rounded-2xl p-6 flex flex-col justify-between gap-6">
          <div>
            <div className="opacity-60 text-xs font-bold uppercase tracking-widest mb-1">
              Ежемесячный платёж
            </div>
            <div className="text-4xl md:text-5xl font-extrabold tracking-tight">
              {formatMoney(result.monthlyPayment)}
            </div>
          </div>

          <div className="space-y-3 pt-6 border-t border-white/10">
            <div className="flex justify-between text-sm">
              <span className="opacity-60">Наценка за рассрочку</span>
              <span className="font-medium">
                {formatMoney(result.markupAmount)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="opacity-60">Итоговая цена продажи</span>
              <span className="font-semibold">
                {formatMoney(result.totalSalePrice)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="opacity-60">Остаток к оплате</span>
              <span className="font-medium">
                {formatMoney(result.principal + result.markupAmount)}
              </span>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            className="w-full bg-white text-primary hover:bg-white/90 font-bold py-6 rounded-xl text-base"
          >
            Подать заявку
          </Button>
        </div>
      </div>

      {!compact && (
        <div className="mt-8 pt-8 border-t border-border">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
            График платежей
          </div>
          <PaymentScheduleStrip
            termMonths={result.termMonths}
            monthly={result.monthlyPayment}
          />
        </div>
      )}
    </div>
  );
}