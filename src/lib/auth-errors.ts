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
  /** Оригинальный текст ошибки (для технических деталей) */
  raw?: string;
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
      raw,
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
      raw,
    };
  }
  if (msg.includes("user not found")) {
    return {
      kind: "user_not_found",
      title: "Пользователь не найден",
      description: "Аккаунт с таким email не зарегистрирован. Создайте новый аккаунт.",
      raw,
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
      raw,
    };
  }
  if (
    msg.includes("password") &&
    (msg.includes("short") ||
      msg.includes("weak") ||
      msg.includes("at least") ||
      msg.includes("should be"))
  ) {
    return {
      kind: "weak_password",
      title: "Слишком простой пароль",
      description: "Пароль должен быть не короче 6 символов и содержать буквы и цифры.",
      raw,
    };
  }
  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("over_email_send_rate_limit")) {
    return {
      kind: "rate_limited",
      title: "Слишком много попыток",
      description: "Подождите несколько минут и попробуйте снова.",
      raw,
    };
  }
  if (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed")
  ) {
    return {
      kind: "network",
      title: "Нет соединения с сервером",
      description: "Проверьте подключение к интернету и попробуйте ещё раз.",
      raw,
    };
  }
  if (msg.includes("popup closed") || msg.includes("cancelled") || msg.includes("canceled")) {
    return {
      kind: "oauth_cancelled",
      title: "Вход отменён",
      description: "Окно входа было закрыто до завершения. Попробуйте снова.",
      raw,
    };
  }
  if (msg.includes("validation") || msg.includes("invalid email") || msg.includes("invalid format")) {
    return {
      kind: "unknown",
      title: "Некорректные данные",
      description: "Проверьте правильность заполнения полей формы.",
      raw,
    };
  }
  if (msg.includes("signup") && (msg.includes("disabled") || msg.includes("not allowed"))) {
    return {
      kind: "unknown",
      title: "Регистрация временно недоступна",
      description: "Создание новых аккаунтов сейчас отключено. Попробуйте позже.",
      raw,
    };
  }
  if (msg.includes("unauthorized") || msg.includes("not authorized") || msg.includes("forbidden")) {
    return {
      kind: "unknown",
      title: "Доступ запрещён",
      description: "У вас нет прав для выполнения этого действия. Войдите снова или обратитесь к администратору.",
      raw,
    };
  }
  if (msg.includes("server error") || msg.includes("internal") || msg.includes("500")) {
    return {
      kind: "unknown",
      title: "Ошибка сервера",
      description: "На сервере произошла ошибка. Попробуйте повторить через минуту.",
      raw,
    };
  }

  return {
    kind: "unknown",
    title: "Не удалось выполнить действие",
    description:
      "Произошла непредвиденная ошибка. Попробуйте ещё раз или обратитесь в поддержку, если повторится.",
    raw,
  };
}