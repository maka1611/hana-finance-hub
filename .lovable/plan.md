## Цель

Добавить в карточку инвестора возможность управлять сроком договора и фиксировать дату каждого пополнения средств.

## Что меняется

### 1. База данных (миграция)

- Таблица `investors`:
  - `contract_start_date date NULL` — дата начала договора
  - `contract_term_months integer NULL` — базовый срок договора (мес.)
- Таблица `investor_contributions`:
  - `operation_date date NOT NULL DEFAULT current_date` — дата операции (отдельно от `created_at`)
  - `term_months integer NULL` — срок этой транши (опционально, переопределяет базовый)
  - `due_date date NULL` — рассчитываемая/указываемая дата возврата

RLS: уже покрыты политикой `Staff manages contributions` / `Staff manages investors` — ничего менять не нужно.

### 2. Серверные функции (`src/lib/investors.functions.ts`)

- Расширить `InvestorInput` полями `contract_start_date` и `contract_term_months`.
- Расширить `addInvestorContribution`:
  - принимает `operation_date` (по умолчанию сегодня)
  - принимает `term_months` (опц.) — при наличии вычисляется `due_date = operation_date + term_months`
- `getInvestor` уже возвращает все поля (`select *`), достаточно добавить расчёт «активного срока» на клиенте.

### 3. UI карточки инвестора (`admin.investors.$id.tsx`)

- Блок редактирования: два новых поля — «Дата начала договора» и «Срок договора, мес».
- Шапка: показать «договор: <дата начала> — <дата окончания>, осталось N мес/дней» если заданы.
- Вкладка «Пополнения»:
  - Форма: добавить поле «Дата операции» (datepicker, по умолчанию сегодня) + «Срок (мес)» опционально, рядом подсказка с вычисленной датой возврата.
  - Список: показывать дату операции (вместо `created_at`), при наличии срока — «возврат до <дата>».

### 4. Создание инвестора (`admin.investors.new.tsx`)

- Добавить поля «Дата начала договора» и «Срок (мес)» в форму.

## Технические детали

- Datepicker — shadcn `Calendar` + `Popover` (используется в проекте).
- Расчёт `due_date`: на сервере через `date-fns` или просто строкой `YYYY-MM-DD` + добавление месяцев в JS (проще — на клиенте показывать превью, на сервере хранить).
- Старые записи `investor_contributions` получат `operation_date = current_date` по DEFAULT; при необходимости можно бэкфилить из `created_at` — добавим в миграцию `UPDATE` для существующих строк (`operation_date = created_at::date`).
- Типы Supabase (`src/integrations/supabase/types.ts`) обновятся автоматически после применения миграции.

## Файлы

- новая миграция `supabase/migrations/...sql`
- edit `src/lib/investors.functions.ts`
- edit `src/routes/_authenticated/admin.investors.$id.tsx`
- edit `src/routes/_authenticated/admin.investors.new.tsx`
