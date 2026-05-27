import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  Building2,
  RefreshCw,
  CheckCircle2,
  Circle,
  Trash2,
  MoreVertical,
  Users,
  Clock,
  MinusCircle,
  Check,
  X,
  Flag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ProgressBar } from '@/components/ProgressBar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import type { TaskWithDetails } from '@/hooks/useTasks';
import { useChildTasks } from '@/hooks/useTasks';
import { useToggleSubtask, useDeleteTask, useUpdateTask } from '@/hooks/useTaskMutations';
import type { Enums } from '@/integrations/supabase/types';

const statusConfig: Record<
  Enums<'task_status'>,
  { label: string; className: string }
> = {
  pendente: { label: 'Pendente', className: 'bg-warning/20 text-warning border-warning/30' },
  em_andamento: {
    label: 'Em Andamento',
    className: 'bg-primary/20 text-primary border-primary/30',
  },
  concluida: { label: 'Concluída', className: 'bg-success/20 text-success border-success/30' },
  atrasada: {
    label: 'Atrasada',
    className: 'bg-destructive/20 text-destructive border-destructive/30',
  },
  cancelada: { label: 'Cancelada', className: 'bg-muted text-muted-foreground border-muted' },
  nao_aplicavel: {
    label: 'N/A',
    className: 'bg-secondary text-muted-foreground border-secondary',
  },
};

const priorityConfig: Record<number, { label: string; iconClass: string }> = {
  1: { label: 'Baixa', iconClass: 'text-slate-300' },
  2: { label: 'Normal', iconClass: 'text-slate-400' },
  3: { label: 'Média', iconClass: 'text-yellow-500 fill-yellow-500' },
  4: { label: 'Alta', iconClass: 'text-orange-500 fill-orange-500' },
  5: { label: 'Urgente', iconClass: 'text-red-500 fill-red-500' },
};

interface TaskListItemProps {
  task: TaskWithDetails;
  isSelected?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onStatusChange?: (taskId: string, newStatus: Enums<'task_status'>) => void;
}

