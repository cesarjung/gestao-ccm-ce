import { CheckCircle2, Clock, ListTodo, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOverallStats } from '@/hooks/useDashboardData';

interface StatsOverviewProps {
  sectorId?: string | null;
}

export const StatsOverview = ({ sectorId }: StatsOverviewProps) => {
  const { data: statsData, isLoading } = useOverallStats(sectorId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-card animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted" />
              <div className="space-y-2">
                <div className="h-6 w-12 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const stats = [
    {
      label: 'Total de Rotinas',
      value: statsData?.routineCount || 0,
      icon: ListTodo,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Tarefas Concluídas',
      value: statsData?.completed || 0,
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'Tarefas Pendentes',
      value: statsData?.pending || 0,
      icon: Clock,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      label: 'Taxa de Conclusão',
      value: `${statsData?.percentage || 0}%`,
      icon: TrendingUp,
      color: (statsData?.percentage || 0) >= 70 ? 'text-success' : (statsData?.percentage || 0) >= 40 ? 'text-warning' : 'text-destructive',
      bg: (statsData?.percentage || 0) >= 70 ? 'bg-success/10' : (statsData?.percentage || 0) >= 40 ? 'bg-warning/10' : 'bg-destructive/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-4 shadow-card animate-slide-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', stat.bg)}>
                <Icon className={cn('w-5 h-5', stat.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
