const STAGES = ["1º EM", "2º EM", "3º EM", "Cursinho", "Formado"];

interface Props {
  schoolStage: string;
  difficulty: string;
  onChangeStage: (v: string) => void;
  onChangeDifficulty: (v: string) => void;
}

const StepAboutYou = ({
  schoolStage,
  difficulty,
  onChangeStage,
  onChangeDifficulty,
}: Props) => {
  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-ink-strong leading-tight">
          Conta um pouco sobre você
        </h2>
        <p className="text-sm text-ink-soft mt-2">
          Essas informações ajudam a calibrar seu ponto de partida.
        </p>
      </div>

      {/* School stage */}
      <div>
        <label className="text-sm font-medium text-ink-strong mb-1.5 block">Etapa escolar</label>
        <div className="mt-3 flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => onChangeStage(s)}
              className={`px-4 py-2.5 rounded-input text-sm font-medium transition-all border ${
                schoolStage === s
                  ? "bg-ink-strong text-white border-ink-strong"
                  : "bg-bg-app text-ink border-line hover:border-ink-soft"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty - optional */}
      <div>
        <label className="text-sm font-medium text-ink-strong mb-1.5 block">
          Maior dificuldade{" "}
          <span className="text-ink-muted font-normal">(opcional)</span>
        </label>
        <textarea
          value={difficulty}
          onChange={(e) => onChangeDifficulty(e.target.value)}
          placeholder="Ex.: tenho dificuldade em exatas"
          rows={2}
          className="mt-1 w-full bg-bg-app border border-line rounded-input px-4 py-3 text-sm text-ink placeholder:text-ink-muted resize-none focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 transition-colors"
        />
        <p className="text-xs text-ink-muted mt-1">Isso ajuda a personalizar seu plano.</p>
      </div>
    </div>
  );
};

export default StepAboutYou;
