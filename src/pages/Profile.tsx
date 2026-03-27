import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Zap, Flame, Target, FileText, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import StatCard from "@/components/ui/StatCard";

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
  exam_config_id: string | null;
  available_days: string[] | null;
}

interface ExamInfo {
  exam_name: string;
  course_name: string;
}

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [{ data: prof }, { count }] = await Promise.all([
        supabase.from("profiles").select("name, education_goal, school_year, hours_per_day, exam_date, target_universities, total_xp, current_streak, missions_completed, exams_completed, exam_config_id, available_days").eq("id", user.id).single(),
        supabase.from("answer_history").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setProfile(prof);
      setTotalAnswered(count || 0);

      if (prof?.exam_config_id) {
        const { data: ec } = await supabase.from("exam_configs").select("exam_name, course_name").eq("id", prof.exam_config_id).single();
        if (ec) setExamInfo(ec);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const daysCount = profile?.available_days?.length || 0;

  return (
    <div className="min-h-screen bg-bg-app pb-24 md:pb-0">
      <div className="max-w-2xl mx-auto p-6">
        {/* Avatar and name */}
        <div className="flex items-center gap-4 mb-8 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-brand-500 text-white flex items-center justify-center text-2xl font-bold">
            {profile?.name?.charAt(0) || "?"}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-strong">{profile?.name || "Estudante"}</h1>
            <p className="text-sm text-ink-soft">{user?.email}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-fade-in">
          <StatCard label="XP Total" value={String(profile?.total_xp || 0)} icon={Zap} />
          <StatCard label="Dias seguidos" value={String(profile?.current_streak || 0)} icon={Flame} />
          <StatCard label="Missões" value={String(profile?.missions_completed || 0)} icon={Target} />
          <StatCard label="Respondidas" value={String(totalAnswered)} icon={FileText} />
        </div>

        {/* Course card */}
        {examInfo && (
          <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card mb-6 animate-fade-in">
            <p className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-3">Meu vestibular</p>
            <p className="text-base font-semibold text-ink-strong">{examInfo.exam_name}</p>
            <p className="text-sm text-ink-soft">{examInfo.course_name}</p>
          </div>
        )}

        {/* Study routine card */}
        <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card mb-6 animate-fade-in">
          <p className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-3">Rotina de estudos</p>
          <div className="space-y-2">
            <p className="text-sm text-ink">
              <span className="font-medium text-ink-strong">Horas por dia:</span>{" "}
              {profile?.hours_per_day ? `${profile.hours_per_day}h` : "—"}
            </p>
            <p className="text-sm text-ink">
              <span className="font-medium text-ink-strong">Dias por semana:</span>{" "}
              {daysCount > 0 ? `${daysCount} dias` : "—"}
            </p>
          </div>
        </div>

        {/* Universities */}
        {profile?.target_universities && profile.target_universities.length > 0 && (
          <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card mb-6 animate-fade-in">
            <p className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-3">Universidades Alvo</p>
            <div className="flex gap-2 flex-wrap">
              {profile.target_universities.map((uni) => (
                <span key={uni} className="px-3 py-1.5 rounded-input bg-bg-app border border-line text-sm font-medium text-ink">
                  {uni}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Subscription */}
        <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card mb-6 animate-fade-in">
          <p className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-3">Plano</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-strong">Plano Gratuito</p>
              <p className="text-xs text-ink-muted mt-0.5">Acesso básico à plataforma</p>
            </div>
            <span className="px-3 py-1 rounded-input bg-signal-ok/10 text-signal-ok text-xs font-medium">Ativo</span>
          </div>
          <button className="mt-4 w-full py-3 rounded-input bg-ink-strong text-white text-sm font-medium hover:opacity-90 transition-all">
            Upgrade para Premium — R$29,90/mês
          </button>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-8 w-full bg-transparent text-signal-error border border-signal-error/30 rounded-input py-3 text-sm font-medium hover:bg-signal-error/5 transition-all flex items-center justify-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </button>

        <button className="mt-4 w-full text-xs text-signal-error/60 hover:text-signal-error transition-colors text-center">
          Excluir minha conta
        </button>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;
