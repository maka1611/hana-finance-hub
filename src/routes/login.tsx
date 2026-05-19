import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AuthTopBar } from "@/components/AuthTopBar";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Вход — NoorPay" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/app" });
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: { prompt: "select_account" },
      });
      if (r.redirected) return;
      if (r.error) {
        toast.error(String((r.error as Error)?.message ?? r.error));
        return;
      }
      window.location.assign("/app");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 pt-24 pb-12 girih-pattern relative">
      <AuthTopBar />
      <div className="w-full max-w-md bg-card rounded-3xl ring-1 ring-border p-8 shadow-xl">
        <Link to="/" className="font-extrabold text-xl tracking-tighter uppercase block mb-8">
          Noor<span className="text-primary">Pay</span>
        </Link>
        <h1 className="text-3xl font-extrabold mb-2">Вход</h1>
        <p className="text-sm text-muted-foreground mb-6">Войдите в личный кабинет</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Пароль</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Вход..." : "Войти"}
          </Button>
        </form>
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" /> ИЛИ <div className="flex-1 h-px bg-border" />
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={googleLoading}>
          {googleLoading ? "Открываем Google..." : "Войти через Google"}
        </Button>
        <p className="text-sm text-center text-muted-foreground mt-6">
          Нет аккаунта?{" "}
          <Link to="/signup" className="text-primary font-medium">Регистрация</Link>
        </p>
      </div>
    </div>
  );
}