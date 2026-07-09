import { createFileRoute } from "@tanstack/react-router";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Calculator } from "@/components/Calculator";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none absolute -top-40 -right-40 size-[600px] rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-40 size-[500px] rounded-full bg-primary-glow/15 blur-3xl" />

      <nav className="relative z-50 sticky top-0 border-b border-border/60 bg-background/70 backdrop-blur-xl pt-safe">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl tracking-tight">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
                <span className="size-2 rounded-full bg-white/90" />
              </span>
              <span>Noor<span className="text-gradient-primary">Pay</span></span>
            </Link>
            <div className="hidden md:flex gap-6 text-sm font-medium text-muted-foreground">
              <a href="#calc" className="hover:text-primary transition-colors">
                Калькулятор
              </a>
              <a href="#principles" className="hover:text-primary transition-colors">
                Принципы
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle className="rounded-full" />
            {isAuthed ? (
              <>
                <button
                  onClick={logout}
                  className="text-sm font-medium px-4 py-2 hover:bg-muted rounded-lg transition-colors"
                >
                  Выйти
                </button>
                <Link
                  to="/app"
                  className="text-sm font-semibold bg-gradient-primary text-primary-foreground px-5 py-2 rounded-lg shadow-glow hover:opacity-95 transition-all"
                >
                  Кабинет
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium px-4 py-2 hover:bg-muted rounded-lg transition-colors"
                >
                  Войти
                </Link>
                <Link
                  to="/signup"
                  className="text-sm font-semibold bg-gradient-primary text-primary-foreground px-5 py-2 rounded-lg shadow-glow hover:opacity-95 transition-all"
                >
                  Начать
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <section id="calc" className="relative z-10 pt-20 pb-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur mb-6">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Халяльный финтех · 2026
                </span>
              </div>
              <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.02] mb-6 text-balance">
                Рассрочка <br />
                <span className="text-gradient-primary">без процентов.</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-[52ch] mb-8 leading-relaxed">
                Прозрачная наценка, фиксированные платежи и полное соответствие нормам Шариата.
                Покупайте сегодня — платите потом.
              </p>
              <div className="grid grid-cols-3 gap-3 max-w-md">
                {[
                  { v: "0%", l: "Ставка" },
                  { v: "4.5%", l: "Наценка/мес" },
                  { v: "24ч", l: "Одобрение" },
                ].map((m) => (
                  <div
                    key={m.l}
                    className="rounded-xl border border-border/60 bg-card/40 backdrop-blur px-4 py-3"
                  >
                    <div className="font-display text-2xl font-bold tabular-nums text-foreground">
                      {m.v}
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
                      {m.l}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 relative">
              <div className="absolute -inset-4 bg-gradient-primary opacity-20 blur-2xl rounded-3xl pointer-events-none" />
              <div className="relative rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-2 shadow-elevated">
                <Calculator />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="principles" className="relative z-10 py-24 border-y border-border/60 bg-card/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-14 max-w-2xl">
            <div className="text-[11px] font-mono uppercase tracking-widest text-primary mb-3">
              Как это работает
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
              Три принципа. Один договор.
            </h2>
          </div>
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
              <div
                key={it.n}
                className="group relative rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-6 transition-all hover:border-primary/50 hover:-translate-y-1 hover:shadow-glow"
              >
                <div className="font-mono text-xs tracking-widest text-primary mb-6">{it.n}</div>
                <h3 className="font-display text-2xl font-semibold mb-3">{it.t}</h3>
                <p className="text-muted-foreground leading-relaxed">{it.d}</p>
                <div className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 py-12 border-t border-border/60">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-display font-bold text-lg tracking-tight">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-gradient-primary">
              <span className="size-1.5 rounded-full bg-white/90" />
            </span>
            <span>Noor<span className="text-gradient-primary">Pay</span></span>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 NoorPay. Не является кредитной организацией.
          </p>
        </div>
      </footer>
    </div>
  );
}
