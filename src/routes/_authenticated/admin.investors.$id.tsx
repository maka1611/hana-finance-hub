import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getInvestor,
  addInvestorContribution,
  updateInvestor,
} from "@/lib/investors.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, AlertTriangle, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/investors/$id")({
  component: InvestorDetail,
});

function InvestorDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getInvestor);
  const updFn = useServerFn(updateInvestor);
  const contribFn = useServerFn(addInvestorContribution);
  const { data, isLoading } = useQuery({
    queryKey: ["investor", id],
    queryFn: () => fn({ data: { id } }),
  });
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sharePct, setSharePct] = useState(50);
  const [comment, setComment] = useState("");
  const [active, setActive] = useState(true);
  const [contribAmount, setContribAmount] = useState<number>(0);
  const [contribNote, setContribNote] = useState("");
  const [contribDate, setContribDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [contribTerm, setContribTerm] = useState<number>(0);
  const [startDate, setStartDate] = useState<string>("");
  const [termMonths, setTermMonths] = useState<number>(0);

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Загрузка...</p>;

  const { investor, summary, contracts, payments, contributions, overdueSchedules } = data;

  const startEdit = () => {
    setName(investor.full_name);
    setPhone(investor.phone ?? "");
    setEmail(investor.email ?? "");
    setSharePct(Number(investor.profit_share_rate) * 100);
    setComment(investor.comment ?? "");
    setActive(investor.is_active);
    setStartDate(investor.contract_start_date ?? "");
    setTermMonths(investor.contract_term_months ?? 0);
    setEdit(true);
  };

  const saveEdit = async () => {
    try {
      await updFn({
        data: {
          id,
          patch: {
            full_name: name.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            comment: comment.trim() || null,
            profit_share_rate: sharePct / 100,
            is_active: active,
            contract_start_date: startDate || null,
            contract_term_months: termMonths > 0 ? termMonths : null,
          },
        },
      });
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["investor", id] });
      qc.invalidateQueries({ queryKey: ["investors"] });
      setEdit(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const addContrib = async () => {
    if (!contribAmount) return toast.error("Укажите сумму (положительную для пополнения, отрицательную для вывода)");
    try {
      await contribFn({
        data: {
          investor_id: id,
          amount: contribAmount,
          note: contribNote || null,
          operation_date: contribDate || null,
          term_months: contribTerm > 0 ? contribTerm : null,
        },
      });
      toast.success("Операция записана");
      setContribAmount(0);
      setContribNote("");
      setContribTerm(0);
      setContribDate(new Date().toISOString().slice(0, 10));
      qc.invalidateQueries({ queryKey: ["investor", id] });
      qc.invalidateQueries({ queryKey: ["investors"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/investors" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-3.5" /> К инвесторам
      </Link>

      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
            <Briefcase className="inline size-3 mr-1" /> Инвестор
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight break-words">{investor.full_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {investor.phone || "—"}
            {investor.email && <> · {investor.email}</>}
            {" · "}доля {(Number(investor.profit_share_rate) * 100).toFixed(0)}%
            {!investor.is_active && <> · <span className="text-destructive">архив</span></>}
          </p>
        </div>
        {!edit && <Button variant="outline" onClick={startEdit}>Редактировать</Button>}
      </div>

      {edit && (
        <div className="bg-card rounded-2xl ring-1 ring-border p-5 sm:p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>ФИО</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Телефон</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Доля прибыли, %</Label>
              <Input type="number" min={0} max={100} step="0.1" value={sharePct}
                onChange={(e) => setSharePct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
            </div>
          </div>
          <div className="space-y-2"><Label>Комментарий</Label><Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /></div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="active" />
            <Label htmlFor="active" className="cursor-pointer">Активен</Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveEdit}>Сохранить</Button>
            <Button variant="outline" onClick={() => setEdit(false)}>Отмена</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Вложено" value={formatMoney(summary.invested)} />
        <Stat label="Размещено" value={formatMoney(summary.placed)} />
        <Stat label="Свободно" value={formatMoney(summary.free)} highlight />
        <Stat label="Просрочки" value={`${summary.overdueCount} · ${formatMoney(summary.overdueAmount)}`} />
        <Stat label="Общая наценка" value={formatMoney(summary.totalMarkup)} />
        <Stat label="Ожид. прибыль" value={formatMoney(summary.expectedProfit)} />
        <Stat label="Получено прибыли" value={formatMoney(summary.receivedProfit)} />
        <Stat label="Контрактов" value={`${summary.activeCount} акт / ${summary.contractsCount}`} />
      </div>

      <Tabs defaultValue="contracts">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="contracts">Контракты ({contracts.length})</TabsTrigger>
          <TabsTrigger value="overdue">Просрочки ({overdueSchedules.length})</TabsTrigger>
          <TabsTrigger value="payments">Платежи ({payments.length})</TabsTrigger>
          <TabsTrigger value="contrib">Пополнения ({contributions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="mt-4">
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Контрактов нет</p>
          ) : (
            <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
              {contracts.map((c) => (
                <Link
                  key={c.id}
                  to="/admin/contracts/$id"
                  params={{ id: c.id }}
                  className="block p-4 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{c.product_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.profile?.full_name ?? "—"} · {c.status}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm">{formatMoney(Number(c.principal))}</div>
                      <div className="text-[10px] text-muted-foreground">
                        наценка {formatMoney(Number(c.markup_amount))}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="overdue" className="mt-4">
          {overdueSchedules.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Просрочек нет</p>
          ) : (
            <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
              {overdueSchedules.map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <AlertTriangle className="size-4 text-destructive shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold truncate">{s.contract?.product_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {s.profile?.full_name ?? "—"} · платёж #{s.seq} от {formatDate(s.due_date)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatMoney(Number(s.amount))}</div>
                    {s.contract && (
                      <Link to="/admin/contracts/$id" params={{ id: s.contract.id }}
                        className="text-[10px] text-primary underline-offset-2 hover:underline">
                        к контракту
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Платежей нет</p>
          ) : (
            <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
              {payments.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between">
                  <div className="text-sm">{formatDate(p.paid_at)}</div>
                  <div className="font-bold">{formatMoney(Number(p.amount))}</div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contrib" className="mt-4 space-y-4">
          <div className="bg-card rounded-2xl ring-1 ring-border p-4 sm:p-5">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
              <Plus className="inline size-3 mr-1" /> Новая операция
            </div>
            <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Сумма (+/-)</Label>
                <Input
                  type="number"
                  value={contribAmount || ""}
                  onChange={(e) => setContribAmount(Number(e.target.value) || 0)}
                  placeholder="100000 или -50000"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Комментарий</Label>
                <Input value={contribNote} onChange={(e) => setContribNote(e.target.value)} />
              </div>
              <Button onClick={addContrib}>Записать</Button>
            </div>
          </div>
          {contributions.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Операций нет</p>
          ) : (
            <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
              {contributions.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{formatDate(c.created_at)}</div>
                    {c.note && <div className="text-xs text-muted-foreground truncate">{c.note}</div>}
                  </div>
                  <div className={`font-bold ${Number(c.amount) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {Number(c.amount) >= 0 ? "+" : ""}
                    {formatMoney(Number(c.amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${highlight ? "bg-primary text-primary-foreground ring-transparent" : "bg-card ring-border"}`}>
      <div className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${highlight ? "opacity-70" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className="font-extrabold text-base">{value}</div>
    </div>
  );
}