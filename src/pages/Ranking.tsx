import { useState, useEffect } from "react";
import { Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

interface RankUser { id: string; name: string; city_state: string | null; education_goal: string | null; total_xp: number; current_streak: number; missions_completed: number; }
type RankCategory = "xp" | "streak" | "missions";

const Ranking = () => {
  const { user } = useAuth();
  const [rankings, setRankings] = useState<RankUser[]>([]);
  const [category, setCategory] = useState<RankCategory>("xp");
  const [courseFilter, setCourseFilter] = useState<"mine" | "all">("mine");
  const [myExamConfigId, setMyExamConfigId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myProfile, setMyProfile] = useState<RankUser | null>(null);

  // Fetch user's exam_config_id once
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("exam_config_id").eq("id", user.id).single()
      .then(({ data }) => {
        if (data?.exam_config_id) setMyExamConfigId(data.exam_config_id);
        else setCourseFilter("all"); // No course set, default to all
      });
  }, [user]);

  useEffect(() => {
    const fetchRanking = async () => {
      setLoading(true);
      const orderCol = category === "xp" ? "total_xp" : category === "streak" ? "current_streak" : "missions_completed";
      let query = supabase.from("profiles").select("id, name, city_state, education_goal, total_xp, current_streak, missions_completed").order(orderCol, { ascending: false }).gt(orderCol, 0).limit(50);
      if (courseFilter === "mine" && myExamConfigId) {
        query = query.eq("exam_config_id", myExamConfigId);
      }
      const { data } = await query;
      if (data) {
        setRankings(data);
        if (user) {
          const idx = data.findIndex(r => r.id === user.id);
          setMyRank(idx >= 0 ? idx + 1 : null);
          setMyProfile(data.find(r => r.id === user.id) || null);
        }
      }
      setLoading(false);
    };
    fetchRanking();
  }, [user, category, courseFilter, myExamConfigId]);

  const getCategoryValue = (r: RankUser) => {
    if (category === "xp") return `${r.total_xp || 0} XP`;
    if (category === "streak") return `${r.current_streak || 0} dias`;
    return `${r.missions_completed || 0} missões`;
  };

  const getMedal = (i: number) => {
    if (i === 0) return "🥇";
    if (i === 1) return "🥈";
    if (i === 2) return "🥉";
    return `${i + 1}`;
  };

  return (
    <div className="min-h-screen bg-bg-app pb-24 md:pb-0">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6 animate-fade-in">
        <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
          <Trophy className="h-4 w-4 text-brand-500" />
        </div>
        <h1 className="text-2xl font-bold text-ink-strong">Ranking</h1>
      </header>

      {/* My position card */}
      {myProfile && myRank && (
        <div className="bg-brand-50 border border-brand-500/20 rounded-card p-5 mb-6 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-lg font-bold">
              {myProfile.name?.charAt(0) || "?"}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-ink-strong">Você está em #{myRank}</p>
              <p className="text-xs text-ink-soft">{getCategoryValue(myProfile)}</p>
            </div>
            <span className="text-2xl">{getMedal(myRank - 1)}</span>
          </div>
        </div>
      )}

      {/* Course filter */}
      {myExamConfigId && (
        <div className="bg-bg-app rounded-lg p-1 inline-flex gap-1 border border-line-light mb-3">
          {([
            { id: "mine" as const, label: "Meu curso" },
            { id: "all" as const, label: "Geral" },
          ]).map((f) => (
            <button key={f.id} onClick={() => setCourseFilter(f.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                courseFilter === f.id
                  ? "bg-white shadow-card text-ink-strong font-medium"
                  : "text-ink-soft hover:text-ink-strong"
              }`}>{f.label}</button>
          ))}
        </div>
      )}

      {/* Category filter */}
      <div className="bg-bg-app rounded-lg p-1 inline-flex gap-1 border border-line-light mb-6">
        {([
          { id: "xp" as const, label: "XP Total" },
          { id: "streak" as const, label: "Sequência" },
          { id: "missions" as const, label: "Missões" },
        ]).map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              category === c.id
                ? "bg-white shadow-card text-ink-strong font-medium"
                : "text-ink-soft hover:text-ink-strong"
            }`}>{c.label}</button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rankings.length === 0 ? (
        <div className="bg-bg-card rounded-card border border-line-light shadow-card p-8 text-center">
          <Trophy className="h-10 w-10 text-ink-muted mx-auto mb-3" />
          <p className="text-sm text-ink-soft">Nenhum aluno no ranking ainda. Complete missões para aparecer!</p>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in">
          {rankings.map((r, i) => {
            const isMe = r.id === user?.id;
            return (
              <div key={r.id}
                className={`flex items-center gap-3 p-4 rounded-card border transition-all ${
                  isMe
                    ? "bg-brand-50 border-brand-500/20"
                    : "bg-bg-card border-line-light shadow-card"
                } ${i < 3 ? "py-5" : ""}`}>
                <div className="w-8 flex justify-center shrink-0 text-base font-semibold text-ink-soft">
                  {getMedal(i)}
                </div>
                <div className="h-9 w-9 rounded-xl bg-brand-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {r.name?.charAt(0) || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-ink-strong">
                    {r.name || "Estudante"} {isMe && "(você)"}
                  </p>
                  <p className="text-[10px] text-ink-muted truncate">
                    {r.education_goal?.toUpperCase() || ""} {r.city_state ? `— ${r.city_state}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold shrink-0 text-ink-strong">{getCategoryValue(r)}</span>
              </div>
            );
          })}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Ranking;
