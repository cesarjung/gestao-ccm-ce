import { Loader2, Calendar, CalendarDays, CalendarRange, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Enums } from '@/integrations/supabase/types';

type TaskFrequency = Enums<'task_frequency'>;

interface FrequencySummary {
  frequency: TaskFrequency;
  routineCount: number;
  completed: number;
  pending: number;
  total: number;
  percentage: number;
}

interface FrequencySectionProps {
  data: FrequencySummary[] | undefined;
  isLoading: boolean;
}

const frequencyLabelsMap: Record<string, string> = {
  diaria: 'Diárias',
  semanal: 'Semanais',
  quinzenal: 'Quinzenais',
  mensal: 'Mensais',
};

const frequencyIcons: Record<TaskFrequency, React.ElementType> = {
  diaria: Calendar,
  semanal: CalendarDays,
  quinzenal: CalendarRange,
  mensal: CalendarCheck,
  anual: CalendarCheck,
  customizada: Calendar,
};

const frequencyColors: Record<TaskFrequency, { accent: string; bg: string; border: string; bar: string }> = {
  diaria: {
    accent: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    bar: 'bg-gradient-to-r from-sky-500 to-blue-500',
  },
  semanal: {
    accent: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    bar: 'bg-gradient-to-r from-emerald-500 to-teal-500',
  },
  quinzenal: {
    accent: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    bar: 'bg-gradient-to-r from-amber-500 to-orange-500',
  },
  mensal: {
    accent: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    bar: 'bg-gradient-to-r from-violet-500 to-purple-500',
  },
  anual: {
    accent: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    bar: 'bg-gradient-to-r from-rose-500 to-pink-500',
  },
  customizada: {
    accent: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    bar: 'bg-gradient-to-r from-cyan-500 to-teal-500',
  },
};

export const FrequencySection = ({ data, isLoading }: FrequencySectionProps) => {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-card">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
      <div className="p-5 border-b border-border/50">
        <h3 className="font-semibold text-foreground">Rotinas por Frequência</h3>
        <p className="text-sm text-muted-foreground mt-1">Acompanhe o progresso por período</p>
      </div>

      <div className="divide-y divide-border/50">
        {data?.map((summary, index) => {
          const Icon = frequencyIcons[summary.frequency];
          const colors = frequencyColors[summary.frequency];
          const label = frequencyLabelsMap[summary.frequency];

          return (
            <div
              key={summary.frequency}
              className="p-5 hover:bg-secondary/20 transition-colors animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className={cn('p-2.5 rounded-xl', colors.bg)}>
                  <Icon className={cn('w-5 h-5', colors.accent)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-foreground">{label}</h4>
                      <p className="text-xs text-muted-foreground">
                        {summary.routineCount} rotina{summary.routineCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-2xl font-bold', colors.accent)}>
                        {summary.percentage}%
                      </p>
                    </div>
                  </div>

                  <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-1000 ease-out', colors.bar)}
                      style={{ width: `${summary.percentage}%` }}
                    />
                  </div>

                  <div className="flex justify-between mt-2 text-xs">
                    <span className="text-success">
                      <span className="font-medium">{summary.completed}</span> concluídas
                    </span>
                    <span className="text-warning">
                      <span className="font-medium">{summary.pending}</span> pendentes
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
