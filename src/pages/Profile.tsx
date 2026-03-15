import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, LogOut, ChevronRight, User, Clock, Calendar, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).single().then(({ data }) => {
      setProfile(data);
      setLoading(false);
    });
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const infoItems = [
    { icon: BookOpen, label: "Objetivo", value: profile?.education_goal?.toUpperCase() || "—" },
    { icon: User, label: "Série", value: profile?.school_year || "—" },
    { icon: Clock, label: "Horas/dia", value: profile?.hours_per_day ? `${profile.hours_per_day}h` : "—" },
    { icon: Calendar, label: "Data do exame", value: profile?.exam_date ? new Date(profile.exam_date).toLocaleDateString("pt-BR") : "—" },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md shadow-rest">
        <div className="container mx-auto flex h-14 items-center px-4 max-w-3xl">
          <span className="text-base font-bold text-foreground">Perfil</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* User Info */}
        <div className="flex items-center gap-4 animate-fade-in">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
            {profile?.name?.charAt(0) || "?"}
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{profile?.name || "Estudante"}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        {/* Info Cards */}
        <div className="mt-8 space-y-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Informações</h2>
          {infoItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3 p-4 bg-card rounded-xl shadow-rest">
              <item.icon className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-sm font-semibold text-foreground">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Universities */}
        {profile?.target_universities?.length > 0 && (
          <div className="mt-6 animate-fade-in" style={{ animationDelay: "0.15s" }}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Universidades Alvo</h2>
            <div className="flex gap-2 flex-wrap">
              {profile.target_universities.map((uni: string) => (
                <span key={uni} className="px-3 py-1.5 rounded-full bg-primary/5 text-sm font-semibold text-primary">
                  {uni}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Subscription Placeholder */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Plano</h2>
          <div className="p-5 bg-card rounded-xl shadow-rest">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Plano Gratuito</p>
                <p className="text-xs text-muted-foreground mt-0.5">Acesso básico à plataforma</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-primary/5 text-xs font-semibold text-primary">Ativo</span>
            </div>
            <button className="mt-4 w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all">
              Upgrade para Premium — R$29,90/mês
            </button>
          </div>
        </div>

        {/* Account Actions */}
        <div className="mt-8 space-y-2 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Conta</h2>
          <button className="w-full flex items-center justify-between p-4 bg-card rounded-xl shadow-rest text-foreground hover:shadow-interactive transition-all">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Alterar Senha</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-4 bg-card rounded-xl shadow-rest text-destructive hover:shadow-interactive transition-all"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Sair da conta</span>
          </button>
        </div>

        <button className="mt-6 text-xs text-destructive/60 hover:text-destructive transition-colors">
          Excluir minha conta
        </button>
      </main>

      <BottomNav />
    </div>
  );
};

export default Profile;
