## Что добавляем

### 1. Калькулятор в личном кабинете (отдельная страница)
- Новый роут `/app/calculator` — выделенная страница с `<Calculator />`.
- В сайдбаре клиента (`ClientSidebar.tsx`) добавляем пункт «Калькулятор» (иконка Calculator из lucide), между «Подать заявку» и блоком «Кабинет».
- На дашборде `/app` добавляем быструю кнопку «Открыть калькулятор» рядом с «Подать заявку».
- Кнопка «Подать заявку» в калькуляторе ведёт на `/app/new` с прокинутыми price/down/term (как сейчас).

### 2. Персональная ставка наценки у каждого пользователя
- В `profiles` добавляем колонку `markup_rate numeric NULL` (если NULL — используется глобальная ставка по умолчанию).
- Новая таблица-синглтон `app_settings` (или `pricing_settings`) с полем `default_markup_rate numeric NOT NULL DEFAULT 0.045`. RLS: чтение всем авторизованным, изменение — staff.
- Серверная функция `getEffectiveMarkupRate()` (с `requireSupabaseAuth`): возвращает `profile.markup_rate ?? app_settings.default_markup_rate`.
- `Calculator.tsx` получает `markupRate` пропом. Если проп не задан — компонент сам тянет ставку текущего пользователя через server fn и показывает её в карточке «Наценка / мес».
- В формуле `calcInstallment` уже есть поддержка `markupRate` — пробрасываем туда.
- При оформлении рассрочки / заявки (страницы `/app/new`, `admin.installments.new`, одобрение заявки) тоже используем эффективную ставку клиента, чтобы расчёт совпал с тем, что видел пользователь.

### 3. Управление ставками в админке
Новая страница `/admin/pricing` (пункт сайдбара админки «Тарификация»):
- Карточка «Ставка по умолчанию»: текущее значение `default_markup_rate`, инпут + кнопка «Сохранить».
- Карточка «Массовое изменение»: инпут «дельта в процентных пунктах» (например `+0.5` или `-0.25`) + переключатель «Применять к» (всем пользователям / только тем, у кого задана персональная ставка / только тем, у кого NULL — т.е. поднимать и `default_markup_rate`). По кнопке — серверная функция атомарно прибавляет дельту к `default_markup_rate` и/или ко всем `profiles.markup_rate IS NOT NULL`. Перед применением — диалог-подтверждение с превью «было → станет».
- Таблица пользователей с колонкой «Ставка» (effective + признак «персональная/по умолчанию») и инлайн-редактором: ввод нового %, кнопки «Сохранить» и «Сбросить к дефолту» (ставит NULL).

В существующей странице `/admin/users` добавлять не будем, чтобы не смешивать роли и тарифы.

### 4. Серверные функции (новый файл `src/lib/pricing.functions.ts`)
- `getEffectiveMarkupRate()` — для текущего клиента.
- `getEffectiveMarkupRateForUser({ userId })` — staff-only, для админских форм.
- `getDefaultMarkupRate()` — публично для авторизованных.
- `adminSetDefaultMarkupRate({ rate })` — staff.
- `adminSetUserMarkupRate({ userId, rate | null })` — staff.
- `adminBulkAdjustMarkupRate({ deltaPercentPoints, scope: 'all' | 'custom_only' | 'default_only' })` — staff, в транзакции. Возвращает количество затронутых записей.
- `adminListUserRates({ search? })` — staff, для таблицы тарификации.

Все изменения логируются в `admin_audit_log` (action: `pricing.default_set`, `pricing.user_set`, `pricing.bulk_adjust`).

### 5. Расчёт уже оформленных контрактов
- Старые контракты не пересчитываем: `installment_contracts.markup_rate` фиксируется в момент создания (как сейчас). Изменение тарифа влияет только на будущие расчёты/заявки.

## Миграция БД
```sql
ALTER TABLE public.profiles
  ADD COLUMN markup_rate numeric NULL
  CHECK (markup_rate IS NULL OR (markup_rate >= 0 AND markup_rate <= 1));

CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_markup_rate numeric NOT NULL DEFAULT 0.045
    CHECK (default_markup_rate >= 0 AND default_markup_rate <= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (true);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated reads settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff updates settings" ON public.app_settings
  FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
```

## Файлы (создание / правка)
- create `supabase/migrations/<ts>_pricing.sql`
- create `src/lib/pricing.functions.ts`
- create `src/routes/_authenticated/app.calculator.tsx`
- create `src/routes/_authenticated/admin.pricing.tsx`
- edit `src/components/Calculator.tsx` — принимает `markupRate?`, иначе тянет сам
- edit `src/components/client/ClientSidebar.tsx` — пункт «Калькулятор»
- edit `src/components/admin/AdminSidebar.tsx` — пункт «Тарификация»
- edit `src/routes/_authenticated/app.index.tsx` — кнопка на калькулятор
- edit `src/routes/_authenticated/app.new.tsx` — использовать эффективную ставку клиента
- edit `src/routes/_authenticated/admin.installments.new.tsx` и логика одобрения заявки — использовать ставку клиента при создании контракта
