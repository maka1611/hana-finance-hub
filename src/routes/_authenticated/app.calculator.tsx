import { createFileRoute } from "@tanstack/react-router";
import { Calculator } from "@/components/Calculator";

export const Route = createFileRoute("/_authenticated/app/calculator")({
  head: () => ({ meta: [{ title: "Калькулятор — NoorPay" }] }),
  component: CalculatorPage,
});

function CalculatorPage() {
  return (
    <div className="w-full min-w-0 max-w-4xl space-y-6 md:space-y-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Расчёт
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
          Калькулятор рассрочки
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Прикиньте ежемесячный платёж и итоговую стоимость по вашей персональной ставке.
          Когда определитесь — нажмите «Подать заявку», и параметры подставятся автоматически.
        </p>
      </div>
      <Calculator />
    </div>
  );
}