import JSZip from "jszip";
import { resolveTableList } from "./auth.server";

const PAGE_SIZE = 1000;

async function fetchAll(table: string): Promise<unknown[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: unknown[] = [];
  let from = 0;
  // hard cap to avoid runaway
  const HARD_CAP = 200_000;
  while (rows.length < HARD_CAP) {
    const { data, error } = await supabaseAdmin
      .from(table as never)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function toCsv(rows: unknown[]): string {
  if (rows.length === 0) return "";
  const cols = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      if (row && typeof row === "object") {
        for (const k of Object.keys(row as Record<string, unknown>)) acc.add(k);
      }
      return acc;
    }, new Set()),
  );
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.join(",")];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    lines.push(cols.map((c) => escape(r[c])).join(","));
  }
  return lines.join("\n");
}

export async function exportFullJson(includeSecrets: boolean) {
  const tables = resolveTableList(includeSecrets);
  const result: Record<string, unknown[]> = {};
  let total = 0;
  for (const t of tables) {
    const rows = await fetchAll(t);
    result[t] = rows;
    total += rows.length;
  }
  return {
    generated_at: new Date().toISOString(),
    total_rows: total,
    tables: result,
  };
}

export async function exportFullZip(includeSecrets: boolean): Promise<{ blob: ArrayBuffer; totalRows: number }> {
  const tables = resolveTableList(includeSecrets);
  const zip = new JSZip();
  let total = 0;
  const manifest: Record<string, number> = {};
  for (const t of tables) {
    const rows = await fetchAll(t);
    zip.file(`${t}.csv`, toCsv(rows));
    manifest[t] = rows.length;
    total += rows.length;
  }
  zip.file(
    "_manifest.json",
    JSON.stringify({ generated_at: new Date().toISOString(), row_counts: manifest, total_rows: total }, null, 2),
  );
  const blob = await zip.generateAsync({ type: "arraybuffer" });
  return { blob, totalRows: total };
}

export async function fetchSchema() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tables = resolveTableList(false);
  const schema: Record<string, { columns: string[]; row_count: number | null }> = {};
  for (const t of tables) {
    const { data: row } = await supabaseAdmin.from(t as never).select("*").limit(1);
    const { count } = await supabaseAdmin
      .from(t as never)
      .select("*", { count: "exact", head: true });
    schema[t] = {
      columns: row && row.length > 0 ? Object.keys(row[0] as Record<string, unknown>) : [],
      row_count: count ?? null,
    };
  }
  return { generated_at: new Date().toISOString(), tables: schema };
}