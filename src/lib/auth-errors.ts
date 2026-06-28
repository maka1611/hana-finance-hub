// Перевод ошибок Supabase Auth на русский + поддержка повторной отправки письма

export type AuthErrorKind =
  | "email_not_confirmed"
  | "invalid_credentials"
  | "user_not_found"
  | "user_already_exists"
  | "weak_password"
  | "rate_limited"
  | "network"
  | "oauth_cancelled"
  | "unknown";

export interface TranslatedAuthError {
  kind: AuthErrorKind;
  title: string;
  description: string;
  /** Если true — стоит предложить кнопку «Отправить письмо повторно» */
  canResendConfirmation?: boolean;
}

export function translateAuthError(input: unknown): TranslatedAuthError {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === "string"
      ? input
      : input && typeof input === "object" && "message" in input
      ? String((input as { message: unknown }).message)
      : String(input ?? "");
  const msg = raw.toLowerCase();

  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
    return {
      kind: "email_not_confirmed",
      title: "Email не подтверждён",
      description:
        "Перейдите по ссылке из письма, которое мы отправили при регистрации. Если письмо не пришло — проверьте папку «Спам» или отправьте его повторно.",
      canResendConfirmation: true,
    };
  }
  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid_credentials") ||
    msg.includes("invalid email or password")
  ) {
    return {
      kind: "invalid_credentials",
      title: "Неверный email или пароль",
      description: "Проверьте правильность ввода. Регистр букв в пароле имеет значение.",
    };
  }
  if (msg.includes("user not found")) {
    return {
      kind: "user_not_found",
      title: "Пользователь не найден",
      description: "Аккаунт с таким email не зарегистрирован. Создайте новый аккаунт.",
    };
  }
  if (
    msg.includes("user already registered") ||
    msg.includes("already registered") ||
    msg.includes("already exists")
  ) {
    return {
      kind: "user_already_exists",
      title: "Аккаунт уже существует",
      description: "Email уже зарегистрирован. Войдите в аккаунт или восстановите пароль.",
    };
  }
  if (msg.includes("password") && (msg.includes("short") || msg.includes("weak") || msg.includes("at least"))) {
    return {
      kind: "weak_password",
      title: "Слишком простой пароль",
      description: "Используйте минимум 6 символов: буквы и цифры.",
    };
  }
  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("over_email_send_rate_limit")) {
    return {
      kind: "rate_limited",
      title: "Слишком много попыток",
      description: "Подождите немного и попробуйте снова.",
    };
  }
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return {
      kind: "network",
      title: "Нет соединения с сервером",
      description: "Проверьте подключение к интернету и попробуйте ещё раз.",
    };
  }
  if (msg.includes("popup closed") || msg.includes("cancelled") || msg.includes("canceled")) {
    return {
      kind: "oauth_cancelled",
      title: "Вход отменён",
      description: "Окно входа было закрыто до завершения. Попробуйте снова.",
    };
  }

  return {
    kind: "unknown",
    title: "Не удалось выполнить действие",
    description: raw || "Произошла неизвестная ошибка. Попробуйте ещё раз.",
  };
}