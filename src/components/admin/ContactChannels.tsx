import { Phone, MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContactChannel = "phone" | "whatsapp" | "telegram";

const CHANNELS: { key: ContactChannel; Icon: typeof Phone; label: string; activeCls: string }[] = [
  { key: "phone", Icon: Phone, label: "Звонок", activeCls: "bg-sky-500/15 text-sky-600 ring-sky-500/40" },
  { key: "whatsapp", Icon: MessageCircle, label: "WhatsApp", activeCls: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/40" },
  { key: "telegram", Icon: Send, label: "Telegram", activeCls: "bg-blue-500/15 text-blue-600 ring-blue-500/40" },
];

export function ContactChannelToggles({
  value,
  onChange,
  size = "md",
}: {
  value: ContactChannel[];
  onChange: (v: ContactChannel[]) => void;
  size?: "sm" | "md";
}) {
  const toggle = (k: ContactChannel) => {
    if (value.includes(k)) onChange(value.filter((x) => x !== k));
    else onChange([...value, k]);
  };
  const dim = size === "sm" ? "size-7" : "size-8";
  const icon = size === "sm" ? "size-3.5" : "size-4";
  return (
    <div className="flex items-center gap-1.5">
      {CHANNELS.map(({ key, Icon, label, activeCls }) => {
        const active = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            title={label}
            onClick={() => toggle(key)}
            className={cn(
              "flex items-center justify-center rounded-full ring-1 transition-all",
              dim,
              active
                ? `${activeCls} ring`
                : "bg-muted/40 text-muted-foreground ring-border hover:bg-muted",
            )}
          >
            <Icon className={icon} />
          </button>
        );
      })}
    </div>
  );
}

export function ContactChannelBadges({ value }: { value: ContactChannel[] }) {
  if (!value || value.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {CHANNELS.filter((c) => value.includes(c.key)).map(({ key, Icon, label, activeCls }) => (
        <span
          key={key}
          title={label}
          className={cn("inline-flex items-center justify-center size-6 rounded-full ring-1", activeCls)}
        >
          <Icon className="size-3" />
        </span>
      ))}
    </div>
  );
}