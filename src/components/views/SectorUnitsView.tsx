import { useTasks } from '@/hooks/useTasks';
import { useUnits } from '@/hooks/useUnits';
import { cn } from '@/lib/utils';
import { Loader2, Building2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SectorUnitsViewProps {
  sectorId: string;
}

export const SectorUnitsView = ({ sectorId }: SectorUnitsViewProps) => {
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: units, isLoading: unitsLoading } = useUnits();

  const isLoading = tasksLoading || unitsLoading;

  // Filter tasks by sector
  const sectorTasks = tasks?.filter((t) => (t as any).sector_id === sectorId) || [];

  // Group tasks by unit
  const tasksByUnit = units?.map((unit) => {
    const unitTasks = sectorTasks.filter((t) => t.unit_id === unit.id);
    const pending = unitTasks.filter((t) => t.status === 'pendente').length;
    const inProgress = unitTasks.filter((t) => t.status === 'em_andamento').length;
    const completed = unitTasks.filter((t) => t.status === 'concluida').length;
    const overdue = unitTasks.filter((t) => t.status === 'atrasada').length;

    return {
      unit,
      tasks: unitTasks,
      stats: { pending, inProgress, completed, overdue, total: unitTasks.length },
    };
  }).filter((g) => g.stats.total > 0) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tasksByUnit.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">Nenhuma tarefa encontrada neste setor</p>
        <p className="text-sm text-muted-foreground mt-2">
          Crie tarefas e atribua a unidades para vê-las aqui
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tasksByUnit.map(({ unit, tasks, stats }) => (
          <Card key={unit.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  {unit.name}
                </CardTitle>
                <Badge variant="secondary">{unit.code}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="text-center p-2 rounded-lg bg-warning/10">
                  <Clock className="w-4 h-4 mx-auto text-warning mb-1" />
                  <p className="text-lg font-bold text-warning">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pend.</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-primary/10">
                  <AlertCircle className="w-4 h-4 mx-auto text-primary mb-1" />
                  <p className="text-lg font-bold text-primary">{stats.inProgress}</p>
                  <p className="text-xs text-muted-foreground">Andamento</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-success/10">
                  <CheckCircle2 className="w-4 h-4 mx-auto text-success mb-1" />
                  <p className="text-lg font-bold text-success">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground">Concl.</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-destructive/10">
                  <AlertCircle className="w-4 h-4 mx-auto text-destructive mb-1" />
                  <p className="text-lg font-bold text-destructive">{stats.overdue}</p>
                  <p className="text-xs text-muted-foreground">Atras.</p>
                </div>
              </div>

              {/* Task list preview */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {tasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 text-sm"
                  >
                    <span className="truncate flex-1">{task.title}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'ml-2 text-xs',
                        task.status === 'pendente' && 'border-warning text-warning',
                        task.status === 'em_andamento' && 'border-primary text-primary',
                        task.status === 'concluida' && 'border-success text-success',
                        task.status === 'atrasada' && 'border-destructive text-destructive'
                      )}
                    >
                      {task.status === 'pendente' && 'Pendente'}
                      {task.status === 'em_andamento' && 'Em andamento'}
                      {task.status === 'concluida' && 'Concluída'}
                      {task.status === 'atrasada' && 'Atrasada'}
                    </Badge>
                  </div>
                ))}
                {tasks.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{tasks.length - 5} tarefas
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
