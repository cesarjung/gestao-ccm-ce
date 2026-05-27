import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  delay?: number;
}

export const StatCard = ({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  trend,
  delay = 0,
}: StatCardProps) => {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border/50 bg-card p-5 shadow-card stat-card-hover animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Subtle gradient overlay */}
      <div className={cn('absolute inset-0 opacity-50', bgColor)} />
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {label}
          </p>
          <p className={cn('text-3xl font-bold', color)}>
            {value}
          </p>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span className={cn(
                'text-xs font-medium',
                trend.isPositive ? 'text-success' : 'text-destructive'
              )}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs text-muted-foreground">vs. anterior</span>
            </div>
          )}
        </div>
        
        <div className={cn('p-3 rounded-xl', bgColor.replace('bg-gradient-to-br', 'bg-gradient-to-tr'))}>
          <Icon className={cn('w-6 h-6', color)} />
        </div>
      </div>
    </div>
  );
};
