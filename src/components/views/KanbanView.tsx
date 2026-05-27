import { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useUpdateTask } from '@/hooks/useTaskMutations';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, AlertCircle, Play, Loader2, Plus, Check, MinusCircle, Circle, MoreVertical } from 'lucide-react';
import type { Enums, Tables } from '@/integrations/supabase/types';
import { TaskEditDialog } from '@/components/TaskEditDialog';
import { Button } from '@/components/ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter } from 'lucide-react';

type Task = Tables<'tasks'> & {
  unit?: { name: string; code: string } | null;
};

type TaskStatus = Enums<'task_status'>;

interface Column {
  id: TaskStatus;
  title: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const columns: Column[] = [
  { id: 'pendente', title: 'Pendentes', icon: Clock, color: 'text-warning', bgColor: 'bg-warning/10' },
  { id: 'em_andamento', title: 'Em Andamento', icon: Play, color: 'text-primary', bgColor: 'bg-primary/10' },
  { id: 'concluida', title: 'Concluídas', icon: CheckCircle2, color: 'text-success', bgColor: 'bg-success/10' },
  { id: 'atrasada', title: 'Atrasadas', icon: AlertCircle, color: 'text-destructive', bgColor: 'bg-destructive/10' },
  { id: 'nao_aplicavel', title: 'Não Aplicável', icon: MinusCircle, color: 'text-muted-foreground', bgColor: 'bg-secondary' },
];

interface KanbanViewProps {
  sectorId?: string;
  isMyTasks?: boolean;
  type?: 'tasks' | 'routines';
  hideHeader?: boolean;
}

export const KanbanView = ({ sectorId, isMyTasks, type = 'tasks', hideHeader = false }: KanbanViewProps) => {
  const { data: tasks, isLoading } = useTasks();
  const { user } = useAuth();
  const updateTask = useUpdateTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedRoutine, setSelectedRoutine] = useState<Tables<'routines'> | null>(null);
  const [selectedRoutineDate, setSelectedRoutineDate] = useState<string | null>(null);

  const handleTaskClick = (task: Task) => {
    if (task.routine_id && (task as any).routine) {
      setSelectedRoutine((task as any).routine);
      setSelectedRoutineDate(task.due_date);
      setSelectedTask(null);
    } else {
      setSelectedTask(task);
      setSelectedRoutine(null);
      setSelectedRoutineDate(null);
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setEditDialogOpen(true);
  };

  const handleStatusChange = (taskId: string, newStatus: TaskStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    updateTask.mutate({
      id: taskId,
      status: newStatus,
      completed_at: newStatus === 'concluida' ? new Date().toISOString() : null,
    });
  };

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks?.filter(t => {
      const matchesSector = !sectorId || (t as any).sector_id === sectorId || t.routine?.sector_id === sectorId || t.unit?.sector_id === sectorId;
      const matchesUser = !isMyTasks || t.assigned_to === user?.id;
      const matchesType = typeFilter === 'all' 
        || (typeFilter === 'tasks_only' && !t.routine_id) 
        || (typeFilter === 'routines_only' && !!t.routine_id);
      return t.status === status && matchesSector && matchesUser && matchesType;
    }) || [];
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Kanban</h1>
          <p className="text-muted-foreground">Visualize tarefas por status</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Kanban</h1>
          <p className="text-muted-foreground">Visualize e gerencie tarefas por status</p>
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Rotinas e Tarefas</SelectItem>
              <SelectItem value="tasks_only">Apenas Tarefas</SelectItem>
              <SelectItem value="routines_only">Apenas Rotinas</SelectItem>
            </SelectContent>
          </Select>
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
      )}

      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px] items-start">
        {columns.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          const Icon = column.icon;

          return (
            <div
              key={column.id}
              className="min-w-[300px] w-[300px] rounded-xl border border-border bg-card/50 flex flex-col flex-shrink-0"
            >
              {/* Column Header */}
              <div className={cn('p-4 rounded-t-xl border-b border-border', column.bgColor)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('w-5 h-5', column.color)} />
                    <h3 className="font-semibold text-foreground">{column.title}</h3>
                  </div>
                  <span className={cn('text-sm font-bold px-2 py-0.5 rounded-full', column.bgColor, column.color)}>
                    {columnTasks.length}
                  </span>
                </div>
              </div>

              {/* Column Tasks */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[500px]">
                {columnTasks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhuma tarefa
                  </div>
                ) : (
                  columnTasks.map((task, index) => {
                    const isCompleted = task.status === 'concluida';
                    const isNA = task.status === 'nao_aplicavel';

                    return (
                      <div
                        key={task.id}
                        className="bg-card rounded-md border border-border p-2 shadow-sm hover:border-primary/40 transition-shadow cursor-pointer group animate-fade-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => handleTaskClick(task as Task)}
                      >
                        <div className="flex items-start gap-2">
                          {/* Quick completion checkbox */}
                          <button
                            onClick={(e) => handleStatusChange(task.id, isCompleted ? 'pendente' : 'concluida', e)}
                            className={cn(
                              'w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 mt-0.5',
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

                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-xs font-medium text-foreground line-clamp-2",
                              isCompleted && "line-through text-muted-foreground"
                            )}>
                              {task.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              {task.unit && (
                                <span className="px-1.5 py-0 rounded bg-blue-500/10 text-blue-600 text-[10px] font-medium truncate max-w-[120px]">
                                  {task.unit.name}
                                </span>
                              )}
                              {task.due_date && (
                                <span className="px-1.5 py-0 rounded bg-slate-500/10 text-slate-600 text-[10px] font-medium flex items-center gap-1">
                                  📅 {new Date(task.due_date).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* More options dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'concluida', e as any); }}>
                                <Check className="h-4 w-4 mr-2 text-success" />
                                Concluída
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'pendente', e as any); }}>
                                <Circle className="h-4 w-4 mr-2 text-warning" />
                                Pendente
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'em_andamento', e as any); }}>
                                <Play className="h-4 w-4 mr-2 text-primary" />
                                Em Andamento
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'nao_aplicavel', e as any); }}>
                                <MinusCircle className="h-4 w-4 mr-2 text-muted-foreground" />
                                Não se Aplica
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
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
          setSelectedRoutineDate(null);
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
                contextDate={selectedRoutineDate || undefined}
                onClose={() => {
                  setSelectedRoutine(null);
                  setSelectedRoutineDate(null);
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
