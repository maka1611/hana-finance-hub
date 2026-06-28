import { AlertCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TranslatedAuthError } from "@/lib/auth-errors";

interface Props {
  error: TranslatedAuthError | null;
  onResend?: () => void;
  resending?: boolean;
  /** Сколько секунд осталось до возможности повторной отправки */
  resendCooldown?: number;
}

export function AuthErrorAlert({ error, onResend, resending, resendCooldown = 0 }: Props) {
  if (!error) return null;
  const cooling = resendCooldown > 0;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-2xl border-2 border-destructive bg-destructive/10 text-destructive-foreground p-4 shadow-md animate-in fade-in slide-in-from-top-2"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base text-destructive leading-tight">{error.title}</p>
          <p className="text-sm text-foreground/80 mt-1 leading-snug">{error.description}</p>
          {error.canResendConfirmation && onResend && (
            <Button
              type="button"
              size="sm"
              className="mt-3 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-70"
              onClick={onResend}
              disabled={resending || cooling}
            >
              <Mail className="h-4 w-4 mr-2" />
              {resending
                ? "Отправляем..."
                : cooling
                ? `Повторно можно через ${resendCooldown} с`
                : "Отправить письмо повторно"}
            </Button>
          )}
          {error.raw && error.raw.toLowerCase() !== error.title.toLowerCase() && (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                Технические детали
              </summary>
              <p className="mt-1 font-mono break-all opacity-80">{error.raw}</p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}