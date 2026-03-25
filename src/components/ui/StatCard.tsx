import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  delta?: string;
}

const StatCard = ({ label, value, subtitle, icon: Icon, delta }: StatCardProps) => {
  return (
    <div className="bg-bg-card border border-line-light rounded-card shadow-card p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-ink-muted" />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-ink-strong">{value}</span>
        {delta && (
          <span className="text-xs font-medium text-signal-ok">{delta}</span>
        )}
      </div>
      {subtitle && (
        <span className="text-sm text-ink-soft">{subtitle}</span>
      )}
    </div>
  );
};

export default StatCard;
