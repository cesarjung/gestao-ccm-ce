import { useState } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTasks, useDeleteTasks, useBulkUpdateTasks } from '@/hooks/useTasks';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useRoutines, useDeleteRoutines } from '@/hooks/useRoutines';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSectors } from '@/hooks/useSectors';
import { cn } from '@/lib/utils';
import {
  Loader2,
  Calendar,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  User,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Trash2,
  X
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ViewMode } from '@/types/navigation';
import { KanbanView } from './KanbanView';
import { CalendarView } from './CalendarView';
import { GanttView } from './GanttView';
import { TaskEditDialog } from '@/components/TaskEditDialog';
import { TaskForm } from '@/components/TaskForm';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { TaskRowItem } from '@/components/TaskRowItem';
import { RoutineListItem } from '@/components/RoutineListItem';
import { TaskDetailPanel } from '@/components/TaskDetailPanel';
import { RoutineDetailPanel } from '@/components/RoutineDetailPanel';
import { BulkRoutineCompletionDialog } from '@/components/BulkRoutineCompletionDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type Task = Tables<'tasks'> & {
  unit?: { name: string; code: string } | null;
};

const frequencyLabels: Record<string, string> = {
  diaria: 'Diária',
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  anual: 'Anual',
};

// Config from TasksView for reuse
const statusFilters: {
  value: Enums<'task_status'>;
  label: string;
  chipClass: string;
}[] = [
    { value: 'pendente', label: 'Pendente', chipClass: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
    { value: 'em_andamento', label: 'Em Andamento', chipClass: 'bg-orange-100 text-orange-800 border border-orange-300' },
    { value: 'concluida', label: 'Concluída', chipClass: 'bg-green-100 text-green-800 border border-green-300' },
    { value: 'atrasada', label: 'Atrasada', chipClass: 'bg-red-100 text-red-800 border border-red-300' },
    { value: 'cancelada', label: 'Cancelada', chipClass: 'bg-slate-100 text-slate-700 border border-slate-300' },
  ];

const frequencies: { value: string; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'diaria', label: 'Diárias' },
  { value: 'semanal', label: 'Semanais' },
  { value: 'quinzenal', label: 'Quinzenais' },
  { value: 'mensal', label: 'Mensais' },

];

