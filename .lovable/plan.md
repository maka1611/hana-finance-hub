Сделаю всё последовательно в одном проходе. Ниже — что войдёт.

## 1. Расширение формы оформления `/app/new`
Добавлю недостающие поля к карточке клиента и товара:
- **ФИО** — автозаполнение из `profiles.full_name`, редактируемое (сохранение обратно в профиль)
- **Telegram** (необязательно)
- **Комментарий** (необязательно)
- **Описание товара** (необязательно)
- **Дата первого платежа** (date picker, по умолчанию — сегодня + 1 мес)

Для этого добавлю в `installment_contracts` колонки: `client_full_name`, `client_telegram`, `client_comment`, `product_description`. График платежей будет строиться от выбранной даты первого платежа.

## 2. Управление ролями в админке
Новая страница `/admin/users`:
- Список всех пользователей (профили + роли)
- Поиск по email/ФИО
- Назначение/снятие ролей `client | manager | admin` (только `owner` может назначать `admin`; `admin`/`owner` могут назначать `manager`)
- Серверная функция `setUserRole` с проверкой прав через `has_role`
- RLS на `user_roles`: разрешить INSERT/DELETE для `owner`/`admin` через политики

## 3. Раздел «Платежи» в админке
Новая страница `/admin/payments`:
- Сводные KPI: ожидается в этом месяце, просрочено, поступило за период
- Таблица всех `payment_schedules` с join на контракт и клиента
- Фильтры: статус (pending/paid/overdue), период, поиск по клиенту
- Aging buckets: 0–7, 8–30, 31–60, 60+ дней просрочки
- Кнопка «Отметить оплачено» прямо из таблицы
- Cron-логика статуса: помечать `overdue`, если `due_date < today` и статус `pending` (через серверную функцию, триггеримую при загрузке страницы)

## 4. Сид-данные
Серверная функция `seedDemoData` (вызов кнопкой в админке, только для `owner`):
- 10 демо-клиентов (profiles + user_roles)
- 20 договоров с разными статусами и сроками
- Графики платежей с частично оплаченными/просроченными позициями

## 5. Email-уведомления (через Lovable Emails)
- Настройка домена и инфраструктуры email
- Транзакционные шаблоны: «договор оформлен», «напоминание о платеже за 3 дня», «платёж получен», «просрочка»
- Cron-job (pg_cron → public API route) раз в день рассылает напоминания и просрочки

## Технические детали

**Миграции:**
```sql
ALTER TABLE installment_contracts
  ADD COLUMN client_full_name text,
  ADD COLUMN client_telegram text,
  ADD COLUMN client_comment text,
  ADD COLUMN product_description text;

-- RLS на user_roles: разрешить admin/owner управлять
CREATE POLICY "Admins manage roles" ON user_roles
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'));
```

**Серверные функции** (createServerFn, в `src/lib/`):
- `contracts.functions.ts` — расширить `createContract` новыми полями + `firstPaymentDate`
- `admin-users.functions.ts` — `listUsers`, `setUserRole`, `removeRole`
- `admin-payments.functions.ts` — `listPayments`, `markPaid`, `refreshOverdueStatuses`
- `seed.functions.ts` — `seedDemoData`
- `notifications.functions.ts` — `sendContractCreated`, `sendPaymentReminder`, `sendPaymentReceived`

**Маршруты:**
- `/admin/users`, `/admin/payments`
- `/api/public/cron/send-reminders` (для pg_cron, проверка по shared secret)

**Email:**
- Использую Lovable Emails (нужна настройка домена — попрошу через диалог настройки на этапе реализации)

## Что НЕ войдёт (отложим)
- Скоринг клиентов
- Генерация PDF (договор, чек)
- Реальный платёжный шлюз
- 2FA, audit_logs, charity/penalty

После реализации этих 5 пунктов система будет полностью рабочей для запуска. Скажешь — добавим остальное.