interface ProgressBarProps {
  value: number;
  color?: string;
  size?: "sm" | "md";
}

const ProgressBar = ({ value, color, size = "md" }: ProgressBarProps) => {
  const clamped = Math.min(100, Math.max(0, value));
  const height = size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className={`w-full ${height} bg-line-light rounded-full overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-[600ms] ease-out`}
        style={{
          width: `${clamped}%`,
          backgroundColor: color || "#2563EB",
        }}
      />
    </div>
  );
};

export default ProgressBar;
