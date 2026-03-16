import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, LogOut, ChevronRight, User, Clock, Calendar, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

interface ProfileData {
  name: string | null;
  education_goal: string | null;
  school_year: string | null;
  hours_per_day: number | null;
  exam_date: string | null;
  target_universities: string[] | null;
  total_xp: number | null;
  current_streak: number | null;
  missions_completed: number | null;
  exams_completed: number | null;
}

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("name, education_goal, school_year, hours_per_day, exam_date, target_universities, total_xp, current_streak, missions_completed, exams_completed").eq("id", user.id).single().then(({ data }) => {
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const infoItems = [
    { icon: BookOpen, label: "Objetivo", value: profile?.education_goal?.toUpperCase() || "—" },
    { icon: User, label: "Série", value: profile?.school_year || "—" },
    { icon: Clock, label: "Horas/dia", value: profile?.hours_per_day ? `${profile.hours_per_day}h` : "—" },
    { icon: Calendar, label: "Data do exame", value: profile?.exam_date ? new Date(profile.exam_date as string).toLocaleDateString("pt-BR") : "—" },
  ];

  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto flex h-14 items-center px-4 max-w-3xl">
          <span className="text-base font-semibold text-foreground">Perfil</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* User Info */}
        <div className="flex items-center gap-4 animate-fade-in">
          <div className="h-16 w-16 rounded-2xl bg-foreground flex items-center justify-center text-white text-xl font-semibold">
            {profile?.name?.charAt(0) || "?"}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{profile?.name || "Estudante"}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-4 gap-2 animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <div className="p-3 bg-gray-50 rounded-2xl text-center">
            <p className="text-lg font-semibold text-foreground">{profile?.total_xp || 0}</p>
            <p className="text-[10px] text-muted-foreground font-medium">XP</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-2xl text-center">
            <p className="text-lg font-semibold text-foreground">{profile?.current_streak || 0}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Streak</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-2xl text-center">
            <p className="text-lg font-semibold text-foreground">{profile?.missions_completed || 0}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Missões</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-2xl text-center">
            <p className="text-lg font-semibold text-foreground">{profile?.exams_completed || 0}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Provas</p>
          </div>
        </div>

        {/* Info Cards */}
        <div className="mt-8 space-y-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Informações</h2>
          {infoItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100">
              <div className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center">
                <item.icon className="h-4 w-4 text-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-sm font-medium text-foreground">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Universities */}
        {profile?.target_universities && profile.target_universities.length > 0 && (
          <div className="mt-6 animate-fade-in" style={{ animationDelay: "0.15s" }}>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Universidades Alvo</h2>
            <div className="flex gap-2 flex-wrap">
              {profile.target_universities.map((uni) => (
                <span key={uni} className="px-3 py-1.5 rounded-full bg-gray-100 text-sm font-medium text-foreground">
                  {uni}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Subscription */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Plano</h2>
          <div className="p-5 bg-gray-50 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Plano Gratuito</p>
                <p className="text-xs text-muted-foreground mt-0.5">Acesso básico à plataforma</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-gray-200 text-xs font-medium text-foreground">Ativo</span>
            </div>
            <button className="mt-4 w-full h-10 rounded-full bg-foreground text-white text-sm font-medium hover:bg-foreground/90 transition-all">
              Upgrade para Premium — R$29,90/mês
            </button>
          </div>
        </div>

        {/* Account Actions */}
        <div className="mt-8 space-y-2 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Conta</h2>
          <button className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 text-foreground hover:shadow-md transition-all">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Alterar Senha</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 text-destructive hover:shadow-md transition-all"
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