export const MyTasksView = ({
  hideHeader,
  viewMode = 'list'
}: {
  hideHeader?: boolean;
  viewMode?: ViewMode;
}) => {
  const { user } = useAuth();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: routines, isLoading: routinesLoading } = useRoutines();
  const deleteTasks = useDeleteTasks();
  const bulkUpdateTasks = useBulkUpdateTasks();

  // Fetch active checkins for comment display
  const routineIds = tasks?.map(t => t.routine_id).filter(Boolean) || [];
  const { data: activeCheckins } = useQuery({
    queryKey: ['active-checkins-notes', routineIds.join(',')],
    queryFn: async () => {
      if (routineIds.length === 0) return [];

      const { data } = await supabase
        .from('routine_checkins')
        .select(`
          id,
          unit_id,
          assignee_user_id,
          notes,
          routine_periods!inner(
            is_active,
            routine_id
          )
        `)
        .eq('routine_periods.is_active', true)
        .in('routine_periods.routine_id', routineIds)
        .not('notes', 'is', null);

      return data || [];
    },
    enabled: routineIds.length > 0
  });

  const deleteRoutines = useDeleteRoutines();
  const { data: sectors } = useSectors();
  const { data: role } = useUserRole();
  const isGestorOrAdmin = role === 'admin' || role === 'gestor';

  const [activeTab, setActiveTab] = useState('tasks');
  const [activeCompletionTab, setActiveCompletionTab] = useState('pending'); // 'pending' | 'completed'
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFrequency, setActiveFrequency] = useState<string>('all');
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('active');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedStatuses, setSelectedStatuses] = useState<Enums<'task_status'>[]>(['pendente']);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);

  // UI State
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set(['all']));
  const [selectedRoutine, setSelectedRoutine] = useState<Tables<'routines'> | null>(null);
  const [selectedRoutineDate, setSelectedRoutineDate] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBulkCompleteDialogOpen, setIsBulkCompleteDialogOpen] = useState(false);

  // Selection State
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<string[]>([]);

  const isLoading = tasksLoading || routinesLoading;

  const handleToggleTaskSelect = (id: string) => {
    setSelectedTaskIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleToggleRoutineSelect = (id: string) => {
    setSelectedRoutineIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAllTasks = (filteredTasks: Task[]) => {
    if (!filteredTasks.length) return;
    const allSelected = filteredTasks.every(t => selectedTaskIds.includes(t.id));
    if (allSelected) setSelectedTaskIds([]);
    else setSelectedTaskIds(filteredTasks.map(t => t.id));
  };

  const toggleSelectAllRoutines = (filteredRoutines: any[]) => {
    if (!filteredRoutines.length) return;
    const allSelected = filteredRoutines.every(r => selectedRoutineIds.includes(r.id));
    if (allSelected) setSelectedRoutineIds([]);
    else setSelectedRoutineIds(filteredRoutines.map(r => r.id));
  };
  const myTasks = tasks?.filter(task => {
    if (!user?.id) return false;

    // 1. Assignment Check
    let isAssigned = false;
    if (task.assigned_to === user.id) isAssigned = true;
    else if (task.assignees && Array.isArray(task.assignees)) {
      isAssigned = task.assignees.some((a: any) => a.id === user.id);
    }
    if (!isAssigned) return false;

    // 2. Search Filter
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // 3. Status Filter (Global - can override completion tab? No, keep separate)
    // Actually, distinct valid statuses depend on the tab.
    // PENDING TAB: status != concluded
    // COMPLETED TAB: status == concluded
    const isCompleted = task.status === 'concluida';
    if (activeCompletionTab === 'pending' && isCompleted) return false;
    if (activeCompletionTab === 'completed' && !isCompleted) return false;

    // Existing Status Filter (Checkbox Chips)
    // If we are in 'completed' tab, selectedStatuses might only have 'concluida' relevant.
    // If we are in 'pending', users might filter by 'atrasada' etc.
    // We retain this logic but it effectively intersects.
    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(task.status);
    if (!matchesStatus) return false;

    // 4. Frequency Filter
    const routineFrequency = task.routine?.frequency;
    const matchesFrequency = activeFrequency === 'all' || routineFrequency === activeFrequency;
    if (!matchesFrequency) return false;

    // 5. Active Status Filter
    const matchesActiveStatus = activeStatusFilter === 'all'
      ? true
      : activeStatusFilter === 'active'
        ? (task.routine?.is_active !== false)
        : (task.routine?.is_active === false);
    if (!matchesActiveStatus) return false;


    // 5. Priority Filter
    const matchesPriority = priorityFilter === 'all' || task.priority.toString() === priorityFilter;
    if (!matchesPriority) return false;

    return true;
  }) || [];

  // Filter routines created by current user
  const myRoutines = routines?.filter(r => {
    if (r.created_by !== user?.id) return false;

    const matchesSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const matchesFrequency = activeFrequency === 'all' || r.frequency === activeFrequency;
    if (!matchesFrequency) return false;

    // Active Status Filter
    const matchesActiveStatus = activeStatusFilter === 'all'
      ? true
      : activeStatusFilter === 'active'
        ? (r.is_active !== false)
        : (r.is_active === false);
    if (!matchesActiveStatus) return false;

    // Completion Tab Logic for Routines
    // "Pending" -> Active Routines
    // "Completed" -> Inactive Routines
    if (activeCompletionTab === 'pending' && r.is_active === false) return false;
    if (activeCompletionTab === 'completed' && r.is_active !== false) return false;

    // Status Filter (Checkbox Chips)
    const activeStatuses = (r as any).active_statuses || [(r as any).status];
    const matchesStatus = selectedStatuses.length === 0 || activeStatuses.some((s: string) => selectedStatuses.includes(s as Enums<'task_status'>));
    if (!matchesStatus) return false;

    // Priority Filter (Users request consistency, though Routines might not have priority visibly)
    const matchesPriority = priorityFilter === 'all' || (r as any).priority?.toString() === priorityFilter;
    if (!matchesPriority) return false;

    return true;
  }) || [];

  // Group tasks by sector
  const tasksBySector = myTasks.reduce((acc, task) => {
    const sectorId = (task as any).sector_id || 'no-sector';
    if (!acc[sectorId]) acc[sectorId] = [];
    acc[sectorId].push(task);
    return acc;
  }, {} as Record<string, typeof myTasks>);

  // Group routines by sector
  const routinesBySector = myRoutines.reduce((acc, routine) => {
    const sectorId = (routine as any).sector_id || 'no-sector';
    if (!acc[sectorId]) acc[sectorId] = [];
    acc[sectorId].push(routine);
    return acc;
  }, {} as Record<string, typeof myRoutines>);

  const toggleSector = (sectorId: string) => {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      if (next.has(sectorId)) {
        next.delete(sectorId);
      } else {
        next.add(sectorId);
      }
      return next;
    });
  };

  const getSectorName = (sectorId: string) => {
    if (sectorId === 'no-sector') return 'Sem Setor';
    return sectors?.find(s => s.id === sectorId)?.name || 'Setor Desconhecido';
  };

  const getSectorColor = (sectorId: string) => {
    if (sectorId === 'no-sector') return '#6b7280';
    return sectors?.find(s => s.id === sectorId)?.color || '#6366f1';
  };

  const allSectorIds = [...new Set([...Object.keys(tasksBySector), ...Object.keys(routinesBySector)])];

  // Render different views based on viewMode
  const renderTasksContent = () => {
    if (viewMode === 'kanban') return <KanbanView isMyTasks hideHeader />;
    if (viewMode === 'calendar') return <CalendarView isMyTasks />;
    if (viewMode === 'gantt') return <GanttView isMyTasks hideHeader />;

    // Default list view
    if (myTasks.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma tarefa encontrada</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {allSectorIds.filter(id => tasksBySector[id]?.length > 0).map((sectorId) => {
          const sectorTasks = tasksBySector[sectorId] || [];
          const isExpanded = expandedSectors.has('all') || expandedSectors.has(sectorId);
          const pendingCount = sectorTasks.filter(t => t.status === 'pendente' || t.status === 'em_andamento').length;

          return (
            <div key={sectorId} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => toggleSector(sectorId)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <div
                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: getSectorColor(sectorId) }}
                >
                  {getSectorName(sectorId).charAt(0)}
                </div>
                <span className="font-medium flex-1 text-left">{getSectorName(sectorId)}</span>
                <Badge variant="secondary">{sectorTasks.length}</Badge>
                {pendingCount > 0 && (
                  <Badge variant="outline" className="border-warning text-warning">
                    {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
                  </Badge>
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-border divide-y divide-border">
                  {sectorTasks.map((task) => (
                    <TaskRowItem
                      key={task.id}
                      task={task}
                      isSelected={selectedTask?.id === task.id || selectedTaskIds.includes(task.id)}
                      onToggleSelect={handleToggleTaskSelect}
                      onClick={() => {
                        if (task.routine_id && task.routine) {
                          setSelectedRoutine(task.routine);
                          setSelectedRoutineDate((task as any).due_date);
                          setSelectedTask(null);
                        } else {
                          setSelectedTask(task as Task);
                          setSelectedRoutine(null);
                          setSelectedRoutineDate(null);
                        }
                      }}
                      onStatusChange={async (id, status) => {
                        console.log("Status change requested", id, status);
                      }}
                      comment={
                        activeCheckins?.find(c =>
                          (c.routine_periods as any)?.routine_id === task.routine_id &&
                          (c.assignee_user_id === user?.id || (c.unit_id === task.unit_id && !c.assignee_user_id))
                        )?.notes
                      }
                      disableStrikethrough={true}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderRoutinesContent = () => {
    if (myRoutines.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma rotina atribuída a você</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {allSectorIds.filter(id => routinesBySector[id]?.length > 0).map((sectorId) => {
          const sectorRoutines = routinesBySector[sectorId] || [];
          const isExpanded = expandedSectors.has(sectorId);

          return (
            <div key={sectorId} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => toggleSector(sectorId)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <div
                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: getSectorColor(sectorId) }}
                >
                  {getSectorName(sectorId).charAt(0)}
                </div>
                <span className="font-medium flex-1 text-left">{getSectorName(sectorId)}</span>
                <Badge variant="secondary">{sectorRoutines.length}</Badge>
              </button>

              {isExpanded && (
                <div className="border-t border-border divide-y divide-border">
                  {sectorRoutines.map((routine) => (
                    <RoutineListItem
                      key={routine.id}
                      routine={routine}
                      isSelected={selectedRoutine?.id === routine.id}
                      isMultiSelected={selectedRoutineIds.includes(routine.id)}
                      onToggleSelect={handleToggleRoutineSelect}
                      onClick={() => {
                        setSelectedRoutine(routine);

                        const periods = (routine as any).routine_periods;
                        const todayStr = format(new Date(), 'yyyy-MM-dd');

                        let activePeriod = periods?.find((p: any) => (p.period_start || '').startsWith(todayStr));
                        if (!activePeriod) {
                          activePeriod = periods?.find((p: any) => p.is_active);
                        }
                        if (!activePeriod) {
                          activePeriod = periods?.sort((a: any, b: any) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime())[0];
                        }

                        setSelectedRoutineDate(activePeriod ? activePeriod.period_start : null);
                        setSelectedTask(null);
                      }}
                      onEdit={() => { }}
                      canEdit={false}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }



  const isDetailOpen = !!selectedTask || !!selectedRoutine;

  return (
    <div className="flex h-full">
      <div className="w-full flex flex-col transition-all duration-300">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col overflow-hidden">

          {/* Header Container V3 - Single Line Forced */}
          {!hideHeader && ((activeTab === 'tasks' && selectedTaskIds.length > 0) || (activeTab === 'routines' && selectedRoutineIds.length > 0)) ? (
            <div className="flex items-center gap-2 p-2 bg-primary/5 border-b border-primary/20 shadow-sm overflow-x-auto shrink-0 min-h-[50px] mb-4 rounded-lg animate-in fade-in slide-in-from-top-1">
              <span className="text-sm font-medium text-primary ml-2 whitespace-nowrap">
                {activeTab === 'tasks' ? selectedTaskIds.length : selectedRoutineIds.length} selecionado(s)
              </span>

              <div className="h-5 w-px bg-primary/20 shrink-0 mx-2" />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => activeTab === 'tasks' ? toggleSelectAllTasks(myTasks) : toggleSelectAllRoutines(myRoutines)}
                className="h-8 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
              >
                Selecionar Tudo
              </Button>

              <div className="flex items-center gap-1 ml-auto">
                <Button
                  variant="secondary"
                  size="sm"
                  className={cn(
                    "h-8 text-xs gap-1.5 bg-green-100 text-green-700 hover:bg-green-200 border border-green-200",
                    ((activeTab === 'routines' && !isGestorOrAdmin) || activeCompletionTab === 'completed') && "hidden"
                  )}
                  onClick={async () => {
                    try {
                      if (activeTab === 'tasks') {
                        // Permission Check for Tasks
                        if (!isGestorOrAdmin) {
                          const tasksToComplete = tasks?.filter(t => selectedTaskIds.includes(t.id));
                          const forbiddenTask = tasksToComplete?.find(t => {
                            const isAssigned = t.assigned_to === user?.id || t.assignees?.some((a: any) => a.id === user?.id);
                            return !isAssigned;
                          });

                          if (forbiddenTask) {
                            toast.error("Você só pode concluir tarefas nas quais é responsável.");
                            return;
                          }
                        }

                        await bulkUpdateTasks.mutateAsync({ taskIds: selectedTaskIds, status: 'concluida' });
                        setSelectedTaskIds([]);
                      } else if (activeTab === 'routines' && isGestorOrAdmin) {
                        // Find Parent Tasks for selected routines
                        const { data: parentTasks } = await supabase
                          .from('tasks')
                          .select('id')
                          .in('routine_id', selectedRoutineIds)
                          .is('parent_task_id', null);

                        if (parentTasks && parentTasks.length > 0) {
                          await bulkUpdateTasks.mutateAsync({
                            taskIds: parentTasks.map(t => t.id),
                            status: 'concluida'
                          });
                        }
                        setSelectedRoutineIds([]);
                      }
                    } catch (e) {
                      console.error("Bulk action failed", e);
                    }
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Concluir
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                  onClick={async () => {
                    try {
                      if (activeTab === 'tasks') {
                        await deleteTasks.mutateAsync(selectedTaskIds);
                        setSelectedTaskIds([]);
                      } else {
                        await deleteRoutines.mutateAsync(selectedRoutineIds);
                        setSelectedRoutineIds([]);
                      }
                    } catch (e) {
                      console.error("Bulk delete failed", e);
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSelectedTaskIds([]);
                    setSelectedRoutineIds([]);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : !hideHeader && (
            <div className="flex flex-col gap-2 p-2 bg-card border-b border-border shadow-sm mb-4 rounded-lg">

              {/* ROW 1: Tabs + Search + Frequency + New */}
              <div className="flex items-center gap-2 w-full overflow-x-auto custom-scrollbar pb-2">
                {/* Tabs */}
                <TabsList className="justify-start h-8 bg-secondary/50 p-0.5 shrink-0">
                  <TabsTrigger value="tasks" className="gap-1.5 h-7 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Tarefas ({myTasks.length})
                  </TabsTrigger>
                  <TabsTrigger value="routines" className="gap-1.5 h-7 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <Calendar className="w-3.5 h-3.5" />
                    Rotinas ({myRoutines.length})
                  </TabsTrigger>
                </TabsList>

                <div className="h-5 w-px bg-border shrink-0 mx-0.5" />

                {/* Search (Condensed) */}
                <div className="relative w-[180px] shrink-0">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 bg-background h-8 text-xs w-full"
                  />
                </div>

                {/* Frequency Filters - Right next to search */}
                <div className="flex items-center gap-0.5 bg-secondary/30 p-0.5 rounded-lg border border-border shrink-0">
                  {frequencies.map((freq) => (
                    <button
                      key={freq.value}
                      onClick={() => setActiveFrequency(freq.value)}
                      className={cn(
                        'h-7 px-2.5 rounded-md text-xs font-medium transition-all outline-none whitespace-nowrap',
                        activeFrequency === freq.value
                          ? 'bg-black text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-black/5'
                      )}
                    >
                      {freq.label}
                    </button>
                  ))}
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Completion Toggle */}
                <Tabs value={activeCompletionTab} onValueChange={(v) => setActiveCompletionTab(v as any)} className="h-8 bg-secondary/30 p-0.5 rounded-lg border border-border shrink-0">
                  <TabsList className="h-full bg-transparent p-0 gap-0.5">
                    <TabsTrigger value="pending" className="h-full text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      Pendentes
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="h-full text-xs px-3 data-[state=active]:bg-green-100 data-[state=active]:text-green-800 data-[state=active]:shadow-sm">
                      Concluídas
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* New Task Button */}
                <div className="shrink-0">
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="h-8 gap-1.5 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs px-3 whitespace-nowrap">
                        <Plus className="h-3.5 w-3.5" />
                        Nova
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Criar Nova Tarefa</DialogTitle>
                      </DialogHeader>
                      <TaskForm
                        onSuccess={() => setIsCreateDialogOpen(false)}
                        onCancel={() => setIsCreateDialogOpen(false)}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* ROW 2: Status + Priority + Active Filter */}
              <div className="flex items-center gap-2 w-full overflow-x-auto custom-scrollbar pb-2">

                {/* Status Chips */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedStatuses(selectedStatuses.length > 0 ? [] : statusFilters.map(f => f.value))}
                    className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground whitespace-nowrap"
                  >
                    {selectedStatuses.length === statusFilters.length ? "Limpar" : "Todos"}
                  </Button>
                  {statusFilters.map((filter) => {
                    const isActive = selectedStatuses.includes(filter.value);
                    return (
                      <button
                        key={filter.value}
                        onClick={() => setSelectedStatuses(prev => prev.includes(filter.value) ? prev.filter(v => v !== filter.value) : [...prev, filter.value])}
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all whitespace-nowrap',
                          isActive ? filter.chipClass : 'bg-muted/50 text-muted-foreground hover:bg-muted border-transparent'
                        )}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>

                {/* Spacer */}
                <div className="flex-1 min-w-2" />

                {/* Active Status Filter */}
                <Select value={activeStatusFilter} onValueChange={setActiveStatusFilter}>
                  <SelectTrigger className="w-[100px] h-8 text-xs text-muted-foreground bg-background px-2 shrink-0">
                    <SelectValue placeholder="Situação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>

                {/* Priority */}
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[110px] h-8 text-xs text-muted-foreground bg-background px-2 shrink-0">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="4">Alta</SelectItem>
                    <SelectItem value="3">Média</SelectItem>
                    <SelectItem value="1">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </div>
          )}

          <TabsContent value="tasks" className="flex-1 overflow-auto p-6 mt-0">
            {renderTasksContent()}
          </TabsContent>

          <TabsContent value="routines" className="flex-1 overflow-auto p-6 mt-0">
            {renderRoutinesContent()}
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={isDetailOpen} onOpenChange={(open) => {
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
                key={selectedTask.id + '-' + selectedTask.updated_at}
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
                  setSelectedTask(null);
                }}
                onSelectTask={(task) => {
                  setSelectedRoutine(null);
                  setSelectedRoutineDate(null);
                  setSelectedTask(task);
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>


      {/* Task Edit Dialog (Kept just in case, but primary interaction is Detail Panel) */}
      <TaskEditDialog
        task={selectedTask}
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) setSelectedTask(null);
        }}
      />

      <BulkRoutineCompletionDialog
        open={isBulkCompleteDialogOpen}
        onOpenChange={setIsBulkCompleteDialogOpen}
        selectedRoutineIds={selectedRoutineIds}
        onSuccess={() => setSelectedRoutineIds([])}
      />
    </div >
  );
};
