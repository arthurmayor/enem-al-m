const HOURS_OPTIONS = [
  { label: "30 min", value: 0.5 },
  { label: "1h", value: 1 },
  { label: "2h", value: 2 },
  { label: "3h+", value: 3 },
];

const DAYS = [
  { id: "seg", label: "S" },
  { id: "ter", label: "T" },
  { id: "qua", label: "Q" },
  { id: "qui", label: "Q" },
  { id: "sex", label: "S" },
  { id: "sab", label: "S" },
  { id: "dom", label: "D" },
];

interface Props {
  hoursPerDay: number | null;
  availableDays: string[];
  onChangeHours: (v: number) => void;
  onToggleDay: (day: string) => void;
}

const StepRoutine = ({
  hoursPerDay,
  availableDays,
  onChangeHours,
  onToggleDay,
}: Props) => {
  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-foreground leading-tight">
          Vamos montar sua rotina
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Não precisa ser perfeito. Isso só ajuda a distribuir melhor seu plano de estudo.
        </p>
      </div>

      {/* Hours per day */}
      <div>
        <label className="text-sm font-medium text-foreground">Quanto tempo por dia?</label>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {HOURS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChangeHours(opt.value)}
              className={`h-12 rounded-xl text-sm font-medium transition-all border ${
                hoursPerDay === opt.value
                  ? "bg-foreground text-primary-foreground border-foreground"
                  : "bg-background text-foreground border-border hover:border-foreground/20"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Available days */}
      <div>
        <label className="text-sm font-medium text-foreground">Dias disponíveis</label>
        <div className="mt-3 flex gap-2 justify-center">
          {DAYS.map((day) => (
            <button
              key={day.id}
              onClick={() => onToggleDay(day.id)}
              title={day.id}
              className={`h-10 w-10 rounded-full text-xs font-semibold transition-all border ${
                availableDays.includes(day.id)
                  ? "bg-foreground text-primary-foreground border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/20"
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StepRoutine;
