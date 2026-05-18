
-- Enum для ролей
CREATE TYPE public.app_role AS ENUM ('client', 'manager', 'admin', 'owner');

-- Enum для статусов рассрочки
CREATE TYPE public.contract_status AS ENUM ('pending', 'active', 'closed', 'overdue');

-- Enum для статусов платежа
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'overdue');

-- Профили
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Роли (отдельная таблица, security definer)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('manager','admin','owner')
  )
$$;

-- Договоры рассрочки
CREATE TABLE public.installment_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_image_url TEXT,
  product_price NUMERIC(14,2) NOT NULL,
  down_payment NUMERIC(14,2) NOT NULL DEFAULT 0,
  principal NUMERIC(14,2) NOT NULL,
  markup_rate NUMERIC(6,4) NOT NULL DEFAULT 0.045,
  term_months INT NOT NULL CHECK (term_months BETWEEN 1 AND 24),
  markup_amount NUMERIC(14,2) NOT NULL,
  total_sale_price NUMERIC(14,2) NOT NULL,
  monthly_payment NUMERIC(14,2) NOT NULL,
  start_date DATE NOT NULL DEFAULT (now()::date),
  status contract_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.installment_contracts ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.installment_contracts (client_id);
CREATE INDEX ON public.installment_contracts (status);

-- График платежей
CREATE TABLE public.payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.installment_contracts(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, seq)
);

ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.payment_schedules (contract_id);
CREATE INDEX ON public.payment_schedules (due_date);

-- Фактические оплаты
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.installment_contracts(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.payment_schedules(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.payments (contract_id);

-- RLS politics

-- profiles
CREATE POLICY "Users see own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- user_roles
CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

-- installment_contracts
CREATE POLICY "Clients see own contracts" ON public.installment_contracts
  FOR SELECT USING (auth.uid() = client_id OR public.is_staff(auth.uid()));
CREATE POLICY "Clients insert own contracts" ON public.installment_contracts
  FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Staff updates contracts" ON public.installment_contracts
  FOR UPDATE USING (public.is_staff(auth.uid()));

-- payment_schedules
CREATE POLICY "View schedules of own contracts" ON public.payment_schedules
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.installment_contracts c
            WHERE c.id = contract_id AND (c.client_id = auth.uid() OR public.is_staff(auth.uid())))
  );
CREATE POLICY "Insert schedules of own contracts" ON public.payment_schedules
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.installment_contracts c
            WHERE c.id = contract_id AND c.client_id = auth.uid())
  );
CREATE POLICY "Staff updates schedules" ON public.payment_schedules
  FOR UPDATE USING (public.is_staff(auth.uid()));

-- payments
CREATE POLICY "View payments of own contracts" ON public.payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.installment_contracts c
            WHERE c.id = contract_id AND (c.client_id = auth.uid() OR public.is_staff(auth.uid())))
  );
CREATE POLICY "Staff inserts payments" ON public.payments
  FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

-- Триггер: автосоздание профиля и роли при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON public.installment_contracts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
