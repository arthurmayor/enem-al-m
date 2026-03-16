import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Trophy, Medal, Flame, ArrowLeft, Crown, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

interface RankUser {
  id: string;
  name: string;
  city_state: string | null;
  education_goal: string | null;
  total_xp: number;
  current_streak: number;
  missions_completed: number;
}

type RankCategory = "xp" | "streak" | "missions";

const Ranking = () => {
  const { user } = useAuth();
  const [rankings, setRankings] = useState<RankUser[]>([]);
  const [category, setCategory] = useState<RankCategory>("xp");
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myProfile, setMyProfile] = useState<RankUser | null>(null);

  useEffect(() => {
    const fetchRanking = async () => {
      setLoading(true);
      const orderCol = category === "xp" ? "total_xp" : category === "streak" ? "current_streak" : "missions_completed";

      const { data } = await supabase
        .from("profiles")
        .select("id, name, city_state, education_goal, total_xp, current_streak, missions_completed")
        .order(orderCol, { ascending: false })
        .gt(orderCol, 0)
        .limit(50);

      if (data) {
        setRankings(data);
        if (user) {
          const idx = data.findIndex(r => r.id === user.id);
          setMyRank(idx >= 0 ? idx + 1 : null);
          const me = data.find(r => r.id === user.id);
          setMyProfile(me || null);
        }
      }
      setLoading(false);
    };
    fetchRanking();
  }, [user, category]);

  const getCategoryValue = (r: RankUser) => {
    if (category === "xp") return `${r.total_xp || 0} XP`;
    if (category === "streak") return `${r.current_streak || 0} dias`;
    return `${r.missions_completed || 0} missoes`;
  };

  const getMedalIcon = (i: number) => {
    if (i === 0) return <Crown className="h-5 w-5 text-warning" />;
    if (i === 1) return <Medal className="h-5 w-5 text-muted-foreground" />;
    if (i === 2) return <Medal className="h-5 w-5 text-warning/60" />;
    return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{i + 1}</span>;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md shadow-rest">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4 max-w-3xl">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Trophy className="h-5 w-5 text-primary" />
          <span className="text-base font-bold text-foreground">Ranking</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* My Position */}
        {myProfile && myRank && (
          <div className="p-5 bg-primary/5 rounded-xl border border-primary/10 mb-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-bold">
                  {myProfile.name?.charAt(0) || "?"}
                </div>
                <div>
                  <p className="font-semibold text-foreground">Voce esta em #{myRank}</p>
                  <p className="text-xs text-muted-foreground">{getCategoryValue(myProfile)}</p>
                </div>
              </div>
              <Star className="h-6 w-6 text-primary" />
            </div>
          </div>
        )}

        {/* Category tabs */}
        <div className="flex gap-2 mb-6">
          {([
            { id: "xp" as const, label: "XP Total" },
            { id: "streak" as const, label: "Sequencia" },
            { id: "missions" as const, label: "Missoes" },
          ]).map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                category === c.id ? "bg-primary text-primary-foreground" : "bg-card shadow-rest text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rankings.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum aluno no ranking ainda. Complete missoes para aparecer!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rankings.map((r, i) => {
              const isMe = r.id === user?.id;
              return (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 p-4 rounded-xl transition-all animate-fade-in ${
                    isMe ? "bg-primary/5 border border-primary/20" : "bg-card shadow-rest"
                  } ${i < 3 ? "py-5" : ""}`}
                  style={{ animationDelay: `${i * 0.02}s` }}
                >
                  <div className="w-8 flex justify-center shrink-0">
                    {getMedalIcon(i)}
                  </div>
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                    {r.name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isMe ? "text-primary" : "text-foreground"}`}>
                      {r.name || "Estudante"} {isMe && "(voce)"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {r.education_goal?.toUpperCase() || ""} {r.city_state ? `- ${r.city_state}` : ""}
                    </p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${i < 3 ? "text-primary" : "text-foreground"}`}>
                    {getCategoryValue(r)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Ranking;
