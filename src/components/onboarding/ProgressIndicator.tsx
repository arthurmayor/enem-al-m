import { Check } from "lucide-react";

interface Props {
  current: number;
  total: number;
}

const ProgressIndicator = ({ current, total }: Props) => {
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < current;
        const isActive = step === current;
        const isFuture = step > current;

        return (
          <div key={step} className="flex items-center gap-3">
            {/* Circle */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                isCompleted
                  ? "bg-signal-ok text-white"
                  : isActive
                    ? "bg-brand-500 text-white"
                    : "bg-line text-ink-muted border border-line"
              }`}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : step}
            </div>

            {/* Connecting line (not after last) */}
            {step < total && (
              <div
                className={`w-12 h-0.5 transition-all duration-300 ${
                  isCompleted ? "bg-signal-ok" : "bg-line"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ProgressIndicator;
