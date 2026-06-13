import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = {
  from: string | null;
  to: string | null;
  sheets: string[];
};

// Lazy-loaded server-only modules. Populated inside the handler so the
// client bundle never pulls in xlsx or the service-role client.
let XLSX!: typeof import("xlsx");
let supabaseAdmin!: typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

const MONEY_FMT = '#,##0\\ "₽"';

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role as string);
  const ok = roles.some((r) => r === "admin" || r === "owner");
  if (!ok) throw new Error("Forbidden: admin role required");
}

const RU_STATUS_CONTRACT: Record<string, string> = {
  pending: "Ожидает",
  active: "Активный",
  completed: "Закрыт",
  cancelled: "Отменён",
  defaulted: "Просрочен",
};
const RU_STATUS_PAYMENT: Record<string, string> = {
  pending: "Ожидает",
  paid: "Оплачен",
  partial: "Частично",
  overdue: "Просрочен",
  cancelled: "Отменён",
  rescheduled: "Перенесён",
  scheduled: "Запланирован",
};

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function money(v: unknown): number {
  return Math.round(num(v));
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "";
  return v.length > 10 ? v.slice(0, 10) : v;
}

function toRangeFilter<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
  q: T,
  col: string,
  from: string | null,
  to: string | null,
  isTimestamp: boolean,
): T {
  let r = q;
  if (from) r = r.gte(col, isTimestamp ? `${from}T00:00:00Z` : from);
  if (to) r = r.lte(col, isTimestamp ? `${to}T23:59:59Z` : to);
  return r;
}

function makeSheet<T extends Record<string, unknown>>(rows: T[], headers: { key: keyof T; label: string; money?: boolean }[]) {
  const aoa: unknown[][] = [headers.map((h) => h.label)];
  for (const r of rows) {
    aoa.push(headers.map((h) => r[h.key] ?? ""));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // freeze top row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  (ws as Record<string, unknown> & { ["!autofilter"]?: { ref: string } })["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: Math.max(rows.length, 1) } }),
  };
  // column widths
  const cols = headers.map((h, i) => {
    let max = h.label.length;
    for (let ri = 0; ri < rows.length; ri++) {
      const v = rows[ri][h.key];
      const s = v == null ? "" : String(v);
      if (s.length > max) max = s.length;
    }
    return { wch: Math.min(Math.max(max + 2, 10), 50) };
  });
  ws["!cols"] = cols;
  // money format
  headers.forEach((h, ci) => {
    if (!h.money) return;
    for (let ri = 1; ri <= rows.length; ri++) {
      const addr = XLSX.utils.encode_cell({ c: ci, r: ri });
      const cell = ws[addr];
        if (cell && typeof cell.v === "number") cell.z = MONEY_FMT;
    }
  });
  return ws;
}

