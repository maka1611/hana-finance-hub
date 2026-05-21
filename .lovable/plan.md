
## 1. Локализация интерфейса на русский

Пройти по всем экранам и заменить оставшиеся английские строки (метки, бейджи, заголовки), сохранив бренд `NoorPay` латиницей.

Точки, где сейчас есть английский:
- `tierLabels` в `app.profile.tsx` и `admin.clients.$id.tsx`: `Bronze / Silver / Gold / Platinum` → «Бронза / Серебро / Золото / Платина».
- Бейджи статусов (`pending / active / closed / paid / overdue` и т.п.), плейсхолдеры `Search…`, любые `Save / Cancel / Loading…`, оставшиеся в админских таблицах и формах.
- Тосты и сообщения об ошибках — перевести единым стилем.

Подход: пройти по `src/routes/_authenticated/**` и `src/components/admin|client/**`, заменить строки на русские. Бренд и `email` оставить как есть.

## 2. Убрать дубль кнопки «Подать заявку» у пользователя

Сейчас она встречается:
- в боковом меню `ClientSidebar.tsx` (зелёная CTA сверху),
- на дашборде `app.index.tsx` (отдельная кнопка над карточками),
- на странице `/app/new` (заголовок).

Оставить только CTA в сайдбаре. На дашборде убрать дублирующую кнопку, вместо неё — компактная ссылка «Подать новую заявку» в карточке «Заявки на рассмотрении» (или совсем убрать, если пусто). На прочих страницах второстепенных CTA не добавлять.

## 3. Постоянно видимый временный пароль в профиле клиента (для админов)

Сейчас временный пароль показывается одним тостом в `admin.installments.new.tsx` и теряется.

Изменения:
- Миграция: добавить колонку `profiles.initial_password text` (nullable). RLS уже ограничивает чтение `profiles` владельцем + `is_staff`, так что поле видно только админам и самому пользователю. Чтобы не светить владельцу, сделаем отдельную таблицу `client_secrets(user_id pk, initial_password text, updated_at)` с RLS «SELECT/UPDATE только `is_staff`».
- `adminCreateInstallment`: при создании нового клиента записывать `tempPassword` в `client_secrets`.
- Новая server-fn `adminResetClientPassword(userId)`: генерирует новый пароль, вызывает `supabaseAdmin.auth.admin.updateUserById`, обновляет `client_secrets`, логирует в `admin_audit_log`.
- `admin.clients.$id.tsx`: блок «Доступ клиента» — поле с паролем (по умолчанию скрыт точками, кнопки «Показать», «Скопировать», «Сбросить пароль»). Если значения нет — кнопка «Сгенерировать новый пароль».
- Тост после создания рассрочки заменить на короткий: «Клиент создан. Пароль доступен в профиле клиента» + кнопка-ссылка «Открыть профиль».

## 4. Смена пароля пользователем в разделе «Профиль»

В `app/profile` добавить карточку «Безопасность»: поля «Новый пароль» / «Повтор пароля», валидация (мин. 8 символов, совпадение). Кнопка вызывает `supabase.auth.updateUser({ password })` на клиенте. По успеху — тост, очистка полей.

## 5. Несколько поручителей при оформлении рассрочки

Поручитель — отдельный человек (не auth-пользователь), привязанный к договору. У каждого: ФИО, комментарий, список телефонов (label + каналы) и список email-адресов.

Миграция, новые таблицы:
- `contract_guarantors(id, contract_id fk, full_name, comment, created_at)`
- `guarantor_phones(id, guarantor_id fk, phone, label, channels text[])`
- `guarantor_emails(id, guarantor_id fk, email, label)`

RLS: SELECT/INSERT/UPDATE/DELETE только `is_staff(auth.uid())`. Клиент договора поручителей не видит (по требованию можно открыть на SELECT владельцу договора — уточнить отдельно, по умолчанию — только staff).

UI в `admin.installments.new.tsx`: после блока товара — секция «Поручители» с кнопкой «+ Добавить поручителя». Каждый поручитель — карточка с полями ФИО, комментарий, повторяющимися строками телефонов (через `ContactChannelToggles`) и email-ов, кнопкой «Удалить».

Сервер: расширить `AdminCreateInstallmentSchema` массивом `guarantors`, в `adminCreateInstallment` после создания договора пакетно вставить поручителей и их контакты.

Отображение: на странице договора `admin.contracts.$id.tsx` добавить блок «Поручители» (список с возможностью править/удалять отдельной mutation `adminUpdateGuarantors` — в этой итерации только просмотр + удаление, редактирование контактов оставим на следующий шаг, чтобы не раздувать задачу).

## Тех. детали миграций

```sql
create table public.client_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  initial_password text not null,
  updated_at timestamptz not null default now()
);
alter table public.client_secrets enable row level security;
create policy "Staff reads client secrets" on public.client_secrets
  for select using (is_staff(auth.uid()));
create policy "Staff writes client secrets" on public.client_secrets
  for all using (is_staff(auth.uid())) with check (is_staff(auth.uid()));

create table public.contract_guarantors (...);
create table public.guarantor_phones (...);
create table public.guarantor_emails (...);
-- RLS: only is_staff(auth.uid())
```

## Файлы, которые буду менять

- Новые миграции (`client_secrets`, `contract_guarantors`, `guarantor_phones`, `guarantor_emails`).
- `src/lib/admin.functions.ts` — сохранение пароля, новые fn `adminResetClientPassword`, `adminGetClientSecret`, расширение `adminCreateInstallment` поручителями, `adminListGuarantors`, `adminDeleteGuarantor`.
- `src/routes/_authenticated/admin.installments.new.tsx` — блок поручителей, изменение тоста.
- `src/routes/_authenticated/admin.clients.$id.tsx` — блок «Доступ клиента» с паролем.
- `src/routes/_authenticated/admin.contracts.$id.tsx` — блок «Поручители».
- `src/routes/_authenticated/app.profile.tsx` — карточка «Безопасность» + замена `tierLabels`.
- `src/routes/_authenticated/app.index.tsx` — удалить дублирующий CTA.
- Точечные переводы в админских страницах и `ui` компонентах.
