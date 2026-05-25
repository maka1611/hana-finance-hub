import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminGetContract, adminRecordPayment, adminUpdateContractStatus, adminDeleteContract } from "@/lib/admin.functions";
import { listInvestorsLite, setContractInvestor } from "@/lib/investors.functions";
import { formatMoney, formatDate } from "@/lib/installment";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Trash2, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/contracts/$id")({
  component: AdminContractDetail,
});

function AdminContractDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fn = useServerFn(adminGetContract);
  const recordFn = useServerFn(adminRecordPayment);
  const statusFn = useServerFn(adminUpdateContractStatus);
  const deleteFn = useServerFn(adminDeleteContract);
  const investorsFn = useServerFn(listInvestorsLite);
  const setInvFn = useServerFn(setContractInvestor);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-contract", id],
    queryFn: () => fn({ data: { id } }),
  });
  const { data: investors } = useQuery({
    queryKey: ["investors-lite"],
    queryFn: () => investorsFn(),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Загрузка...</p>;

  const { contract, schedule, profile, payments } = data;
  const currentInvestor = (investors ?? []).find(
    (i) => i.id === (contract as { investor_id?: string | null }).investor_id,
  );

  const changeInvestor = async (val: string) => {
    try {
      await setInvFn({ data: { contract_id: id, investor_id: val || null } });
      toast.success("Инвестор обновлён");
      qc.invalidateQueries({ queryKey: ["admin-contract", id] });
      qc.invalidateQueries({ queryKey: ["investors"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handlePay = async (sid: string, amount: number) => {
    setBusy(sid);
    try {
      await recordFn({ data: { scheduleId: sid, amount, method: "cash" } });
      toast.success("Платёж записан");
      qc.invalidateQueries({ queryKey: ["admin-contract", id] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (s: string) => {
    try {
      await statusFn({ data: { id, status: s as "active" | "closed" | "overdue" | "pending" } });
      toast.success("Статус обновлён");
      qc.invalidateQueries({ queryKey: ["admin-contract", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFn({ data: { id } });
      toast.success("Контракт удалён");
      qc.invalidateQueries({ queryKey: ["admin-contracts"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      navigate({ to: "/admin/contracts" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <Link to="/admin/contracts" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-3.5" /> К контрактам
      </Link>

      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
            Контракт #{contract.id.slice(0, 8)}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">{contract.product_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Клиент:{" "}
            <Link
              to="/admin/clients/$id"
              params={{ id: contract.client_id }}
              className="text-foreground font-medium hover:text-primary underline-offset-4 hover:underline"
            >
              {profile?.full_name ?? "—"}
            </Link>
            {profile?.email && <> · {profile.email}</>}
            {profile?.phone && <> · {profile.phone}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Статус:</span>
          <Select value={contract.status} onValueChange={changeStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">ожидает</SelectItem>
              <SelectItem value="active">активна</SelectItem>
              <SelectItem value="overdue">просрочена</SelectItem>
              <SelectItem value="closed">закрыта</SelectItem>
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleting}>
                <Trash2 className="size-4" /> Удалить
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить контракт?</AlertDialogTitle>
                <AlertDialogDescription>
                  Контракт «{contract.product_name}» и все связанные платежи и график
                  будут безвозвратно удалены. Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Mini label="Цена товара" value={formatMoney(Number(contract.product_price))} />
        <Mini label="Первый взнос" value={formatMoney(Number(contract.down_payment))} />
        <Mini
          label={`Наценка ${(Number(contract.markup_rate) * 100).toFixed(2)}%/мес · ${contract.term_months} мес`}
          value={formatMoney(Number(contract.markup_amount))}
        />
        <Mini
          label="Итоговая наценка"
          value={`${(Number(contract.markup_rate) * Number(contract.term_months) * 100).toFixed(1)}%`}
        />
        <Mini label="Итоговая цена" value={formatMoney(Number(contract.total_sale_price))} highlight />
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border p-4 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Briefcase className="size-4 text-muted-foreground" />
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Инвестор:</span>
            {currentInvestor ? (
              <Link
                to="/admin/investors/$id"
                params={{ id: currentInvestor.id }}
                className="font-bold hover:text-primary underline-offset-4 hover:underline"
              >
                {currentInvestor.full_name}
              </Link>
            ) : (
              <span className="text-muted-foreground">— собственные средства —</span>
            )}
            {currentInvestor && (
              <span className="text-xs text-muted-foreground">
                · доля {(Number(currentInvestor.profit_share_rate) * 100).toFixed(0)}% ·
                прибыль инвестора {formatMoney(Number(contract.markup_amount) * Number(currentInvestor.profit_share_rate))}
              </span>
            )}
          </div>
          <select
            value={(contract as { investor_id?: string | null }).investor_id ?? ""}
            onChange={(e) => changeInvestor(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— без инвестора —</option>
            {(investors ?? []).map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.full_name} · свободно {formatMoney(inv.free)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4">График платежей</h2>
        <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
          {schedule.map((s) => {
            const overdue = s.status === "pending" && s.due_date < new Date().toISOString().slice(0, 10);
            return (
              <div key={s.id} className="flex items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="size-9 rounded-lg bg-muted flex items-center justify-center font-mono text-xs font-bold">
                    {s.seq}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{formatDate(s.due_date)}</div>
                    <div className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                      {s.status === "paid" ? "оплачен" : overdue ? "просрочен" : "ожидает"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-bold text-right min-w-24">{formatMoney(Number(s.amount))}</div>
                  {s.status === "paid" ? (
                    <CheckCircle2 className="size-5 text-primary" />
                  ) : (
                    <Button size="sm" onClick={() => handlePay(s.id, Number(s.amount))} disabled={busy === s.id}>
                      {busy === s.id ? "..." : "Принять"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4">История платежей</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Платежей пока нет</p>
        ) : (
          <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-semibold text-sm">{formatDate(p.paid_at)}</div>
                  <div className="text-xs text-muted-foreground">{p.method ?? "—"}</div>
                </div>
                <div className="font-bold">{formatMoney(Number(p.amount))}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${highlight ? "bg-primary text-primary-foreground ring-transparent" : "bg-card ring-border"}`}>
      <div className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${highlight ? "opacity-70" : "text-muted-foreground"}`}>{label}</div>
      <div className="font-extrabold text-lg">{value}</div>
    </div>
  );
}
