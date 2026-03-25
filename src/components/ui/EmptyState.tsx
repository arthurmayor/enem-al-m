import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState = ({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="h-12 w-12 rounded-full bg-line-light flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-ink-muted" />
      </div>
      <h3 className="text-base font-semibold text-ink-strong mb-1">{title}</h3>
      <p className="text-sm text-ink-soft max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-input bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
