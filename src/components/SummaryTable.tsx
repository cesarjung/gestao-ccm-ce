import { cn } from '@/lib/utils';
import { ProgressBar } from './ProgressBar';
import { CheckCircle2, Clock, TrendingUp } from 'lucide-react';

interface SummaryItem {
  name: string;
  completed: number;
  pending: number;
  total: number;
}

interface SummaryTableProps {
  title: string;
  icon: React.ElementType;
  items: SummaryItem[];
  className?: string;
}

export const SummaryTable = ({ title, icon: Icon, items, className }: SummaryTableProps) => {
  const sortedItems = [...items].sort((a, b) => {
    const aPercentage = a.total > 0 ? a.completed / a.total : 0;
    const bPercentage = b.total > 0 ? b.completed / b.total : 0;
    return bPercentage - aPercentage;
  });

  return (
    <div className={cn('rounded-xl border border-border bg-card shadow-card', className)}>
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Icon className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>

      <div className="divide-y divide-border">
        {sortedItems.map((item, index) => {
          const percentage = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
          
          return (
            <div
              key={item.name}
              className="p-4 hover:bg-secondary/30 transition-colors animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-foreground">{item.name}</span>
                <div className="flex items-center gap-1">
                  <TrendingUp className={cn(
                    'w-4 h-4',
                    percentage >= 70 ? 'text-success' : percentage >= 40 ? 'text-warning' : 'text-destructive'
                  )} />
                  <span className={cn(
                    'text-sm font-semibold',
                    percentage >= 70 ? 'text-success' : percentage >= 40 ? 'text-warning' : 'text-destructive'
                  )}>
                    {percentage}%
                  </span>
                </div>
              </div>

              <ProgressBar completed={item.completed} total={item.total} showLabel={false} />

              <div className="flex justify-between mt-2 text-xs">
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
          );
        })}
      </div>
    </div>
  );
};
