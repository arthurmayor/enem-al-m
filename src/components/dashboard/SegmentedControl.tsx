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
      className={`inline-flex gap-[2px] bg-[#F1EFE8] rounded-lg p-[2px] ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt === active;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`text-[11px] font-medium px-[9px] py-1 rounded-md transition-colors ${
              isActive
                ? "bg-coral text-white"
                : "bg-transparent text-[#888780] hover:bg-black/[0.04]"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
