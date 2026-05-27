import { useMemo, useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useUpdateTask } from '@/hooks/useTaskMutations';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Loader2, ChevronLeft, ChevronRight, Pencil, Check, MinusCircle, MoreVertical, Circle, Play, Plus } from 'lucide-react';
import { format, differenceInDays, startOfDay, addDays, subDays, max, min } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { TaskEditDialog } from '@/components/TaskEditDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TaskForm } from '@/components/TaskForm';
import { RoutineForm } from '@/components/RoutineForm';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { TaskDetailPanel } from '@/components/TaskDetailPanel';
import { RoutineDetailPanel } from '@/components/RoutineDetailPanel';

type Task = Tables<'tasks'> & {
  unit?: { name: string; code: string } | null;
};

type TaskStatus = Enums<'task_status'>;

interface GanttViewProps {
  sectorId?: string;
  isMyTasks?: boolean;
  type?: 'tasks' | 'routines';
  hideHeader?: boolean;
}

export const GanttView = ({ sectorId, isMyTasks, type = 'tasks', hideHeader = false }: GanttViewProps) => {
  const { data: tasks, isLoading } = useTasks();
  const updateTask = useUpdateTask();
  const { user } = useAuth();
  const [viewStart, setViewStart] = useState(() => subDays(new Date(), 7));
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>(type === 'routines' ? 'routines_only' : 'all');

  // Detail Panel State
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedRoutine, setSelectedRoutine] = useState<any | null>(null);
  const [selectedDateContext, setSelectedDateContext] = useState<string | null>(null);

  const handleTaskClick = (task: Task) => {
    if (task.routine_id && (task as any).routine) {
      setSelectedRoutine((task as any).routine);
      setSelectedDateContext(task.due_date);
      setSelectedTask(null);
    } else {
      setSelectedTask(task);
      setSelectedRoutine(null);
      setSelectedDateContext(null);
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setEditDialogOpen(true);
  };

  const handleStatusChange = (taskId: string, newStatus: TaskStatus, e: React.MouseEvent) => {
    updateTask.mutate({
      id: taskId,
      status: newStatus,
      completed_at: newStatus === 'concluida' ? new Date().toISOString() : null,
    });
  };

  const daysToShow = 30;
  const dayWidth = 40;

  const dates = useMemo(() => {
    return Array.from({ length: daysToShow }, (_, i) => addDays(viewStart, i));
  }, [viewStart]);

  const tasksWithDates = useMemo(() => {
    return tasks?.filter(t => {
      const matchesSector = !sectorId || (t as any).sector_id === sectorId || t.routine?.sector_id === sectorId || t.unit?.sector_id === sectorId;
      const matchesUser = !isMyTasks || t.assigned_to === user?.id;
      const matchesType = typeFilter === 'all' 
        || (typeFilter === 'tasks_only' && !t.routine_id) 
        || (typeFilter === 'routines_only' && !!t.routine_id);
      return t.due_date && matchesSector && matchesUser && matchesType;
    }) || [];
  }, [tasks, sectorId, isMyTasks, user?.id, typeFilter]);

  // Helper to parse date string as local time to avoid timezone offset
  const parseLocal = (dateStr: string) => {
    if (!dateStr) return new Date();
    // If format is YYYY-MM-DD, append time to force local timezone
    if (dateStr.length === 10) return new Date(dateStr + 'T00:00:00');
    return new Date(dateStr);
  };

  const getTaskPosition = (task: typeof tasksWithDates[0]) => {
    if (!task.due_date) return null;

    const dueDate = startOfDay(parseLocal(task.due_date));
    const startDate = task.start_date ? startOfDay(parseLocal(task.start_date)) : subDays(dueDate, 2);

    const daysDiff = differenceInDays(startDate, viewStart);
    const duration = differenceInDays(dueDate, startDate) + 1;

    return {
      left: Math.max(0, daysDiff) * dayWidth,
      width: Math.max(duration, 1) * dayWidth,
      isVisible: daysDiff + duration > 0 && daysDiff < daysToShow,
    };
  };

  const statusColors: Record<string, string> = {
    pendente: 'bg-warning',
    em_andamento: 'bg-primary',
    concluida: 'bg-success',
    atrasada: 'bg-destructive',
    nao_aplicavel: 'bg-muted',
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {!hideHeader && (
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Gantt</h1>
            <p className="text-muted-foreground">Timeline de tarefas</p>
          </div>
        )}
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const today = startOfDay(new Date());
  const todayPosition = differenceInDays(today, viewStart) * dayWidth;

  return (
    <div className="space-y-4">
      <div className={cn("flex items-center", hideHeader ? "justify-end" : "justify-between")}>
        {!hideHeader && (
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground mb-1">
                  Gantt {type === 'routines' ? '(Rotinas)' : ''}
                </h1>
                <p className="text-muted-foreground">Visualize a timeline de {type === 'routines' ? 'rotinas' : 'tarefas'}</p>
              </div>

              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    {type === 'routines' ? 'Nova Rotina' : 'Nova Tarefa'}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {type === 'routines' ? 'Criar Nova Rotina' : 'Criar Nova Tarefa'}
                    </DialogTitle>
                  </DialogHeader>
                  {type === 'routines' ? (
                    <RoutineForm
                      sectorId={sectorId}
                      onSuccess={() => setIsCreateDialogOpen(false)}
                    />
                  ) : (
                    <TaskForm
                      sectorId={sectorId}
                      onSuccess={() => setIsCreateDialogOpen(false)}
                      onCancel={() => setIsCreateDialogOpen(false)}
                    />
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewStart(subDays(viewStart, 7))}
            className="h-7 w-7"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewStart(subDays(new Date(), 7))}
            className="h-7 text-xs px-2 font-medium"
          >
            Hoje
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewStart(addDays(viewStart, 7))}
            className="h-7 w-7"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex">
          {/* Task Names Column */}
          <div className="min-w-[240px] border-r border-border flex-shrink-0">
            <div className="h-14 bg-secondary/50 border-b border-border p-3 font-medium text-foreground">
              Tarefa
            </div>
            {tasksWithDates.map((task, index) => {
              const isCompleted = task.status === 'concluida';
              const isNA = task.status === 'nao_aplicavel';

              return (
                <div
                  key={task.id}
                  className="h-12 border-b border-border px-3 flex items-center gap-2 group cursor-pointer hover:bg-secondary/30"
                  style={{ animationDelay: `${index * 30}ms` }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    handleTaskClick(task as Task);
                  }}
                >
                  {/* Quick checkbox */}
                  <button
                    onClick={(e) => handleStatusChange(task.id, isCompleted ? 'pendente' : 'concluida', e)}
                    className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0',
                      isCompleted
                        ? 'bg-success border-success text-success-foreground'
                        : isNA
                          ? 'bg-muted border-muted-foreground/30'
                          : 'border-muted-foreground/40 hover:border-success hover:bg-success/10'
                    )}
                    title={isCompleted ? 'Marcar como pendente' : 'Marcar como concluída'}
                  >
                    {isCompleted && <Check className="h-3 w-3" />}
                    {isNA && <MinusCircle className="h-3 w-3 text-muted-foreground" />}
                  </button>

                  <div className="truncate flex-1">
                    <p className={cn(
                      "text-sm font-medium text-foreground truncate",
                      isCompleted && "line-through text-muted-foreground"
                    )}>{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{task.unit?.name}</p>
                  </div>

                  {/* More options */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => handleStatusChange(task.id, 'concluida', e as any)}>
                        <Check className="h-4 w-4 mr-2 text-success" />
                        Concluída
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => handleStatusChange(task.id, 'pendente', e as any)}>
                        <Circle className="h-4 w-4 mr-2 text-warning" />
                        Pendente
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => handleStatusChange(task.id, 'nao_aplicavel', e as any)}>
                        <MinusCircle className="h-4 w-4 mr-2 text-muted-foreground" />
                        Não se Aplica
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>

          {/* Timeline */}
          <div className="overflow-x-auto flex-1">
            <div style={{ width: daysToShow * dayWidth }}>
              {/* Date Headers */}
              <div className="h-14 bg-secondary/50 border-b border-border flex relative">
                {dates.map((date, index) => {
                  const isCurrentDay = differenceInDays(date, today) === 0;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                  return (
                    <div
                      key={date.toISOString()}
                      className={cn(
                        'flex-shrink-0 border-r border-border flex flex-col items-center justify-center text-xs',
                        isWeekend && 'bg-secondary/30',
                        isCurrentDay && 'bg-primary/10'
                      )}
                      style={{ width: dayWidth }}
                    >
                      <span className="text-muted-foreground">
                        {format(date, 'EEE', { locale: ptBR })}
                      </span>
                      <span className={cn(
                        'font-medium',
                        isCurrentDay ? 'text-primary' : 'text-foreground'
                      )}>
                        {format(date, 'd')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Task Bars */}
              <div className="relative">
                {/* Today Line */}
                {todayPosition >= 0 && todayPosition < daysToShow * dayWidth && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                    style={{ left: todayPosition + dayWidth / 2 }}
                  />
                )}

                {tasksWithDates.map((task, index) => {
                  const position = getTaskPosition(task);
                  if (!position?.isVisible) {
                    return (
                      <div key={task.id} className="h-12 border-b border-border" />
                    );
                  }

                  return (
                    <div
                      key={task.id}
                      className="h-12 border-b border-border relative flex items-center"
                    >
                      {/* Background grid */}
                      <div className="absolute inset-0 flex">
                        {dates.map((date) => {
                          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                          return (
                            <div
                              key={date.toISOString()}
                              className={cn(
                                'flex-shrink-0 border-r border-border/50',
                                isWeekend && 'bg-secondary/20'
                              )}
                              style={{ width: dayWidth }}
                            />
                          );
                        })}
                      </div>

                      {/* Task Bar */}
                      <div
                        className={cn(
                          'absolute h-6 rounded-md shadow-sm flex items-center px-2 text-xs text-white font-medium truncate animate-fade-in z-10',
                          statusColors[task.status]
                        )}
                        style={{
                          left: position.left,
                          width: position.width - 4,
                          animationDelay: `${index * 50}ms`,
                        }}
                        title={`${task.title} - ${task.due_date ? format(new Date(task.due_date), 'dd/MM', { locale: ptBR }) : ''}`}
                      >
                        {position.width > 80 && task.title}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-warning" />
          <span className="text-muted-foreground">Pendente</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-primary" />
          <span className="text-muted-foreground">Em Andamento</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-success" />
          <span className="text-muted-foreground">Concluída</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-destructive" />
          <span className="text-muted-foreground">Atrasada</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-muted" />
          <span className="text-muted-foreground">N/A</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-4 bg-primary" />
          <span className="text-muted-foreground">Hoje</span>
        </div>
      </div>

      <TaskEditDialog
        task={editingTask}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      {/* Detail Panel via Sheet */}
      <Sheet open={!!selectedTask || !!selectedRoutine} onOpenChange={(open) => {
        if (!open) {
          setSelectedTask(null);
          setSelectedRoutine(null);
        }
      }}>
        <SheetContent className="sm:max-w-xl w-[90vw] p-0" side="right">
          <div className="h-full overflow-y-auto">
            {selectedTask && (
              <TaskDetailPanel
                task={selectedTask}
                onClose={() => setSelectedTask(null)}
              />
            )}
            {selectedRoutine && (
              <RoutineDetailPanel
                routine={selectedRoutine}
                onClose={() => {
                  setSelectedRoutine(null);
                  setSelectedDateContext(null);
                }}
                contextDate={selectedDateContext}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
