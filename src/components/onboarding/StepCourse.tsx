import { useState, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CourseRow {
  id: string;
  course_name: string;
  campus: string;
}

const POPULAR_COURSES = [
  "Direito",
  "Medicina",
  "Engenharia Civil",
  "Psicologia",
  "Administração",
  "Engenharia de Computação",
];

interface Props {
  selectedId: string;
  courseLabel: string;
  onChange: (id: string, label: string) => void;
}

const StepCourse = ({ selectedId, courseLabel, onChange }: Props) => {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("exam_configs")
        .select("id, course_name, campus")
        .eq("exam_slug", "fuvest")
        .eq("is_active", true)
        .order("course_name");
      setCourses(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return courses.filter(
      (c) =>
        c.course_name.toLowerCase().includes(q) ||
        c.campus?.toLowerCase().includes(q)
    );
  }, [query, courses]);

  // Auto-select if single result
  useEffect(() => {
    if (filtered.length === 1 && query.trim()) {
      const c = filtered[0];
      const label = c.campus ? `${c.course_name} — ${c.campus}` : c.course_name;
      onChange(c.id, label);
    }
  }, [filtered, query, onChange]);

  const handleSelect = (c: CourseRow) => {
    const label = c.campus ? `${c.course_name} — ${c.campus}` : c.course_name;
    onChange(c.id, label);
    setQuery("");
    setIsFocused(false);
  };

  const handlePopular = (name: string) => {
    const match = courses.filter((c) =>
      c.course_name.toLowerCase().startsWith(name.toLowerCase())
    );
    if (match.length === 1) {
      handleSelect(match[0]);
    } else {
      setQuery(name);
      setIsFocused(true);
    }
  };

  const showDropdown = isFocused && query.trim().length > 0 && filtered.length > 0 && !selectedId;

  return (
    <div className="animate-fade-in">
      <div className="inline-flex items-center px-3 py-1 rounded-md bg-secondary text-muted-foreground text-xs font-medium tracking-wide mb-5">
        FUVEST
      </div>

      <h2 className="text-2xl font-semibold text-foreground leading-tight">
        Qual curso você quer seguir?
      </h2>
      <p className="text-sm text-muted-foreground mt-2">
        Isso personaliza seu diagnóstico e seu plano inicial.
      </p>

      <div className="mt-8 relative">
        {selectedId ? (
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-secondary/50">
            <span className="text-sm font-medium text-foreground">{courseLabel}</span>
            <button
              onClick={() => {
                onChange("", "");
                setQuery("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Alterar
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (selectedId) onChange("", "");
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                placeholder="Buscar curso..."
                className="w-full h-12 pl-11 pr-4 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-foreground/30 transition-all"
              />
            </div>

            {showDropdown && (
              <div className="absolute z-10 w-full mt-1.5 bg-card border border-border rounded-xl shadow-elevated max-h-56 overflow-y-auto">
                {filtered.slice(0, 20).map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={() => handleSelect(c)}
                    className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary/60 transition-colors first:rounded-t-xl last:rounded-b-xl"
                  >
                    {c.course_name}
                    {c.campus && (
                      <span className="text-muted-foreground"> — {c.campus}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="mt-4 flex justify-center">
            <div className="h-5 w-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
          </div>
        )}
      </div>

      {!selectedId && !loading && (
        <div className="mt-6">
          <p className="text-xs text-muted-foreground mb-3">Cursos populares</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_COURSES.map((name) => (
              <button
                key={name}
                onClick={() => handlePopular(name)}
                className="px-3.5 py-2 rounded-lg border border-border bg-background text-xs font-medium text-foreground hover:bg-secondary/60 hover:border-foreground/10 transition-all"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StepCourse;
