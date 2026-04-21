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
        className="w-full flex items-center gap-2.5 py-2.5 border-b border-[#F1EFE8] cursor-pointer hover:bg-[#FAFAF8] transition-colors text-left"
      >
        <div
          className="h-[14px] w-[14px] rounded shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-[13px] font-medium w-[90px] shrink-0 text-[#2C2C2A]">
          {subject}
        </span>
        <div className="flex-1 h-1.5 bg-[#F1EFE8] rounded-sm overflow-hidden">
          <div
            className="h-full rounded-sm transition-[width] duration-300"
            style={{ width: `${clamped}%`, backgroundColor: color }}
          />
        </div>
        <span
          className="text-[13px] font-semibold w-[38px] text-right shrink-0"
          style={{ color }}
        >
          {score}%
        </span>
        {delta != null && (
          <span
            className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap shrink-0 ${
              delta >= 0
                ? "bg-[#E1F5EE] text-[#1D9E75]"
                : "bg-[#FCEBEB] text-[#A32D2D]"
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
                <p className="text-xs text-[#B4B2A9] pl-[34px] py-2">
                  Carregando subtemas...
                </p>
              );
            }
            if (visibleSubtopics.length === 0) {
              return (
                <p className="text-xs text-[#B4B2A9] pl-[34px] py-2">
                  Nenhum subtema registrado ainda.
                </p>
              );
            }
            return visibleSubtopics.map((st) => {
              const stClamped = Math.min(100, Math.max(0, st.score));
              return (
                <div
                  key={st.subtopic}
                  className="flex items-center gap-2.5 py-[7px] pl-[34px] text-xs"
                >
                  <span className="text-[#888780] flex-1">{st.subtopic}</span>
                  <div className="w-20 h-1 bg-[#F1EFE8] rounded overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${stClamped}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span
                    className="font-semibold w-9 text-right"
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
