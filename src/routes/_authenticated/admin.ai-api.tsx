import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Copy, Download, Eye, EyeOff, RefreshCw, KeyRound } from "lucide-react";
import { aiApiStatus, aiApiAccessLog, aiApiOwnerExport, aiApiRevealSecrets } from "@/lib/ai-api.functions";

export const Route = createFileRoute("/_authenticated/admin/ai-api")({
  component: AiApiPage,
  errorComponent: ({ error }) => <div className="p-6">Ошибка: {error.message}</div>,
  notFoundComponent: () => <div className="p-6">Не найдено</div>,
});

function AiApiPage() {
  const router = useRouter();
  const statusFn = useServerFn(aiApiStatus);
  const logFn = useServerFn(aiApiAccessLog);
  const exportFn = useServerFn(aiApiOwnerExport);
  const revealFn = useServerFn(aiApiRevealSecrets);

  const status = useQuery({ queryKey: ["ai-api-status"], queryFn: () => statusFn() });
  const log = useQuery({ queryKey: ["ai-api-log"], queryFn: () => logFn() });

  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [revealed, setRevealed] = useState<{ apiKey: string; hmacSecret: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} скопирован`);
  };

  const onReveal = async () => {
    try {
      const r = await revealFn();
      setRevealed(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const onExport = async (format: "json" | "zip") => {
    setBusy(true);
    try {
      const res = await exportFn({ data: { format, includeSecrets } });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      if (res.format === "zip") {
        const bin = atob(res.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/zip" });
        downloadBlob(blob, `noorpay-full-${ts}.zip`);
      } else {
        const blob = new Blob([res.jsonString], { type: "application/json" });
        downloadBlob(blob, `noorpay-full-${ts}.json`);
      }
      toast.success(`Экспорт готов (${res.totalRows.toLocaleString("ru-RU")} строк)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(false);
    }
  };

  const curlExample = `# Пример вызова API (псевдокод подписи на bash + openssl + python для timestamp)
API_KEY="<AI_READONLY_API_KEY>"
SECRET="<AI_READONLY_HMAC_SECRET>"
TS=$(python3 -c 'import time; print(int(time.time()*1000))')
PATH_Q="/api/public/ai/schema"
BODY=""
BODY_HASH=$(printf "%s" "$BODY" | openssl dgst -sha256 -hex | awk '{print $2}')
MSG="$TS:$PATH_Q:$BODY_HASH"
SIG=$(printf "%s" "$MSG" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

curl -sS "${baseUrl}$PATH_Q" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "X-Timestamp: $TS" \\
  -H "X-Signature: $SIG"`;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">API для ИИ (только чтение)</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Двухуровневый защищённый доступ ко всей базе для аналитики и сверки нейросетью.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Учётные данные</CardTitle>
          <CardDescription>
            Защита состоит из API-ключа (Authorization: Bearer) и HMAC-подписи (X-Signature) каждого запроса.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.isLoading ? (
            <p>Загрузка…</p>
          ) : (
            <>
              <div className="grid gap-2">
                <div className="text-sm text-muted-foreground">API-ключ (AI_READONLY_API_KEY)</div>
                <div className="font-mono text-sm">{revealed?.apiKey ?? status.data?.apiKeyMask}</div>
              </div>
              <div className="grid gap-2">
                <div className="text-sm text-muted-foreground">HMAC-секрет (AI_READONLY_HMAC_SECRET)</div>
                <div className="font-mono text-sm break-all">{revealed?.hmacSecret ?? status.data?.hmacMask}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!revealed ? (
                  <Button variant="outline" size="sm" onClick={onReveal}>
                    <Eye className="h-4 w-4 mr-2" /> Показать ключи
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setRevealed(null)}>
                      <EyeOff className="h-4 w-4 mr-2" /> Скрыть
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copy(revealed.apiKey, "API-ключ")}>
                      <Copy className="h-4 w-4 mr-2" /> Скопировать API-ключ
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copy(revealed.hmacSecret, "HMAC-секрет")}>
                      <Copy className="h-4 w-4 mr-2" /> Скопировать HMAC
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => router.invalidate()}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Обновить
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Для ротации ключей обратитесь в поддержку или используйте секреты проекта.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" /> Полный дамп базы</CardTitle>
          <CardDescription>
            Скачать всю базу одним файлом без подписи (только из этой страницы, доступ только владельцу).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox id="incl-secrets" checked={includeSecrets} onCheckedChange={(v) => setIncludeSecrets(v === true)} />
            <label htmlFor="incl-secrets" className="text-sm">
              Включить чувствительные данные (client_secrets)
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => onExport("json")}>
              <Download className="h-4 w-4 mr-2" /> Скачать JSON
            </Button>
            <Button disabled={busy} variant="outline" onClick={() => onExport("zip")}>
              <Download className="h-4 w-4 mr-2" /> Скачать ZIP (CSV по таблицам)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Эндпоинты</CardTitle>
          <CardDescription>База URL: <span className="font-mono">{baseUrl}</span></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Endpoint method="GET" path="/api/public/ai/schema" desc="Список таблиц и их колонок" />
          <Endpoint
            method="GET"
            path="/api/public/ai/tables/{table}?limit=&offset=&since=&format=json|csv"
            desc="Постраничное чтение таблицы. since — фильтр по updated_at"
          />
          <Endpoint
            method="GET"
            path="/api/public/ai/export/full?format=json|zip&include_secrets=false"
            desc="Полный экспорт всей базы"
          />
          <Endpoint
            method="POST"
            path="/api/public/ai/query"
            desc='Запрос с фильтрами: { table, select?, filters?: [{column, op, value}], order?, limit?, offset? }'
          />
          <div className="pt-2">
            <div className="text-sm text-muted-foreground mb-1">Подпись запроса:</div>
            <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">{curlExample}</pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Журнал обращений (последние 100)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Время</TableHead>
                <TableHead>Метод</TableHead>
                <TableHead>Эндпоинт</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Строк</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Ошибка</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(log.data?.rows ?? []).map((r) => {
                const row = r as {
                  id: string;
                  created_at: string;
                  method: string;
                  endpoint: string;
                  status: number;
                  rows_returned: number | null;
                  ip: string | null;
                  error: string | null;
                };
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{new Date(row.created_at).toLocaleString("ru-RU")}</TableCell>
                    <TableCell>{row.method}</TableCell>
                    <TableCell className="font-mono text-xs">{row.endpoint}</TableCell>
                    <TableCell>
                      <Badge variant={row.status < 400 ? "default" : "destructive"}>{row.status}</Badge>
                    </TableCell>
                    <TableCell>{row.rows_returned ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.ip ?? "—"}</TableCell>
                    <TableCell className="text-xs text-destructive">{row.error ?? ""}</TableCell>
                  </TableRow>
                );
              })}
              {(log.data?.rows ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">Пока нет обращений</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b pb-2">
      <Badge variant="outline" className="font-mono shrink-0">{method}</Badge>
      <code className="font-mono text-xs break-all">{path}</code>
      <span className="text-muted-foreground text-xs sm:ml-auto">{desc}</span>
    </div>
  );
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}