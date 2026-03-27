import { BookOpen, Globe, Leaf, Calculator } from "lucide-react";

const BLOCKS = [
  {
    key: "linguagens",
    label: "Linguagens",
    description: "Português, Inglês, Literatura",
    icon: BookOpen,
  },
  {
    key: "humanas",
    label: "Humanas",
    description: "História, Geografia, Filosofia",
    icon: Globe,
  },
  {
    key: "natureza",
    label: "Natureza",
    description: "Biologia, Física, Química",
    icon: Leaf,
  },
  {
    key: "matematica",
    label: "Matemática",
    description: "Álgebra, Geometria, Funções",
    icon: Calculator,
  },
];

const LEVELS = [
  { value: "fraco", label: "Fraco" },
  { value: "medio", label: "Médio" },
  { value: "forte", label: "Forte" },
];

interface Props {
  selfDeclaredBlocks: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

const StepSelfAssessment = ({ selfDeclaredBlocks, onChange }: Props) => {
  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-ink-strong leading-tight">
          Como você se sente nessas áreas?
        </h2>
        <p className="text-sm text-ink-soft mt-2">
          É uma percepção inicial. Vamos calibrar isso no diagnóstico.
        </p>
      </div>

      <div className="space-y-3">
        {BLOCKS.map((block) => {
          const Icon = block.icon;
          const selected = selfDeclaredBlocks[block.key] || "";
          return (
            <div
              key={block.key}
              className={`rounded-card border p-5 transition-all ${
                selected
                  ? "border-brand-500/20 bg-brand-50"
                  : "border-line bg-bg-app"
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <Icon className="h-4.5 w-4.5 text-ink-soft" />
                <div>
                  <p className="text-sm font-semibold text-ink-strong">{block.label}</p>
                  <p className="text-xs text-ink-muted">{block.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => onChange(block.key, level.value)}
                    className={`h-9 rounded-input text-xs font-medium transition-all border ${
                      selected === level.value
                        ? "bg-ink-strong text-white border-ink-strong"
                        : "bg-bg-card text-ink border-line hover:border-ink-soft"
                    }`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StepSelfAssessment;
