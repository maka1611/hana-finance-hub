
## Цель

Добавить в модуль платежей: перенос даты, частичную оплату, перенос остатка, расширенные статусы и историю операций. Итоговая цена продажи и наценка фиксированы и НЕ пересчитываются (исламская рассрочка).

## База данных (миграции)

### 1. Расширение enum `payment_status`
Добавить значения:
- `partial` — частично оплачен
- `carried_over` — остаток перенесён на следующий платёж
- `rescheduled` — дата платежа перенесена
- `closed_manual` — закрыт вручную

(существующие `pending`, `paid`, `overdue` остаются.)

### 2. Новые поля в `payment_schedules`
- `original_due_date date` — изначальная дата (фиксируется при первом переносе)
- `paid_amount numeric default 0` — сколько уже оплачено по этому платежу
- `carried_in numeric default 0` — сумма, перенесённая С ПРЕДЫДУЩЕГО платежа (увеличивает «к оплате», но не базовую сумму)
- `carried_out numeric default 0` — сумма, перенесённая НА следующий платёж/распределённая
- `carried_to_schedule_id uuid` — ссылка, куда ушёл остаток (для перенесён-на-следующий)

«Итог к оплате» по строке = `amount + carried_in − carried_out`. Контроль инварианта: сумма (`paid_amount` по всем строкам) + текущие остатки = `principal + markup_amount` (итог не растёт).

### 3. Новая таблица `payment_schedule_history`
История переносов даты:
- `schedule_id uuid` → `payment_schedules`
- `old_due_date date`, `new_due_date date`
- `reason text`, `comment text`
- `changed_by uuid`, `changed_at timestamptz default now()`

GRANT для `authenticated` (SELECT — клиенты видят историю своих графиков через JOIN с RLS), `service_role` ALL. RLS: видно если связанный контракт принадлежит пользователю или `is_staff`.

### 4. Новая таблица `payment_carryovers`
История переносов остатка:
- `from_schedule_id uuid`, `to_schedule_id uuid` (nullable для «распределить»)
- `amount numeric`, `mode text` (`next` | `distribute` | `keep`)
- `created_by uuid`, `created_at timestamptz`
- `note text`

Аналогичные GRANT и RLS.

### 5. Поле в `payments`
- `note text` — комментарий к оплате (для частичных).

## Серверные функции (`src/lib/admin.functions.ts`)

### Новые / изменённые серверные функции
1. **`adminRecordPayment`** — переработать:
   - Принимать `amount`, опц. `note`.
   - Считать `due = amount + carried_in − carried_out`.
   - Если `paid_amount + amount >= due` → статус `paid`, излишек игнорировать (валидация ввода).
   - Если `paid_amount + amount < due` → статус `partial`, сохранять остаток.
   - Логировать в `admin_audit_log`.

2. **`adminReschedulePayment`** — новая:
   - Вход: `scheduleId`, `newDueDate`, `reason`, `comment`.
   - Сохранить `original_due_date` (если ещё пусто), обновить `due_date`, статус → `rescheduled` (если ещё не оплачен).
   - Записать строку в `payment_schedule_history`.

3. **`adminCarryOverRemainder`** — новая:
   - Вход: `scheduleId`, `mode: 'next' | 'distribute' | 'keep'`, опц. `note`.
   - `keep` — ничего не двигаем, статус остаётся `partial`.
   - `next` — найти следующий неоплаченный платёж, увеличить его `carried_in`, на текущем установить `carried_out = remainder`, статус `carried_over`. Записать в `payment_carryovers` с `to_schedule_id`.
   - `distribute` — разделить остаток поровну между всеми будущими неоплаченными платежами (увеличить их `carried_in`), статус текущего `carried_over`. Записать `payment_carryovers` (несколько строк или одна с массивом — выберем «несколько строк», по одной на цель).
   - Инвариант: `total_sale_price` и `markup_amount` контракта не трогаем.

4. **`adminCloseScheduleManually`** — новая: статус `closed_manual`, аудит.

5. **`adminGetContract`** — расширить ответ: возвращать `history` (переносы дат) и `carryovers` для отрисовки в админке/клиенте.

6. **`getInstallmentById`** (клиент) — аналогично возвращать `history`, `carryovers`, `paid_amount`, `carried_in/out` для каждой строки.

## UI — Админка (`admin.contracts.$id.tsx`)

В каждой строке графика добавить:
- Колонки: сумма платежа, оплачено, остаток, перенесённый остаток (in/out).
- Бейдж статуса (`pending`/`paid`/`partial`/`carried_over`/`rescheduled`/`overdue`/`closed_manual`).
- Кнопки в выпадающем меню действий:
  - **Принять оплату** (полная сумма).
  - **Частичная оплата** — модальное окно с полем суммы и комментарием.
  - **Перенести дату** — модальное окно: новая дата + причина + комментарий.
  - **Перенести остаток** — модальное окно: режим (на следующий / распределить / оставить).
  - **Закрыть вручную**.
- Под строкой раскрываемый блок: история оплат по этой строке + история переносов даты (из `payment_schedule_history`) и переносов остатка (из `payment_carryovers`).

Общая «История переносов» отдельным разделом внизу.

## UI — Клиент (`app.installments.$id.tsx`)

В строке графика клиенту показывать:
- Базовый платёж + перенесённый остаток (если есть) → итог к оплате.
- Текущую дату платежа; если был перенос — пометка «дата перенесена с …».
- Историю частичных оплат (раскрывающийся блок).
- Статус с человеко-читаемой подписью.

Цифры контракта (цена, наценка, итог) НЕ меняются.

## Инварианты и проверки

- Сумма `paid_amount` по всем расписаниям + сумма всех текущих остатков (`due − paid_amount`) == `principal + markup_amount` контракта.
- При переносе остатка `carried_out_source == sum(carried_in_targets)`.
- Наценка (`markup_rate`, `markup_amount`, `total_sale_price`, `monthly_payment`) контракта не изменяется ни одной из новых операций.

## Послепроверка

- Принять частичную оплату → статус `partial`, остаток корректный.
- Перенести остаток «на следующий» → текущий `carried_over` (оплачено + перенесено), у следующего «обычный + carried_in», итог не растёт.
- Перенос даты → старая дата в истории, новая в графике, статус `rescheduled`.
- Клиент и админ видят одинаковые суммы/даты/статусы.
- `admin_audit_log` фиксирует все действия.

## Технические детали

- Все мутации — `createServerFn` + `requireSupabaseAuth` + `assertStaff`, через `supabaseAdmin` (как существующие).
- Новые типы статусов добавить в TS-обёртках компонентов (бейджи).
- Никаких изменений в калькуляторе/`installment.ts` — он только для оформления.
