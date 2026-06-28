import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AuthTopBar } from "@/components/AuthTopBar";
import { translateAuthError, type TranslatedAuthError } from "@/lib/auth-errors";
import { AuthErrorAlert } from "@/components/AuthErrorAlert";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Регистрация — NoorPay" }] }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [authError, setAuthError] = useState<TranslatedAuthError | null>(null);
  const [resending, setResending] = useState(false);

  const showError = (err: unknown) => {
    const t = translateAuthError(err);
    setAuthError(t);
    toast.error(t.title, { description: t.description });
  };

  const handleResend = async () => {
    if (!email) {
      toast.error("Укажите email", { description: "Введите email, на который отправить письмо." });
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    setResending(false);
    if (error) return showError(error);
    toast.success("Письмо отправлено", { description: "Проверьте почту, в том числе папку «Спам»." });
    setAuthError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: fullName, phone },
      },
    });
    setLoading(false);
    if (error) return showError(error);
    toast.success("Проверьте почту для подтверждения регистрации");
    navigate({ to: "/app" });
  };

  const handleGoogle = async () => {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/app`,
        extraParams: { prompt: "select_account" },
      });
      if (r.redirected) return;
      if (r.error) {
        showError(r.error);
        return;
      }
      window.location.assign("/app");
    } catch (e) {
      showError(e);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleApple = async () => {
    setAuthError(null);
    setAppleLoading(true);
    try {
      const r = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: `${window.location.origin}/app`,
      });
      if (r.redirected) return;
      if (r.error) {
        showError(r.error);
        return;
      }
      window.location.assign("/app");
    } catch (e) {
      showError(e);
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 pt-24 pb-12 girih-pattern relative">
      <AuthTopBar />
      <div className="w-full max-w-md bg-card rounded-3xl ring-1 ring-border p-8 shadow-xl">
        <Link to="/" className="font-extrabold text-xl tracking-tighter uppercase block mb-8">
          Noor<span className="text-primary">Pay</span>
        </Link>
        <h1 className="text-3xl font-extrabold mb-2">Регистрация</h1>
        <p className="text-sm text-muted-foreground mb-6">Откройте халяльную рассрочку</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthErrorAlert error={authError} onResend={handleResend} resending={resending} />
          <div className="space-y-2">
            <Label>Имя</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Телефон</Label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>
          <div className="space-y-2">
            <Label>Пароль</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Создание..." : "Создать аккаунт"}
          </Button>
        </form>
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" /> ИЛИ <div className="flex-1 h-px bg-border" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={googleLoading}
        >
          {googleLoading ? "Открываем Google..." : "Продолжить через Google"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full mt-2"
          onClick={handleApple}
          disabled={appleLoading}
        >
          {appleLoading ? "Открываем Apple..." : "Продолжить через Apple"}
        </Button>
        <p className="text-sm text-center text-muted-foreground mt-6">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-primary font-medium">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
