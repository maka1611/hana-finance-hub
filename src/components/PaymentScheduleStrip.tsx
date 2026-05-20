import { formatMoney } from "@/lib/installment";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Props {
  termMonths: number;
  monthly: number;
  paidUpTo?: number;
}

export function PaymentScheduleStrip({ termMonths, monthly, paidUpTo = 0 }: Props) {
  const bars = Array.from({ length: termMonths }, (_, i) => i + 1);
  const totalDebt = monthly * termMonths;
  return (
    <div>
        <div className="flex gap-1.5 h-16 items-end">
          {bars.map((i) => {
            const paid = i <= paidUpTo;
            const current = i === paidUpTo + 1;
            const remaining = totalDebt - monthly * i;
            return (
              <Popover key={i}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Месяц ${i}`}
                    className={`flex-1 rounded-t-md transition-all cursor-pointer hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      paid
                        ? "bg-primary/60"
                        : current
                          ? "bg-primary"
                          : "bg-primary/15"
                    }`}
                    style={{ height: `${50 + (i / termMonths) * 50}%` }}
                  />
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" side="top">
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold">Месяц {i}</div>
                    <div>Платёж: {formatMoney(monthly)}</div>
                    <div className="opacity-80">
                      Остаток: {formatMoney(Math.max(0, remaining))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      <div className="flex justify-between mt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>1 платёж</span>
        <span>{termMonths} платёж</span>
      </div>
    </div>
  );
}