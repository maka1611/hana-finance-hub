import { formatMoney } from "@/lib/installment";

interface Props {
  termMonths: number;
  monthly: number;
  paidUpTo?: number;
}

export function PaymentScheduleStrip({ termMonths, monthly, paidUpTo = 0 }: Props) {
  const bars = Array.from({ length: termMonths }, (_, i) => i + 1);
  return (
    <div>
      <div className="flex gap-1.5 h-16 items-end">
        {bars.map((i) => {
          const paid = i <= paidUpTo;
          const current = i === paidUpTo + 1;
          return (
            <div
              key={i}
              title={`Месяц ${i}: ${formatMoney(monthly)}`}
              className={`flex-1 rounded-t-md transition-all ${
                paid
                  ? "bg-primary/60"
                  : current
                    ? "bg-primary"
                    : "bg-primary/15"
              }`}
              style={{ height: `${50 + (i / termMonths) * 50}%` }}
            />
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