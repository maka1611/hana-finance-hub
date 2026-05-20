import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContactChannel = "phone" | "whatsapp" | "telegram";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.5 14.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6 0-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.5.2-.7.2-1.4.2-1.5-.1-.2-.3-.3-.6-.4Zm-5.5 7.5h0a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4a9.9 9.9 0 1 1 8.3 4.6Zm8.4-18.3A11.8 11.8 0 0 0 2.1 17.3L.5 23.5l6.3-1.7a11.8 11.8 0 0 0 17.7-10.2c0-3.2-1.2-6.1-3.5-8.3Z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21.7 3.3 2.5 10.7c-1.3.5-1.3 1.2-.2 1.6l4.9 1.5 11.4-7.2c.5-.3 1-.1.6.2L9.9 15l-.3 4.9c.5 0 .7-.2 1-.4l2.3-2.2 4.9 3.6c.9.5 1.5.2 1.8-.8l3.2-15.1c.4-1.3-.4-1.9-1.1-1.7Z" />
    </svg>
  );
}

const CHANNELS: { key: ContactChannel; Icon: (p: { className?: string }) => JSX.Element; label: string; activeCls: string }[] = [
  { key: "phone", Icon: (p) => <Phone className={p.className} />, label: "Звонок", activeCls: "bg-sky-500/15 text-sky-600 ring-sky-500/40" },
  { key: "whatsapp", Icon: WhatsAppIcon, label: "WhatsApp", activeCls: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/40" },
  { key: "telegram", Icon: TelegramIcon, label: "Telegram", activeCls: "bg-sky-400/15 text-sky-500 ring-sky-400/40" },
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