export const exportReportXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => input)
  .handler(async ({ data, context }) => {
    XLSX = await import("xlsx");
    ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
    await assertAdmin(context.userId);
    const { from, to, sheets } = data;
    const want = new Set(sheets);

    // Fetch all needed data in parallel
    const [profilesRes, contractsRes, schedulesRes, applicationsRes, investorsRes, contributionsRes, paymentsRes] =
      await Promise.all([
        want.has("clients") || want.has("contracts") || want.has("schedules") || want.has("applications") || want.has("summary")
          ? supabaseAdmin.from("profiles").select("id,full_name,email,phone,created_at")
          : Promise.resolve({ data: [] as any[] }),
        want.has("contracts") || want.has("schedules") || want.has("clients") || want.has("summary")
          ? supabaseAdmin
              .from("installment_contracts")
              .select("id,client_id,product_name,product_price,principal,markup_rate,markup_amount,total_sale_price,monthly_payment,term_months,start_date,status,investor_id,created_at")
              .is("deleted_at", null)
          : Promise.resolve({ data: [] as any[] }),
        want.has("schedules") || want.has("contracts") || want.has("clients") || want.has("summary")
          ? supabaseAdmin
              .from("payment_schedules")
              .select("id,contract_id,seq,due_date,amount,paid_amount,status")
          : Promise.resolve({ data: [] as any[] }),
        want.has("applications")
          ? toRangeFilter(
              supabaseAdmin
                .from("installment_applications")
                .select("id,client_id,client_full_name,client_phone,product_name,product_price,term_months,status,admin_note,created_at"),
              "created_at",
              from,
              to,
              true,
            )
          : Promise.resolve({ data: [] as any[] }),
        want.has("investors") || want.has("summary")
          ? supabaseAdmin
              .from("investors")
              .select("id,full_name,email,phone,total_capital,profit_share_rate,is_active,created_at")
          : Promise.resolve({ data: [] as any[] }),
        want.has("investors")
          ? supabaseAdmin
              .from("investor_contributions")
              .select("id,investor_id,amount,operation_date,due_date,note,created_at")
          : Promise.resolve({ data: [] as any[] }),
        want.has("summary")
          ? supabaseAdmin.from("payments").select("amount,paid_at,contract_id")
          : Promise.resolve({ data: [] as any[] }),
      ]);

    const allProfiles = (profilesRes.data ?? []) as any[];
    const allContracts = (contractsRes.data ?? []) as any[];
    const allSchedules = (schedulesRes.data ?? []) as any[];
    const allApplications = (applicationsRes.data ?? []) as any[];
    const allInvestors = (investorsRes.data ?? []) as any[];
    const allContributions = (contributionsRes.data ?? []) as any[];
    const allPayments = (paymentsRes.data ?? []) as any[];

    const profileById = new Map<string, any>(allProfiles.map((p) => [p.id, p]));
    const investorById = new Map<string, any>(allInvestors.map((i) => [i.id, i]));

    // Filtered subsets by natural date
    const inRange = (d: string | null | undefined, useTime: boolean) => {
      if (!d) return false;
      const x = d.slice(0, 10);
      if (from && x < from) return false;
      if (to && x > to) return false;
      return true;
    };

    const contractsInPeriod = from || to ? allContracts.filter((c) => inRange(c.start_date, false)) : allContracts;
    const schedulesInPeriod = from || to ? allSchedules.filter((s) => inRange(s.due_date, false)) : allSchedules;
    const clientsInPeriod = from || to ? allProfiles.filter((p) => inRange(p.created_at, true)) : allProfiles;
    const investorsInPeriod = from || to ? allInvestors.filter((i) => inRange(i.created_at, true)) : allInvestors;
    const paymentsInPeriod = from || to ? allPayments.filter((p) => inRange(p.paid_at, true)) : allPayments;

    const wb = XLSX.utils.book_new();

    // Sheet: Клиенты
    if (want.has("clients")) {
      const contractsByClient = new Map<string, any[]>();
      for (const c of allContracts) {
        const arr = contractsByClient.get(c.client_id) ?? [];
        arr.push(c);
        contractsByClient.set(c.client_id, arr);
      }
      const schedulesByContract = new Map<string, any[]>();
      for (const s of allSchedules) {
        const arr = schedulesByContract.get(s.contract_id) ?? [];
        arr.push(s);
        schedulesByContract.set(s.contract_id, arr);
      }
      const rows = clientsInPeriod.map((p) => {
        const ctrs = contractsByClient.get(p.id) ?? [];
        const totalSold = ctrs.reduce((a, c) => a + num(c.total_sale_price), 0);
        let paid = 0;
        let remaining = 0;
        const activeCount = ctrs.filter((c) => c.status === "active").length;
        for (const c of ctrs) {
          const sch = schedulesByContract.get(c.id) ?? [];
          for (const s of sch) {
            paid += num(s.paid_amount);
            remaining += Math.max(num(s.amount) - num(s.paid_amount), 0);
          }
        }
        return {
          full_name: p.full_name ?? "",
          email: p.email ?? "",
          phone: p.phone ?? "",
          created_at: fmtDate(p.created_at),
          contracts_total: ctrs.length,
          contracts_active: activeCount,
          total_sold: totalSold,
          paid,
          remaining,
        };
      });
      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(rows, [
          { key: "full_name", label: "ФИО" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Телефон" },
          { key: "created_at", label: "Дата регистрации" },
          { key: "contracts_total", label: "Всего рассрочек" },
          { key: "contracts_active", label: "Активных" },
          { key: "total_sold", label: "Сумма контрактов", money: true },
          { key: "paid", label: "Оплачено", money: true },
          { key: "remaining", label: "Остаток", money: true },
        ]),
        "Клиенты",
      );
    }

    // Sheet: Рассрочки
    if (want.has("contracts")) {
      const schedulesByContract = new Map<string, any[]>();
      for (const s of allSchedules) {
        const arr = schedulesByContract.get(s.contract_id) ?? [];
        arr.push(s);
        schedulesByContract.set(s.contract_id, arr);
      }
      const rows = contractsInPeriod.map((c) => {
        const sch = schedulesByContract.get(c.id) ?? [];
        const paidCount = sch.filter((s) => s.status === "paid").length;
        const paidSum = sch.reduce((a, s) => a + num(s.paid_amount), 0);
        const remaining = Math.max(num(c.total_sale_price) - paidSum, 0);
        const cl = profileById.get(c.client_id);
        const inv = c.investor_id ? investorById.get(c.investor_id) : null;
        return {
          client_name: cl?.full_name ?? "",
          client_email: cl?.email ?? "",
          product: c.product_name,
          start_date: fmtDate(c.start_date),
          term: c.term_months,
          product_price: num(c.product_price),
          markup: num(c.markup_amount),
          total: num(c.total_sale_price),
          monthly: num(c.monthly_payment),
          progress: `${paidCount}/${sch.length}`,
          paid_sum: paidSum,
          remaining,
          status: RU_STATUS_CONTRACT[c.status] ?? c.status,
          investor: inv?.full_name ?? "",
        };
      });
      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(rows, [
          { key: "client_name", label: "Клиент" },
          { key: "client_email", label: "Email клиента" },
          { key: "product", label: "Товар" },
          { key: "start_date", label: "Дата старта" },
          { key: "term", label: "Срок (мес)" },
          { key: "product_price", label: "Цена товара", money: true },
          { key: "markup", label: "Наценка", money: true },
          { key: "total", label: "Итого", money: true },
          { key: "monthly", label: "Ежемесячный платёж", money: true },
          { key: "progress", label: "Оплачено платежей" },
          { key: "paid_sum", label: "Сумма оплачено", money: true },
          { key: "remaining", label: "Остаток", money: true },
          { key: "status", label: "Статус" },
          { key: "investor", label: "Инвестор" },
        ]),
        "Рассрочки",
      );
    }

    // Sheet: График платежей
    if (want.has("schedules")) {
      const contractById = new Map<string, any>(allContracts.map((c) => [c.id, c]));
      const rows = schedulesInPeriod
        .slice()
        .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
        .map((s) => {
          const c = contractById.get(s.contract_id);
          const cl = c ? profileById.get(c.client_id) : null;
          const amount = num(s.amount);
          const paid = num(s.paid_amount);
          return {
            due_date: fmtDate(s.due_date),
            client: cl?.full_name ?? "",
            product: c?.product_name ?? "",
            seq: s.seq,
            amount,
            paid,
            remaining: Math.max(amount - paid, 0),
            status: RU_STATUS_PAYMENT[s.status] ?? s.status,
          };
        });
      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(rows, [
          { key: "due_date", label: "Дата платежа" },
          { key: "client", label: "Клиент" },
          { key: "product", label: "Товар" },
          { key: "seq", label: "№" },
          { key: "amount", label: "Сумма", money: true },
          { key: "paid", label: "Оплачено", money: true },
          { key: "remaining", label: "Остаток", money: true },
          { key: "status", label: "Статус" },
        ]),
        "График платежей",
      );
    }

    // Sheet: Инвесторы + Вложения
    if (want.has("investors")) {
      const contribsByInvestor = new Map<string, any[]>();
      for (const c of allContributions) {
        const arr = contribsByInvestor.get(c.investor_id) ?? [];
        arr.push(c);
        contribsByInvestor.set(c.investor_id, arr);
      }
      const invRows = investorsInPeriod.map((i) => {
        const cs = contribsByInvestor.get(i.id) ?? [];
        const sum = cs.reduce((a, c) => a + num(c.amount), 0);
        return {
          full_name: i.full_name,
          email: i.email ?? "",
          phone: i.phone ?? "",
          created_at: fmtDate(i.created_at),
          capital: num(i.total_capital),
          share: `${(num(i.profit_share_rate) * 100).toFixed(0)}%`,
          contribs_count: cs.length,
          contribs_sum: sum,
          status: i.is_active ? "Активный" : "Неактивный",
        };
      });
      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(invRows, [
          { key: "full_name", label: "ФИО" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Телефон" },
          { key: "created_at", label: "Дата регистрации" },
          { key: "capital", label: "Капитал", money: true },
          { key: "share", label: "Доля прибыли" },
          { key: "contribs_count", label: "Вложений (шт)" },
          { key: "contribs_sum", label: "Сумма вложений", money: true },
          { key: "status", label: "Статус" },
        ]),
        "Инвесторы",
      );

      const contribRows = allContributions
        .filter((c) => (from || to ? inRange(c.operation_date, false) : true))
        .slice()
        .sort((a, b) => (a.operation_date < b.operation_date ? 1 : -1))
        .map((c) => {
          const inv = investorById.get(c.investor_id);
          return {
            operation_date: fmtDate(c.operation_date),
            investor: inv?.full_name ?? "",
            amount: num(c.amount),
            due_date: fmtDate(c.due_date),
            note: c.note ?? "",
          };
        });
      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(contribRows, [
          { key: "operation_date", label: "Дата операции" },
          { key: "investor", label: "Инвестор" },
          { key: "amount", label: "Сумма", money: true },
          { key: "due_date", label: "Срок возврата" },
          { key: "note", label: "Комментарий" },
        ]),
        "Вложения инвесторов",
      );
    }

    // Sheet: Заявки
    if (want.has("applications")) {
      const rows = allApplications
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .map((a) => {
          const cl = profileById.get(a.client_id);
          return {
            created_at: fmtDate(a.created_at),
            client: a.client_full_name || cl?.full_name || "",
            phone: a.client_phone || cl?.phone || "",
            product: a.product_name,
            price: num(a.product_price),
            term: a.term_months,
            status: RU_STATUS_APP[a.status] ?? a.status,
            admin_note: a.admin_note ?? "",
          };
        });
      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(rows, [
          { key: "created_at", label: "Дата" },
          { key: "client", label: "Клиент" },
          { key: "phone", label: "Телефон" },
          { key: "product", label: "Товар" },
          { key: "price", label: "Сумма", money: true },
          { key: "term", label: "Срок (мес)" },
          { key: "status", label: "Статус" },
          { key: "admin_note", label: "Комментарий" },
        ]),
        "Заявки",
      );
    }

    // Sheet: Финансовая сводка
    if (want.has("summary")) {
      const newContracts = contractsInPeriod.length;
      const newContractsSum = contractsInPeriod.reduce((a, c) => a + num(c.total_sale_price), 0);
      const newContractsMarkup = contractsInPeriod.reduce((a, c) => a + num(c.markup_amount), 0);
      const newContractsPrincipal = contractsInPeriod.reduce((a, c) => a + num(c.principal), 0);
      const paymentsCollected = paymentsInPeriod.reduce((a, p) => a + num(p.amount), 0);
      const dueInPeriod = schedulesInPeriod.reduce((a, s) => a + num(s.amount), 0);
      const overdueInPeriod = schedulesInPeriod
        .filter((s) => s.status === "overdue")
        .reduce((a, s) => a + Math.max(num(s.amount) - num(s.paid_amount), 0), 0);
      const newClients = clientsInPeriod.length;
      const newInvestors = investorsInPeriod.length;
      const newInvestorContribs = allContributions
        .filter((c) => (from || to ? inRange(c.operation_date, false) : true))
        .reduce((a, c) => a + num(c.amount), 0);
      const activeContractsTotal = allContracts.filter((c) => c.status === "active").length;

      const periodLabel = !from && !to ? "За всё время" : `${from ?? "—"} … ${to ?? "—"}`;
      const summaryRows: { metric: string; value: number | string; money?: boolean }[] = [
        { metric: "Период", value: periodLabel },
        { metric: "Новых контрактов (шт)", value: newContracts },
        { metric: "Сумма новых контрактов", value: newContractsSum, money: true },
        { metric: "Себестоимость (выдано)", value: newContractsPrincipal, money: true },
        { metric: "Наценка по новым контрактам", value: newContractsMarkup, money: true },
        { metric: "Получено платежей за период", value: paymentsCollected, money: true },
        { metric: "Сумма платежей по графику за период", value: dueInPeriod, money: true },
        { metric: "Просрочено за период", value: overdueInPeriod, money: true },
        { metric: "Новых клиентов", value: newClients },
        { metric: "Новых инвесторов", value: newInvestors },
        { metric: "Привлечено инвестиций за период", value: newInvestorContribs, money: true },
        { metric: "Активных контрактов (всего на текущий момент)", value: activeContractsTotal },
      ];
      const aoa: unknown[][] = [["Показатель", "Значение"]];
      for (const r of summaryRows) aoa.push([r.metric, r.value]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 50 }, { wch: 28 }];
      summaryRows.forEach((r, idx) => {
        if (!r.money) return;
        const addr = XLSX.utils.encode_cell({ c: 1, r: idx + 1 });
        const cell = ws[addr];
        if (cell && typeof cell.v === "number") cell.z = '#,##0.00\\ "₽"';
      });
      XLSX.utils.book_append_sheet(wb, ws, "Финансовая сводка");
    }

    // Ensure at least one sheet
    if (wb.SheetNames.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([["Нет данных"]]);
      XLSX.utils.book_append_sheet(wb, ws, "Пусто");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
    const base64 = Buffer.from(buf).toString("base64");
    const fname = `noorpay-report-${from ?? "all"}_${to ?? "now"}.xlsx`;
    return { base64, filename: fname };
  });