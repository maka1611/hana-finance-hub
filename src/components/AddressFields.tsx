import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Navigation, Loader2 } from "lucide-react";

export type AddressValue = {
  region: string;
  district: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
  raw?: string;
};

export const emptyAddress = (): AddressValue => ({
  region: "",
  district: "",
  city: "",
  street: "",
  house: "",
  apartment: "",
  raw: "",
});

type Suggestion = {
  display_name: string;
  address: {
    state?: string;
    region?: string;
    county?: string;
    city_district?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    road?: string;
    pedestrian?: string;
    house_number?: string;
  };
};

// Жёстко ограничиваем подсказки Махачкалой (viewbox + city).
const MAKHACHKALA_VIEWBOX = "47.30,43.10,47.65,42.90"; // left,top,right,bottom

export function AddressFields({
  value,
  onChange,
  title = "Адрес",
  subtitle = "Быстрый поиск (только Махачкала) или ввод по полям",
}: {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  title?: string;
  subtitle?: string;
}) {
  const [query, setQuery] = useState(value.raw ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(value.raw ?? "");
  }, [value.raw]);

  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "7");
        url.searchParams.set("accept-language", "ru");
        url.searchParams.set("countrycodes", "ru");
        url.searchParams.set("city", "Махачкала");
        url.searchParams.set("viewbox", MAKHACHKALA_VIEWBOX);
        url.searchParams.set("bounded", "1");
        url.searchParams.set("q", `Махачкала ${q}`);
        const r = await fetch(url.toString(), { signal: ctrl.signal });
        const json = (await r.json()) as Suggestion[];
        setSuggestions(json);
        setOpen(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const pick = (s: Suggestion) => {
    const a = s.address;
    const next: AddressValue = {
      region: a.state || a.region || "Респ. Дагестан",
      district: a.county || a.city_district || a.suburb || "",
      city: a.city || a.town || a.village || "Махачкала",
      street: a.road || a.pedestrian || "",
      house: a.house_number || value.house || "",
      apartment: value.apartment,
      raw: s.display_name,
    };
    onChange(next);
    setQuery(s.display_name);
    setOpen(false);
  };

  return (
    <div className="rounded-2xl ring-1 ring-border bg-card p-4 md:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <MapPin className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      <div className="space-y-1.5 relative">
        <Label className="text-xs">Быстрый поиск адреса</Label>
        <div className="relative">
          <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Начните вводить улицу или дом..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              set({ raw: e.target.value });
            }}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            autoComplete="off"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-xl border border-border bg-popover shadow-lg">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2"
                >
                  <MapPin className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="min-w-0">{s.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">
          Подсказки ограничены Махачкалой. Если адреса нет — заполните поля вручную ниже.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Республика / Регион" value={value.region} onChange={(v) => set({ region: v })} placeholder="Респ. Дагестан" />
        <Field label="Район" value={value.district} onChange={(v) => set({ district: v })} placeholder="Советский район" />
        <Field label="Город / Нас. пункт" value={value.city} onChange={(v) => set({ city: v })} placeholder="г. Махачкала" />
        <Field label="Улица" value={value.street} onChange={(v) => set({ street: v })} placeholder="ул. Ярагского" />
        <Field label="Дом" value={value.house} onChange={(v) => set({ house: v })} placeholder="15" />
        <Field label="Квартира" value={value.apartment} onChange={(v) => set({ apartment: v })} placeholder="42" />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={200}
      />
    </div>
  );
}

export function formatAddress(a: AddressValue | null | undefined): string {
  if (!a) return "";
  const parts = [a.region, a.district, a.city, a.street, a.house ? `д. ${a.house}` : "", a.apartment ? `кв. ${a.apartment}` : ""]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  return parts.join(", ");
}