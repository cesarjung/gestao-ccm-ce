import { useUnitsSummary } from '@/hooks/useDashboardData';
import { useTasks } from '@/hooks/useTasks';
import { ProgressBar } from '@/components/ProgressBar';
import { CheckCircle2, Clock, Building2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const frequencyLabels: Record<string, string> = {
  diaria: 'Diária',
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
};

export const UnitsView = () => {
  const { data: unitsSummary, isLoading: loadingUnits } = useUnitsSummary();
  const { data: allTasks, isLoading: loadingTasks } = useTasks();

  const isLoading = loadingUnits || loadingTasks;

  const getUnitTasks = (unitId: string) => {
    return allTasks?.filter(task => task.unit_id === unitId) || [];
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Unidades</h1>
          <p className="text-muted-foreground">Acompanhe o progresso de cada unidade</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-1">Unidades</h1>
        <p className="text-muted-foreground">Acompanhe o progresso de cada unidade</p>
      </div>

      {(!unitsSummary || unitsSummary.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma unidade encontrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {unitsSummary.map((unit, index) => {
            const percentage = unit.total > 0
              ? Math.round((unit.completed / unit.total) * 100)
              : 0;
            const tasks = getUnitTasks(unit.id);

            return (
              <div
                key={unit.id}
                className="rounded-xl border border-border bg-card shadow-card overflow-hidden animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{unit.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {unit.code} • {unit.total} tarefa{unit.total !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-xl font-bold',
                        percentage >= 70 ? 'text-success' : percentage >= 40 ? 'text-warning' : 'text-destructive'
                      )}
                    >
                      {percentage}%
                    </span>
                  </div>

                  <ProgressBar completed={unit.completed} total={unit.total} />

                  <div className="flex justify-between mt-2 text-xs">
                    <span className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="w-3 h-3" />
                      {unit.completed} concluídas
                    </span>
                    <span className="flex items-center gap-1 text-warning">
                      <Clock className="w-3 h-3" />
                      {unit.pending} pendentes
                    </span>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {tasks.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Nenhuma tarefa nesta unidade
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          'px-4 py-2 border-b border-border last:border-0 flex items-center justify-between',
                          task.status === 'concluida' ? 'bg-success/5' : 'bg-warning/5'
                        )}
                      >
                        <div>
                          <p className="text-sm text-foreground">{task.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {task.routine && <span>{frequencyLabels[task.routine.frequency]}</span>}
                          </div>
                        </div>
                        {task.status === 'concluida' ? (
                          <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-warning flex-shrink-0" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
