import { useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "noorpay.resend.";

/**
 * Кулдаун повторной отправки писем подтверждения.
 * Хранится в localStorage по ключу email, чтобы переживал перезагрузку страницы.
 */
export function useResendCooldown(seconds = 60) {
  const [remaining, setRemaining] = useState(0);
  const emailRef = useRef<string>("");

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const check = (email: string) => {
    emailRef.current = email;
    if (typeof window === "undefined" || !email) return 0;
    const key = STORAGE_PREFIX + email.toLowerCase();
    const until = Number(window.localStorage.getItem(key) ?? 0);
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    setRemaining(left);
    return left;
  };

  const start = (email: string) => {
    if (typeof window === "undefined" || !email) return;
    const key = STORAGE_PREFIX + email.toLowerCase();
    const until = Date.now() + seconds * 1000;
    window.localStorage.setItem(key, String(until));
    emailRef.current = email;
    setRemaining(seconds);
  };

  return { remaining, check, start };
}