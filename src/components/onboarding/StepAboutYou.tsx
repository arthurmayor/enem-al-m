const STAGES = ["1º EM", "2º EM", "3º EM", "Cursinho", "Formado"];
const SCHOOL_TYPES = ["Escola pública", "Escola particular"];
const MOCK_OPTIONS = ["Nunca fiz simulado", "Faz um tempo", "Fiz recentemente"];

interface Props {
  schoolStage: string;
  schoolType: string;
  lastMockExperience: string;
  difficulty: string;
  onChangeStage: (v: string) => void;
  onChangeType: (v: string) => void;
  onChangeMock: (v: string) => void;
  onChangeDifficulty: (v: string) => void;
}

const StepAboutYou = ({
  schoolStage,
  schoolType,
  lastMockExperience,
  difficulty,
  onChangeStage,
  onChangeType,
  onChangeMock,
  onChangeDifficulty,
}: Props) => {
  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-foreground leading-tight">
          Conta um pouco sobre você
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Essas informações ajudam a calibrar seu ponto de partida.
        </p>
      </div>

      {/* School stage */}
      <div>
        <label className="text-sm font-medium text-foreground">Etapa escolar</label>
        <div className="mt-3 flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => onChangeStage(s)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                schoolStage === s
                  ? "bg-foreground text-primary-foreground border-foreground"
                  : "bg-background text-foreground border-border hover:border-foreground/20"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* School type */}
      <div>
        <label className="text-sm font-medium text-foreground">Tipo de escola</label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {SCHOOL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => onChangeType(t)}
              className={`h-11 rounded-xl text-sm font-medium transition-all border ${
                schoolType === t
                  ? "bg-foreground text-primary-foreground border-foreground"
                  : "bg-background text-foreground border-border hover:border-foreground/20"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Mock experience */}
      <div>
        <label className="text-sm font-medium text-foreground">Experiência com simulados</label>
        <div className="mt-3 flex flex-col gap-2">
          {MOCK_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => onChangeMock(m)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                lastMockExperience === m
                  ? "bg-foreground text-primary-foreground border-foreground"
                  : "bg-background text-foreground border-border hover:border-foreground/20"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty - optional */}
      <div>
        <label className="text-sm font-medium text-foreground">
          Maior dificuldade{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <textarea
          value={difficulty}
          onChange={(e) => onChangeDifficulty(e.target.value)}
          placeholder="Ex.: tenho dificuldade em exatas"
          rows={2}
          className="mt-2 w-full px-4 py-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-foreground/30 transition-all"
        />
      </div>
    </div>
  );
};

export default StepAboutYou;
