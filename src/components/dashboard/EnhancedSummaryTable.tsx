import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, TrendingUp, Loader2 } from 'lucide-react';

interface SummaryItem {
  name: string;
  completed: number;
  pending: number;
  total: number;
}

interface EnhancedSummaryTableProps {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  items: SummaryItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export const EnhancedSummaryTable = ({
  title,
  subtitle,
  icon: Icon,
  items,
  isLoading,
  emptyMessage = 'Nenhum dado encontrado',
  className,
}: EnhancedSummaryTableProps) => {
  const sortedItems = [...items].sort((a, b) => {
    const aPercentage = a.total > 0 ? a.completed / a.total : 0;
    const bPercentage = b.total > 0 ? b.completed / b.total : 0;
    return bPercentage - aPercentage;
  });

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-border/50 bg-card p-6 shadow-card', className)}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-border/50 bg-card shadow-card overflow-hidden', className)}>
      <div className="p-5 border-b border-border/50 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="divide-y divide-border/50 max-h-[400px] overflow-y-auto">
          {sortedItems.map((item, index) => {
            const percentage = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
            const statusColor = percentage >= 70 ? 'text-success' : percentage >= 40 ? 'text-warning' : 'text-destructive';
            const statusBg = percentage >= 70 ? 'bg-success' : percentage >= 40 ? 'bg-warning' : 'bg-destructive';
            
            return (
              <div
                key={item.name}
                className="p-4 hover:bg-secondary/20 transition-colors animate-fade-in group"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-center gap-3">
                  {/* Rank badge */}
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                    index === 0 ? 'bg-amber-500/20 text-amber-400' :
                    index === 1 ? 'bg-slate-400/20 text-slate-300' :
                    index === 2 ? 'bg-orange-600/20 text-orange-400' :
                    'bg-secondary text-muted-foreground'
                  )}>
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-foreground truncate pr-2">{item.name}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <TrendingUp className={cn('w-4 h-4', statusColor)} />
                        <span className={cn('text-lg font-bold', statusColor)}>
                          {percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden mb-2">
                      <div
                        className={cn('h-full rounded-full transition-all duration-700 ease-out', statusBg)}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1 text-success">
                        <CheckCircle2 className="w-3 h-3" />
                        {item.completed} concluídas
                      </span>
                      <span className="flex items-center gap-1 text-warning">
                        <Clock className="w-3 h-3" />
                        {item.pending} pendentes
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
