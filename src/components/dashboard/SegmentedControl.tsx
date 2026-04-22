interface SegmentedControlProps<T extends string> {
  options: readonly T[];
  active: T;
  onChange: (value: T) => void;
  className?: string;
}

export default function SegmentedControl<T extends string>({
  options,
  active,
  onChange,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 p-1 shadow-[0_10px_30px_-24px_hsl(var(--chart-violet)/0.45)] backdrop-blur-sm ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt === active;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] transition-all ${
              isActive
                ? "bg-[hsl(var(--chart-violet))] text-primary-foreground shadow-[0_10px_24px_-18px_hsl(var(--chart-violet)/0.9)]"
                : "bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
