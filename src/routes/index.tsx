import { createFileRoute } from "@tanstack/react-router";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Calculator } from "@/components/Calculator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NoorPay — Халяльная рассрочка без процентов" },
      {
        name: "description",
        content:
          "Прозрачная рассрочка по нормам Шариата: фиксированная наценка, без скрытых процентов и штрафов. Рассчитайте платёж за минуту.",
      },
      { property: "og:title", content: "NoorPay — Халяльная рассрочка" },
      {
        property: "og:description",
        content: "Калькулятор халяльной рассрочки с фиксированной наценкой 4.5% в месяц.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setIsAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);
  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="font-extrabold text-xl tracking-tighter uppercase">
              Noor<span className="text-primary">Pay</span>
            </Link>
            <div className="hidden md:flex gap-6 text-sm font-medium text-muted-foreground">
              <a href="#calc" className="hover:text-primary transition-colors">Калькулятор</a>
              <a href="#principles" className="hover:text-primary transition-colors">Принципы</a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAuthed ? (
              <>
                <button
                  onClick={logout}
                  className="text-sm font-medium px-4 py-2 hover:bg-muted rounded-full transition-colors"
                >
                  Выйти
                </button>
                <Link
                  to="/app"
                  className="text-sm font-semibold bg-primary text-primary-foreground px-5 py-2 rounded-full hover:opacity-90 transition-all"
                >
                  Кабинет
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium px-4 py-2 hover:bg-muted rounded-full transition-colors"
                >
                  Войти
                </Link>
                <Link
                  to="/signup"
                  className="text-sm font-semibold bg-primary text-primary-foreground px-5 py-2 rounded-full hover:opacity-90 transition-all"
                >
                  Начать
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <section id="calc" className="relative pt-16 pb-24 girih-pattern">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-5">
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6 text-balance">
                Честная рассрочка <br />
                без процентов.
              </h1>
              <p className="text-lg text-muted-foreground max-w-[40ch] mb-8">
                Прозрачная наценка, фиксированные платежи и полное соответствие
                нормам Шариата.
                <br />
                <span className="block mt-3">Покупайте сегодня — платите потом.</span>
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-primary" /> Halal
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-primary" /> Без штрафов
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-primary" /> Фикс-цена
                </span>
              </div>
            </div>

            <div className="lg:col-span-7">
              <Calculator />
            </div>
          </div>
        </div>
      </section>

      <section id="principles" className="py-20 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-10">
            {[
              {
                n: "01",
                t: "Мурабаха",
                d: "Мы выкупаем товар для вас и перепродаём его с фиксированной наценкой. Никаких скрытых процентов.",
              },
              {
                n: "02",
                t: "Без штрафов",
                d: "Мы не начисляем пени за просрочку как прибыль компании. Всё честно и прозрачно.",
              },
              {
                n: "03",
                t: "Фикс-цена",
                d: "Итоговая цена продажи фиксируется в момент договора и не меняется ни при каких обстоятельствах.",
              },
            ].map((it) => (
              <div key={it.n} className="space-y-4">
                <div className="size-12 bg-primary/5 rounded-xl flex items-center justify-center text-primary font-bold">
                  {it.n}
                </div>
                <h3 className="text-xl font-bold">{it.t}</h3>
                <p className="text-muted-foreground leading-relaxed">{it.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <span className="font-extrabold text-lg tracking-tighter uppercase">
            Noor<span className="text-primary">Pay</span>
          </span>
          <p className="text-xs text-muted-foreground">
            © 2026 NoorPay. Не является кредитной организацией.
          </p>
        </div>
      </footer>
    </div>
  );
}