export const TaskListItem = ({
  task,
  isSelected = false,
  onToggleSelect,
  onStatusChange,
}: TaskListItemProps) => {
  const [expanded, setExpanded] = useState(false);
  const [childTasksExpanded, setChildTasksExpanded] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const toggleSubtask = useToggleSubtask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();

  // Tarefas filhas (por unidade)
  const isParentTask = !task.parent_task_id;
  const { data: childTasks } = useChildTasks(isParentTask ? task.id : null);

  const completedSubtasks = task.subtasks?.filter((s) => s.is_completed).length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  // Resumo de tarefas filhas
  const completedChildTasks = childTasks?.filter((t) => t.status === 'concluida').length || 0;
  const naChildTasks = childTasks?.filter((t) => t.status === 'nao_aplicavel').length || 0;
  const totalChildTasks = childTasks?.length || 0;
  const doneChildTasks = completedChildTasks + naChildTasks;
  const hasChildTasks = totalChildTasks > 0;

  const handleToggleSubtask = (subtaskId: string, currentState: boolean | null) => {
    toggleSubtask.mutate({ subtaskId, isCompleted: !currentState });
  };

  const handleStatusChange = (newStatus: Enums<'task_status'>) => {
    updateTask.mutate({
      id: task.id,
      status: newStatus,
      completed_at: newStatus === 'concluida' ? new Date().toISOString() : null,
    });

    // avisa a view para poder ajustar filtros (não sumir da lista)
    onStatusChange?.(task.id, newStatus);
  };

  const handleChildTaskStatusChange = (childTaskId: string, newStatus: Enums<'task_status'>) => {
    updateTask.mutate({
      id: childTaskId,
      status: newStatus,
      completed_at: newStatus === 'concluida' ? new Date().toISOString() : null,
    });

    // se a view quiser reagir também às tarefas filhas, avisamos aqui
    onStatusChange?.(childTaskId, newStatus);
  };

  const handleDelete = () => {
    deleteTask.mutate(task.id);
    setDeleteDialogOpen(false);
  };

  const priority = task.priority || 1;
  const statusInfo = statusConfig[task.status];
  const priorityInfo = priorityConfig[priority];

  return (
    <>
      <div className="border-b border-border bg-card px-4 py-2.5 transition-colors hover:bg-muted/50 last:border-b-0">
        <div className="flex items-center gap-3 w-full">
          {/* Status Toggle & Priority */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() =>
                handleStatusChange(task.status === 'concluida' ? 'pendente' : 'concluida')
              }
              className="flex-shrink-0"
            >
              {task.status === 'concluida' ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
              )}
            </button>
            <Flag 
              className={cn("h-3.5 w-3.5", priorityInfo.iconClass)} 
              title={`Prioridade: ${priorityInfo.label}`}
            />
          </div>

          {/* Main Content & Meta */}
          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            
            {/* Title & Description */}
            <div className="flex-1 min-w-0">
              <h3
                className={cn(
                  'font-medium text-sm text-foreground truncate',
                  task.status === 'concluida' && 'line-through text-muted-foreground'
                )}
              >
                {task.title}
              </h3>
              {task.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[500px]">
                  {task.description}
                </p>
              )}
            </div>

            {/* Meta Info & Actions Right Side */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap justify-end">
              {task.unit && (
                <Badge variant="secondary" className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-[10px] px-1.5 py-0 border-none">
                  <Building2 className="h-3 w-3 mr-1" />
                  {task.unit.name}
                </Badge>
              )}
              {task.due_date && (
                <Badge variant="secondary" className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0 border-none">
                  <Calendar className="h-3 w-3 mr-1" />
                  {format(new Date(task.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                </Badge>
              )}
              {task.routine && (
                <Badge variant="secondary" className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-[10px] px-1.5 py-0 border-none max-w-[120px] truncate">
                  <RefreshCw className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate">{task.routine.title}</span>
                </Badge>
              )}
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 font-medium tracking-tight', statusInfo.className)}>
                {statusInfo.label}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleStatusChange('pendente')}>
                    Marcar como Pendente
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleStatusChange('em_andamento')}>
                    Marcar como Em Andamento
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleStatusChange('concluida')}>
                    Marcar como Concluída
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleteDialogOpen(true)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Child Tasks & Subtasks row below if existing */}
        <div className="pl-6 w-full">

            {/* RESUMO TAREFAS FILHAS */}
            {hasChildTasks && (
              <div className="mt-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {totalChildTasks} unidade{totalChildTasks !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="w-3 h-3" />
                    {completedChildTasks} concluída{completedChildTasks !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1 text-destructive">
                    <MinusCircle className="w-3 h-3" />
                    {naChildTasks} N/A
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {doneChildTasks}/{totalChildTasks} concluídas ou N/A
                  </span>
                </div>

                <ProgressBar
                  value={totalChildTasks ? (doneChildTasks / totalChildTasks) * 100 : 0}
                  className="h-1.5"
                />
              </div>
            )}

            {/* SUBTAREFAS */}
            {totalSubtasks > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {expanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {completedSubtasks}/{totalSubtasks} subtarefas concluídas
                </button>

                {expanded && (
                  <div className="mt-2 space-y-2">
                    {task.subtasks?.map((subtask) => (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2"
                      >
                        <Checkbox
                          checked={!!subtask.is_completed}
                          onCheckedChange={() =>
                            handleToggleSubtask(subtask.id, subtask.is_completed)
                          }
                        />
                        <div className="flex-1 text-sm">
                          <p
                            className={cn(
                              'font-medium',
                              subtask.is_completed && 'line-through text-muted-foreground',
                            )}
                          >
                            {subtask.title}
                          </p>
                          {subtask.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {subtask.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Subtasks Toggle */}
            {totalSubtasks > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 mt-2 text-sm text-primary hover:underline"
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <span>
                  {completedSubtasks}/{totalSubtasks} subtarefas concluídas
                </span>
              </button>
            )}

                {childTasksExpanded && (
                  <div className="mt-2 space-y-2">
                    {childTasks?.map((childTask) => {
                      const isCompleted = childTask.status === 'concluida';
                      const isNA = childTask.status === 'nao_aplicavel';

                      return (
                        <div
                          key={childTask.id}
                          className="flex items-start gap-3 rounded-lg bg-muted/60 px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            {/* checkbox verde: concluída */}
                            <button
                              onClick={() =>
                                handleChildTaskStatusChange(
                                  childTask.id,
                                  isCompleted ? 'pendente' : 'concluida',
                                )
                              }
                              className={cn(
                                'w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0',
                                isCompleted
                                  ? 'bg-success border-success text-white'
                                  : 'border-success/50 hover:border-success hover:bg-success/10',
                              )}
                              title="Concluída"
                            >
                              {isCompleted && <Check className="h-3 w-3" />}
                            </button>

                            {/* checkbox vermelho: N/A */}
                            <button
                              onClick={() =>
                                handleChildTaskStatusChange(
                                  childTask.id,
                                  isNA ? 'pendente' : 'nao_aplicavel',
                                )
                              }
                              className={cn(
                                'w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0',
                                isNA
                                  ? 'bg-destructive border-destructive text-white'
                                  : 'border-destructive/50 hover:border-destructive hover:bg-destructive/10',
                              )}
                              title="Não se Aplica"
                            >
                              {isNA && <X className="h-3 w-3" />}
                            </button>

                            <div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                                {childTask.unit && (
                                  <span className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    {childTask.unit.name}
                                  </span>
                                )}
                                {childTask.due_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {format(new Date(childTask.due_date), 'dd/MM/yyyy', {
                                      locale: ptBR,
                                    })}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-medium">{childTask.title}</p>
                              {childTask.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {childTask.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
          <AlertDialogDescription>
              Esta ação não pode ser desfeita. A tarefa e suas{' '}
              {hasChildTasks ? 'tarefas filhas' : 'subtarefas'} serão excluídas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
