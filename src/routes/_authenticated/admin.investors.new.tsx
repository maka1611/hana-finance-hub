import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { createInvestor, listClientsForInvestor } from "@/lib/investors.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Check, ChevronsUpDown, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/investors/new")({
  component: NewInvestor,
});

function NewInvestor() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(createInvestor);
  const loadClients = useServerFn(listClientsForInvestor);
  const { data: clients } = useQuery({
    queryKey: ["clients-for-investor"],
    queryFn: () => loadClients(),
  });
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [capital, setCapital] = useState<number>(0);
  const [sharePct, setSharePct] = useState<number>(50);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [termMonths, setTermMonths] = useState<number>(0);
  const [capitalize, setCapitalize] = useState<boolean>(false);
  const [pickedClientId, setPickedClientId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const pickedClient = clients?.find((c) => c.id === pickedClientId) ?? null;

  const applyClient = (c: { id: string; full_name: string; email: string; phone: string }) => {
    setPickedClientId(c.id);
    if (c.full_name) setFullName(c.full_name);
    if (c.email) setEmail(c.email);
    if (c.phone) setPhone(c.phone);
    setPickerOpen(false);
  };

  const clearClient = () => {
    setPickedClientId(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Укажите ФИО");
    setLoading(true);
    try {
      const inv = await fn({
        data: {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          comment: comment.trim() || null,
          total_capital: capital,
          profit_share_rate: sharePct / 100,
          is_active: true,
          contract_start_date: startDate || null,
          contract_term_months: termMonths > 0 ? termMonths : null,
          capitalize_profit: capitalize,
        },
      });
      toast.success("Инвестор добавлен");
      qc.invalidateQueries({ queryKey: ["investors"] });
      navigate({
        to: "/admin/investors/$id",
        params: { id: (inv as { id: string }).id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Link to="/admin/investors" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-3.5" /> К списку
      </Link>
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          <Briefcase className="inline size-3 mr-1" /> Новый инвестор
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Добавить инвестора</h1>
      </div>

      <form onSubmit={submit} className="space-y-5 bg-card rounded-2xl ring-1 ring-border p-5 sm:p-6">
        <div className="space-y-2">
          <Label>Выбрать из существующих клиентов</Label>
          <div className="flex items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="flex-1 justify-between font-normal"
                >
                  <span className="truncate text-left">
                    {pickedClient
                      ? `${pickedClient.full_name || "Без имени"}${pickedClient.email ? ` · ${pickedClient.email}` : ""}`
                      : "Не выбран — заполнить вручную"}
                  </span>
                  <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[min(560px,90vw)]" align="start">
                <Command
                  filter={(value, search) =>
                    value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                  }
                >
                  <CommandInput placeholder="Поиск по имени, email или телефону..." />
                  <CommandList>
                    <CommandEmpty>Клиенты не найдены</CommandEmpty>
                    <CommandGroup>
                      {(clients ?? []).map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.full_name} ${c.email} ${c.phone}`}
                          disabled={c.already_investor}
                          onSelect={() => !c.already_investor && applyClient(c)}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm truncate">{c.full_name || "Без имени"}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {c.email || "—"}
                              {c.phone ? ` · ${c.phone}` : ""}
                            </div>
                          </div>
                          {c.already_investor ? (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                              уже инвестор
                            </span>
                          ) : pickedClientId === c.id ? (
                            <Check className="size-4 shrink-0" />
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {pickedClient && (
              <Button type="button" variant="ghost" size="icon" onClick={clearClient} title="Сбросить">
                <X className="size-4" />
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Поля ФИО, email и телефон заполнятся автоматически. Связь установится по email после сохранения.
          </p>
        </div>
        <div className="space-y-2">
          <Label>ФИО *</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ..." />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Вложенный капитал, ₽</Label>
            <Input
              type="number"
              min={0}
              value={capital || ""}
              onChange={(e) => setCapital(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Доля прибыли инвестора, %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={sharePct}
              onChange={(e) => setSharePct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            />
            <p className="text-[11px] text-muted-foreground">
              % от нашей наценки, которую получает инвестор с каждого контракта.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Комментарий</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Дата начала договора</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Срок договора, мес</Label>
            <Input
              type="number"
              min={0}
              value={termMonths || ""}
              onChange={(e) => setTermMonths(Number(e.target.value) || 0)}
              placeholder="например, 12"
            />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Switch checked={capitalize} onCheckedChange={setCapitalize} id="capitalize-new" />
          <div className="space-y-0.5">
            <Label htmlFor="capitalize-new" className="cursor-pointer">Капитализировать прибыль</Label>
            <p className="text-[11px] text-muted-foreground">
              Заработанная доля наценки будет автоматически добавляться в «Свободно» и доступна для нового размещения.
            </p>
          </div>
        </div>
        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? "Сохранение..." : "Добавить инвестора"}
        </Button>
      </form>
    </div>
  );
}