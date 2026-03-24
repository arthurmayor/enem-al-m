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
        <h2 className="text-2xl font-semibold text-foreground leading-tight">
          Como você se sente nessas áreas?
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
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
              className={`rounded-2xl border p-5 transition-all ${
                selected
                  ? "border-foreground/20 bg-secondary/40"
                  : "border-border bg-background"
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <Icon className="h-4.5 w-4.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{block.label}</p>
                  <p className="text-xs text-muted-foreground">{block.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => onChange(block.key, level.value)}
                    className={`h-9 rounded-lg text-xs font-medium transition-all border ${
                      selected === level.value
                        ? "bg-foreground text-primary-foreground border-foreground"
                        : "bg-background text-foreground border-border hover:border-foreground/20"
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
