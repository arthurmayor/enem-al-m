import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (resetMode) {
      const { error } = await resetPassword(email);
      setLoading(false);
      if (error) {
        toast.error("Erro ao enviar e-mail de recuperação.");
      } else {
        toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
        setResetMode(false);
      }
      return;
    }

    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Email not confirmed")) {
        toast.error("E-mail não confirmado. Verifique sua caixa de entrada.");
      } else {
        toast.error("E-mail ou senha incorretos.");
      }
    } else {
      // Check onboarding status
      const { data: profile } = await supabase.from("profiles").select("onboarding_complete").single();
      if (profile && !profile.onboarding_complete) {
        navigate("/onboarding");
      } else {
        navigate("/dashboard");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center justify-center gap-2 mb-10">
          <BookOpen className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-foreground">Cátedra</span>
        </Link>

        <div className="bg-card rounded-xl shadow-rest p-8">
          <h1 className="text-xl font-bold text-foreground text-center">
            {resetMode ? "Recuperar senha" : "Entrar na sua conta"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            {resetMode ? "Enviaremos um link para redefinir" : "Continue seus estudos"}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="seu@email.com"
              />
            </div>
            {!resetMode && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Senha</label>
                  <button
                    type="button"
                    onClick={() => setResetMode(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 px-4 pr-11 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
            >
              {loading ? (resetMode ? "Enviando..." : "Entrando...") : resetMode ? "Enviar link" : "Entrar"}
            </button>
          </form>

          {resetMode && (
            <button
              onClick={() => setResetMode(false)}
              className="w-full mt-3 text-sm text-primary hover:underline"
            >
              Voltar ao login
            </button>
          )}

        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Não tem conta?{" "}
          <Link to="/registro" className="text-primary font-medium hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
