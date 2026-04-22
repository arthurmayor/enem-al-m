import { ChevronRight } from "lucide-react";
import type { Subtopic } from "@/hooks/dashboard/useProficiencySubtopics";

interface Props {
  subject: string;
  score: number;
  delta: number | null;
  color: string;
  isExpanded: boolean;
  onToggle: () => void;
  subtopics: Subtopic[] | undefined;
  subtopicsLoading: boolean;
}

export default function SubjectProficiencyRow({
  subject,
  score,
  delta,
  color,
  isExpanded,
  onToggle,
  subtopics,
  subtopicsLoading,
}: Props) {
  const clamped = Math.min(100, Math.max(0, score));

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[0_14px_32px_-30px_hsl(var(--foreground)/0.35)] transition-all hover:border-border hover:bg-background text-left"
      >
        <div
          className="h-[12px] w-[12px] rounded-full shrink-0 shadow-[0_0_0_4px_hsl(var(--muted)/0.9)]"
          style={{ backgroundColor: color }}
        />
        <span className="w-[90px] shrink-0 text-[13px] font-semibold text-foreground">
          {subject}
        </span>
        <div className="flex-1 overflow-hidden rounded-full bg-muted h-2.5">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${clamped}%`, backgroundColor: color }}
          />
        </div>
        <span
          className="w-[38px] shrink-0 text-right text-[13px] font-bold"
          style={{ color }}
        >
          {score}%
        </span>
        {delta != null && (
          <span
            className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold shrink-0 ${
              delta >= 0
                ? "bg-success/15 text-success"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        )}
        <ChevronRight
          className={`h-4 w-4 text-[#B4B2A9] shrink-0 transition-transform duration-200 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
      </button>

      <div
        className="overflow-hidden transition-[max-height,opacity] duration-300"
        style={{
          maxHeight: isExpanded ? 600 : 0,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="py-1">
          {(() => {
            // "Geral" é um agregado; ele aparece como proficiência da matéria
            // como um todo e duplica a barra superior. Filtramos no frontend.
            const visibleSubtopics = (subtopics ?? []).filter(
              (s) => s.subtopic.toLowerCase() !== "geral",
            );
            if (subtopicsLoading) {
              return (
                <p className="py-3 pl-[34px] text-xs text-muted-foreground">
                  Carregando subtemas...
                </p>
              );
            }
            if (visibleSubtopics.length === 0) {
              return (
                <p className="py-3 pl-[34px] text-xs text-muted-foreground">
                  Nenhum subtema registrado ainda.
                </p>
              );
            }
            return visibleSubtopics.map((st) => {
              const stClamped = Math.min(100, Math.max(0, st.score));
              return (
                <div
                  key={st.subtopic}
                  className="flex items-center gap-2.5 py-[9px] pl-[34px] text-xs"
                >
                  <span className="flex-1 text-muted-foreground">{st.subtopic}</span>
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${stClamped}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span
                    className="w-9 text-right font-semibold"
                    style={{ color }}
                  >
                    {st.score}%
                  </span>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
