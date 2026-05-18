# План: NoorPay — халяльная рассрочка (Этап 1: клиентская часть)

Большой MVP разбит на этапы. Сейчас делаем клиентскую часть. Админ-панель, скоринг, документы, уведомления — отдельными следующими этапами.

## Что войдёт в этот этап

1. **Лендинг `/`** — герой + крупный калькулятор + блок «Принципы» + мини-превью кабинета + футер.
2. **Калькулятор рассрочки** — поля «Сумма товара», «Первый взнос», авто-«Остаток», ползунок срока 1–24 мес, наценка 4.5% × n, итоговая цена продажи, ежемесячный платёж, помесячный график, кнопка «Оформить рассрочку».
3. **Авторизация** — `/login`, `/signup`, `/reset-password`: Email/пароль + вход через Google.
4. **Личный кабинет клиента** `/app`:
   - Дашборд: ближайший платёж, сумма, остаток к оплате, активные рассрочки.
   - Список рассрочек: активные / закрытые / просроченные.
   - Карточка рассрочки `/app/installments/:id`: товар, цены, наценка, срок, статус, график платежей, история оплат.
   - Оформление новой рассрочки `/app/new` (форма с пред-заполнением из калькулятора).
5. **Дизайн** Geometric Precision: белый фон, тёмно-зелёный primary (`hsl(158 64% 18%)`), мягкий серый, Inter + JetBrains Mono, лёгкий girih-паттерн на герое, адаптив для мобильного.

## Архитектура

### Стек
TanStack Start (текущий шаблон) + Tailwind v4 + shadcn/ui + Lovable Cloud (Postgres + Auth).

### Формула (фиксируется в момент оформления)
```
P = S - D            // остаток
R = P * 0.045 * n    // наценка
Sale = D + P + R     // итоговая цена продажи
Monthly = (P + R) / n
```
После оформления значения сохраняются в БД и не пересчитываются.

### Маршруты
```text
/                       — лендинг с калькулятором
/login, /signup
/reset-password
/app                    — _authenticated layout
/app/                   — дашборд клиента
/app/installments       — список
/app/installments/:id   — карточка + график + история
/app/new                — оформление рассрочки
```

### Схема БД (Lovable Cloud)
- `profiles(id uuid PK → auth.users, full_name, phone, email, created_at)` — авто-создание триггером.
- `user_roles(user_id, role app_role)` — enum `client|manager|admin|owner` (нужен для следующих этапов; сейчас используется только `client`).
- `installment_contracts(id, client_id, product_name, product_image_url, product_price, down_payment, principal, markup_rate, term_months, markup_amount, total_sale_price, monthly_payment, start_date, status, created_at)` — статус: `pending|active|closed|overdue`.
- `payment_schedules(id, contract_id, seq, due_date, amount, status)` — статус: `pending|paid|overdue`.
- `payments(id, contract_id, schedule_id, amount, paid_at, method)` — история оплат.
- RLS: клиент видит только свои записи (`client_id = auth.uid()`). Запись через server functions.

### Server functions (`src/lib/*.functions.ts`)
- `createInstallment` — создаёт контракт + генерирует `payment_schedules` (n строк).
- `listMyInstallments`, `getInstallmentById` — выборки.
- `getUpcomingPayment` — ближайший платёж клиента для дашборда.

### Компоненты
- `Calculator` — управляемая форма, локальный пересчёт + helpers в `src/lib/installment.ts`.
- `PaymentScheduleTable` / `PaymentScheduleChart` — переиспользуем на лендинге и в карточке.
- `InstallmentCard`, `StatusBadge`, `AppSidebar` (для `_authenticated`).

### Авторизация
Включаем Lovable Cloud, email/пароль + Google OAuth. `_authenticated` layout с `beforeLoad` и редиректом на `/login`. После регистрации триггер создаёт `profile` и роль `client`.

### Сид-данные
1 demo-клиент с 2 активными и 1 закрытой рассрочкой + графики платежей (через миграцию, после регистрации можно «привязать» к своему uid вручную в следующей итерации).

## За рамками этого этапа (следующие шаги)
- Админ-панель, дашборд, аналитика, графики
- Раздел «Платежи», aging-анализ просрочек
- Скоринг и теги клиентов
- Генерация PDF (договор, квитанции, акт)
- Email-уведомления (требует подключения почтового домена)
- Реальный платёжный шлюз — кнопка «Оплатить» пока имитирует оплату
- 2FA, audit_logs, charity/penalty модуль

После подтверждения этого плана — реализую этап 1 и предложу перейти к админке.
