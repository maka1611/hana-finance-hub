export const DEFAULT_MARKUP_RATE = 0.045; // 4.5% в месяц
export const MAX_TERM = 24;

export interface CalcInput {
  productPrice: number;
  downPayment: number;
  termMonths: number;
  markupRate?: number;
}

export interface CalcResult {
  principal: number;
  markupAmount: number;
  totalSalePrice: number;
  monthlyPayment: number;
  markupRate: number;
  termMonths: number;
  downPayment: number;
  productPrice: number;
}

export function calcInstallment(input: CalcInput): CalcResult {
  const productPrice = Math.max(0, input.productPrice || 0);
  const downPayment = Math.min(
    Math.max(0, input.downPayment || 0),
    productPrice,
  );
  const termMonths = Math.min(
    Math.max(1, Math.round(input.termMonths || 1)),
    MAX_TERM,
  );
  const markupRate = input.markupRate ?? DEFAULT_MARKUP_RATE;
  const principal = Math.max(0, productPrice - downPayment);
  const markupAmount = principal * markupRate * termMonths;
  const totalDebt = principal + markupAmount;
  const totalSalePrice = downPayment + totalDebt;
  const monthlyPayment = termMonths > 0 ? totalDebt / termMonths : 0;
  return {
    productPrice,
    downPayment,
    termMonths,
    markupRate,
    principal,
    markupAmount,
    totalSalePrice,
    monthlyPayment,
  };
}

export function formatMoney(value: number, currency = "₸"): string {
  if (!Number.isFinite(value)) return `0 ${currency}`;
  return `${Math.round(value).toLocaleString("ru-RU")} ${currency}`;
}

export function buildSchedule(
  startDate: Date,
  termMonths: number,
  monthly: number,
): { seq: number; dueDate: Date; amount: number }[] {
  const out: { seq: number; dueDate: Date; amount: number }[] = [];
  for (let i = 1; i <= termMonths; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    out.push({ seq: i, dueDate: d, amount: monthly });
  }
  return out;
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}