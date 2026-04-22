interface ProgressRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
}

export default function ProgressRing({
  percentage,
  size = 120,
  strokeWidth = 8,
   color = "hsl(var(--chart-violet))",
   trackColor = "hsl(var(--muted))",
  label,
  sublabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute inset-[10%] rounded-full border border-border/60 bg-background/90 shadow-[inset_0_1px_0_hsl(var(--background)),0_18px_40px_-28px_hsl(var(--chart-violet)/0.45)]" />
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold text-foreground leading-none tracking-[-0.04em]">
          {label ?? `${percentage}%`}
        </span>
        {sublabel && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{sublabel}</span>
        )}
      </div>
    </div>
  );
}