## Что делаем

Перестраиваем клиентский раздел `/app` по образцу админки: слева — боковая панель навигации, сверху — компактный хедер с триггером, в обзоре — карточки с актуальной для клиента информацией (без баланса).

## Боковая панель (`src/components/client/ClientSidebar.tsx`)

Аналог `AdminSidebar`, но для клиента:
- **Зелёный CTA сверху** «Подать заявку» (`/app/new`) — тот же стиль `bg-emerald-800 ... rounded-xl`, что и в админке
- Группа **«Кабинет»**:
  - Обзор (`/app`)
  - Мои рассрочки (`/app/installments`)
  - Профиль (`/app/profile`)
- Внизу: для staff — ссылка «В админку»; кнопка «Выйти»
- `collapsible="offcanvas"` — на телефоне панель полностью прячется и открывается по кнопке-гамбургеру в шапке

## Layout `src/routes/_authenticated/app.tsx`

- Убираем текущий верхний навбар со вкладками
- Оборачиваем в `SidebarProvider` + `<ClientSidebar />` + правую колонку с `header` (логотип NoorPay, `SidebarTrigger`, аватар/имя справа) и `main` с `<Outlet />`
- Сохраняем существующую анимацию переходов между страницами (framer-motion) и safe-area paddings (`pt-safe`/`pb-safe`/`px-safe`)
- Запрос профиля и ролей переезжает в layout как сейчас

## Новый обзор `src/routes/_authenticated/app.index.tsx`

Карточек **4** (по выбору пользователя):

1. **Ближайший платёж** — сумма и дата ближайшего `pending` платежа из `payment_schedules` по активным контрактам клиента; кнопка «Все платежи» → `/app/installments`
2. **Остаток к выплате** — сумма всех `pending` платежей (это реальный непогашенный долг, а не сумма контракта)
3. **Активные рассрочки** — число контрактов со статусом `active`
4. **Заявки на рассмотрении** — число `installment_applications` со статусом `pending` (если 0 — карточка тоже отображается, но приглушённо)

Ниже:
- **Список ближайших 3–5 платежей** (продукт, дата, сумма, статус — overdue выделять красным)
- **Активные контракты** с мини-прогрессом (оплачено N из M) — клик ведёт в `/app/installments/$id`

## Серверные функции (`src/lib/installments.functions.ts`)

Добавляем одну новую функцию (чтобы не тянуть весь массив контрактов и не считать всё на клиенте):

```ts
export const getMyDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Возвращает:
    // - upcomingPayments: ближайшие pending платежи с product_name
    // - totalRemaining: сумма всех pending платежей по контрактам клиента
    // - activeCount: число активных контрактов
    // - pendingApplicationsCount: число заявок в статусе pending
    // - activeContracts: активные контракты + paid/total seq для прогресса
  });
```

Под капотом: один select из `payment_schedules` с join'ом `installment_contracts` (фильтр `client_id = userId`), отдельный count из `installment_applications`. Всё через middleware-supabase (RLS уже корректные).

## Технические детали

- Файлы: новый `src/components/client/ClientSidebar.tsx`, переписанный `src/routes/_authenticated/app.tsx`, переписанный `src/routes/_authenticated/app.index.tsx`, добавление `getMyDashboard` в `src/lib/installments.functions.ts`
- На мобильном `SidebarProvider` использует `Sheet` (offcanvas) — уже исправлен с учётом safe-area
- Активный раздел подсвечивается через `useRouterState` + `isActive`, как в `AdminSidebar`
- Никаких изменений схемы БД и RLS не требуется

## Что не трогаем

- `/app/new`, `/app/installments`, `/app/installments/$id`, `/app/profile` — содержимое остаётся прежним
- Админка не меняется
