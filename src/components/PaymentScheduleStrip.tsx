import { formatMoney } from "@/lib/installment";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      <TooltipProvider delayDuration={100}>
        <div className="flex gap-1.5 h-16 items-end">
          {bars.map((i) => {
            const paid = i <= paidUpTo;
            const current = i === paidUpTo + 1;
            const remaining = totalDebt - monthly * i;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex-1 rounded-t-md transition-all cursor-pointer hover:opacity-80 ${
                      paid
                        ? "bg-primary/60"
                        : current
                          ? "bg-primary"
                          : "bg-primary/15"
                    }`}
                    style={{ height: `${50 + (i / termMonths) * 50}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold">Месяц {i}</div>
                    <div>Платёж: {formatMoney(monthly)}</div>
                    <div className="text-muted-foreground">
                      Остаток: {formatMoney(Math.max(0, remaining))}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      <div className="flex justify-between mt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>1 платёж</span>
        <span>{termMonths} платёж</span>
      </div>
    </div>
  );
}