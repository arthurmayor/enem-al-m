import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const Register = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast.error("As senhas não coincidem."); return; }
    if (!acceptTerms) { toast.error("Aceite os termos de uso para continuar."); return; }
    setLoading(true);
    const result = await signUp(email, password, name);
    setLoading(false);
    if (result.error) {
      const msg = result.error instanceof Error ? result.error.message : String(result.error);
      if (msg.includes("signups are disabled")) toast.error("O cadastro por e-mail está desabilitado. Ative no painel do Supabase.");
      else if (msg.includes("already registered")) toast.error("Este e-mail já está cadastrado.");
      else toast.error(msg || "Erro ao criar conta.");
    } else if (result.needsEmailConfirmation) {
      toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
    } else {
      toast.success("Conta criada com sucesso!");
      navigate("/onboarding");
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-10">
          <div className="h-9 w-9 rounded-xl bg-foreground flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-semibold text-foreground tracking-tight">Cátedra</span>
        </Link>

        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <h1 className="text-xl font-semibold text-foreground text-center">Criar sua conta</h1>
          <p className="text-sm text-muted-foreground text-center mt-1">Comece sua jornada de estudos</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome completo</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full h-11 px-4 rounded-xl bg-white border border-gray-200 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-foreground transition-all"
                placeholder="Maria Silva" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">E-mail</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full h-11 px-4 rounded-xl bg-white border border-gray-200 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-foreground transition-all"
                placeholder="seu@email.com" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Senha</label>
              <div className="relative mt-1.5">
                <input type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-4 pr-11 rounded-xl bg-white border border-gray-200 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-foreground transition-all"
                  placeholder="Mínimo 6 caracteres" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Confirmar senha</label>
              <input type="password" required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 w-full h-11 px-4 rounded-xl bg-white border border-gray-200 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-foreground transition-all"
                placeholder="Repita sua senha" />
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-foreground focus:ring-foreground" />
              <span className="text-xs text-muted-foreground">
                Aceito os <a href="#" className="text-foreground hover:underline">Termos de Uso</a> e <a href="#" className="text-foreground hover:underline">Política de Privacidade</a>
              </span>
            </label>
            <button type="submit" disabled={loading}
              className="w-full h-11 rounded-full bg-foreground text-white text-sm font-medium hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
              {loading ? "Criando conta..." : "Criar conta grátis"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Já tem conta? <Link to="/login" className="text-foreground font-medium hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
