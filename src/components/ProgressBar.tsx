import { cn } from '@/lib/utils';

interface ProgressBarProps {
  completed: number;
  total: number;
  className?: string;
  showLabel?: boolean;
}

export const ProgressBar = ({ completed, total, className, showLabel = true }: ProgressBarProps) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // If className contains height classes, don't add space-y wrapper
  const hasCustomHeight = className?.includes('h-');

  if (hasCustomHeight) {
    return (
      <div className={cn('bg-secondary rounded-full overflow-hidden', className)}>
        <div
          className="h-full bg-gradient-to-r from-success to-emerald-400 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      {showLabel && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Progresso</span>
          <span className="font-medium text-foreground">{percentage}%</span>
        </div>
      )}
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-success to-emerald-400 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
