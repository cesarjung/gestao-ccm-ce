import { cn } from '@/lib/utils';
import { Calendar, CalendarDays, CalendarRange, CalendarCheck } from 'lucide-react';
import type { Enums } from '@/integrations/supabase/types';

type TaskFrequency = Enums<'task_frequency'>;

interface FrequencyCardProps {
  frequency: TaskFrequency;
  label: string;
  taskCount: number;
  completed: number;
  pending: number;
  total: number;
  percentage: number;
  delay?: number;
}

const frequencyIcons: Record<TaskFrequency, React.ElementType> = {
  diaria: Calendar,
  semanal: CalendarDays,
  quinzenal: CalendarRange,
  mensal: CalendarCheck,
  anual: CalendarCheck,
  customizada: Calendar,
};

const frequencyGradients: Record<TaskFrequency, string> = {
  diaria: 'from-primary/20 to-blue-600/10',
  semanal: 'from-emerald-500/20 to-teal-600/10',
  quinzenal: 'from-amber-500/20 to-orange-600/10',
  mensal: 'from-violet-500/20 to-purple-600/10',
  anual: 'from-rose-500/20 to-pink-600/10',
  customizada: 'from-cyan-500/20 to-teal-600/10',
};

const frequencyAccents: Record<TaskFrequency, string> = {
  diaria: 'text-primary',
  semanal: 'text-emerald-400',
  quinzenal: 'text-amber-400',
  mensal: 'text-violet-400',
  anual: 'text-rose-400',
  customizada: 'text-cyan-400',
};

const frequencyBorders: Record<TaskFrequency, string> = {
  diaria: 'border-primary/30',
  semanal: 'border-emerald-500/30',
  quinzenal: 'border-amber-500/30',
  mensal: 'border-violet-500/30',
  anual: 'border-rose-500/30',
  customizada: 'border-cyan-500/30',
};

const frequencyBarColors: Record<TaskFrequency, string> = {
  diaria: 'bg-primary',
  semanal: 'bg-emerald-500',
  quinzenal: 'bg-amber-500',
  mensal: 'bg-violet-500',
  anual: 'bg-rose-500',
  customizada: 'bg-cyan-500',
};

export const FrequencyCard = ({
  frequency,
  label,
  taskCount,
  completed,
  pending,
  total,
  percentage,
  delay = 0,
}: FrequencyCardProps) => {
  const Icon = frequencyIcons[frequency];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-6 shadow-card animate-slide-up',
        frequencyBorders[frequency]
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-50',
          frequencyGradients[frequency]
        )}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className={cn('p-2 rounded-lg bg-background/50', frequencyAccents[frequency])}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {taskCount} rotina{taskCount !== 1 ? 's' : ''}
          </span>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-1">
          {label}
        </h3>

        <div className="flex items-end gap-2 mb-4">
          <span className={cn('text-3xl font-bold', frequencyAccents[frequency])}>
            {percentage}%
          </span>
          <span className="text-sm text-muted-foreground mb-1">concluído</span>
        </div>

        <div className="h-2 bg-background/50 rounded-full overflow-hidden mb-3">
          <div
            className={cn('h-full rounded-full transition-all duration-1000 ease-out', frequencyBarColors[frequency])}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-success">
            <span className="font-medium">{completed}</span> concluídas
          </span>
          <span className="text-warning">
            <span className="font-medium">{pending}</span> pendentes
          </span>
        </div>
      </div>
    </div>
  );
};
