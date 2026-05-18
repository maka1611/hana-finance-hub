import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Сброс пароля — NoorPay" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setMode("update");
    }
  }, []);

  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Письмо со ссылкой отправлено");
  };

  const updatePassword = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Пароль обновлён");
    window.location.href = "/app";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 girih-pattern">
      <div className="w-full max-w-md bg-card rounded-3xl ring-1 ring-border p-8 shadow-xl">
        <Link to="/" className="font-extrabold text-xl tracking-tighter uppercase block mb-8">
          Noor<span className="text-primary">Pay</span>
        </Link>
        <h1 className="text-3xl font-extrabold mb-6">
          {mode === "update" ? "Новый пароль" : "Сброс пароля"}
        </h1>
        {mode === "request" ? (
          <form onSubmit={sendReset} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Отправка..." : "Отправить ссылку"}
            </Button>
          </form>
        ) : (
          <form onSubmit={updatePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Новый пароль</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Сохранение..." : "Сохранить пароль"}
            </Button>
          </form>
        )}
        <p className="text-sm text-center text-muted-foreground mt-6">
          <Link to="/login" className="text-primary font-medium">Назад ко входу</Link>
        </p>
      </div>
    </div>
  );
}
