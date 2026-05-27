import { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Loader2,
  Calendar,
  ClipboardList,
  CheckCircle2,
  Trash2,
  X
} from 'lucide-react';
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
import { useTasks, useDeleteTasks, useBulkUpdateTasks } from '@/hooks/useTasks';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { TaskForm } from '@/components/TaskForm';
import { cn } from '@/lib/utils';
import type { Enums } from '@/integrations/supabase/types';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import { KanbanView } from './KanbanView';
import { GanttView } from './GanttView';
import { CalendarView } from './CalendarView';
import { TaskRowItem } from '@/components/TaskRowItem';
import { TaskDetailPanel } from '@/components/TaskDetailPanel';
import { RoutineDetailPanel } from '@/components/RoutineDetailPanel';

// --- CONFIGURATION ARRAYS ---

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

// Local Frequency constant
const frequencies = [
  { value: 'all', label: 'Todas' },
  { value: 'diaria', label: 'Diárias' },
  { value: 'semanal', label: 'Semanais' },
  { value: 'quinzenal', label: 'Quinzenais' },
  { value: 'mensal', label: 'Mensais' },
];

const typeFilters = [
  { value: 'all', label: 'Rotinas e Tarefas' },
  { value: 'tasks_only', label: 'Apenas Tarefas' },
  { value: 'routines_only', label: 'Apenas Rotinas' },
];

interface TasksViewProps {
  sectorId?: string;
  sectionId?: string; // New prop
  isDefaultTasksSection?: boolean;
  hideHeader?: boolean;
  viewMode?: ViewMode;
}

export const TasksView = ({
  sectorId,
  sectionId,
  isDefaultTasksSection,
  hideHeader,
  viewMode = 'list'
}: TasksViewProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [hideCompleted, setHideCompleted] = useState(false);

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [selectedRoutine, setSelectedRoutine] = useState<any | null>(null);

  const { data: tasks, isLoading } = useTasks();
  const deleteTasks = useDeleteTasks();
  const bulkUpdateTasks = useBulkUpdateTasks();


  const handleDelete = (id: string) => {
    // console.log('Delete', id);
  };

  const handleStatusChange = (id: string, status: any) => {
    // console.log('Status', id, status);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedTaskIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const filteredTasks = tasks?.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesSector = !sectorId || task.sector_id === sectorId;

    // Filter by Section ID
    const matchesSection = !sectionId || isDefaultTasksSection
      ? (!sectionId || (task as any).section_id === null || (task as any).section_id === 'tasks' || (task as any).section_id === sectorId || (task as any).section_id === sectionId)
      : (task as any).section_id === sectionId;
    
    const matchesType = typeFilter === 'all' 
      || (typeFilter === 'tasks_only' && !task.routine_id) 
      || (typeFilter === 'routines_only' && !!task.routine_id);

    const matchesHideCompleted = hideCompleted ? task.status !== 'concluida' : true;

    return matchesSearch && matchesStatus && matchesSector && matchesSection && matchesType && matchesHideCompleted;
  });

  const allFilteredSelected = filteredTasks && filteredTasks.length > 0
    ? filteredTasks.every((task) => selectedTaskIds.includes(task.id)) : false;

  const toggleSelectAll = () => {
    if (!filteredTasks?.length) return;
    if (allFilteredSelected) setSelectedTaskIds([]);
    else setSelectedTaskIds(filteredTasks.map(t => t.id));
  };

  return (
    <>
      <div className="flex h-full">
        <div className="w-full flex flex-col transition-all duration-300">

        {/* Filters or Bulk Actions */}
        {!hideHeader && selectedTaskIds.length > 0 ? (
            <div className="flex items-center gap-2 p-2 bg-primary/5 border-b border-primary/20 shadow-sm overflow-x-auto shrink-0 min-h-[50px] mb-4 rounded-lg animate-in fade-in slide-in-from-top-1">
              <span className="text-sm font-medium text-primary ml-2 whitespace-nowrap">
                {selectedTaskIds.length} selecionado{selectedTaskIds.length !== 1 ? 's' : ''}
              </span>

              <div className="h-5 w-px bg-primary/20 shrink-0 mx-2" />

              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSelectAll}
                className="h-8 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
              >
                {allFilteredSelected ? "Deselecionar Tudo" : "Selecionar Tudo"}
              </Button>

              <div className="flex items-center gap-1 ml-auto">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-green-100 text-green-700 hover:bg-green-200 border border-green-200"
                  onClick={async () => {
                    try {
                      await bulkUpdateTasks.mutateAsync({ taskIds: selectedTaskIds, status: 'concluida' });
                      setSelectedTaskIds([]);
                    } catch (e) {
                      console.error("Bulk complete failed", e);
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
                      await deleteTasks.mutateAsync(selectedTaskIds);
                      setSelectedTaskIds([]);
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
                  onClick={() => setSelectedTaskIds([])}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tarefas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeFilters.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusFilters.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center space-x-2 border rounded-md px-3 border-input bg-background">
                <Switch
                  id="hide-completed"
                  checked={hideCompleted}
                  onCheckedChange={setHideCompleted}
                />
                <Label htmlFor="hide-completed" className="text-sm cursor-pointer whitespace-nowrap">
                  Ocultar Concluídas
                </Label>
              </div>
            </div>
          </div>
        )}

        </div>

        {/* Content Area */}
        <div className="flex-1 mt-4 overflow-hidden flex flex-col">
          {viewMode === 'kanban' ? (
            <KanbanView sectorId={sectorId} type="tasks" hideHeader />
          ) : viewMode === 'gantt' ? (
            <GanttView sectorId={sectorId} type="tasks" />
          ) : viewMode === 'calendar' ? (
            <CalendarView sectorId={sectorId} type="tasks" />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredTasks && filteredTasks.length > 0 ? (
          <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-card">
            {filteredTasks?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Nenhuma tarefa encontrada.
              </div>
            ) : (
              filteredTasks?.map((task) => (
                <TaskRowItem
                  key={task.id}
                  task={task as any}
                  isSelected={selectedTaskIds.includes(task.id)}
                  onToggleSelect={handleToggleSelect}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  onClick={() => {
                    if (task.routine_id && (task as any).routine) {
                      setSelectedRoutine((task as any).routine);
                      setSelectedTask(null);
                    } else {
                      setSelectedTask(task);
                      setSelectedRoutine(null);
                    }
                  }}
                />
              ))
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== 'all'
                ? 'Nenhuma tarefa encontrada com os filtros aplicados.'
                : 'Nenhuma tarefa cadastrada. Clique em "Nova Tarefa" para começar.'}
            </p>
          </div>
        )}
        </div>
      </div>
      
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
                onClose={() => setSelectedRoutine(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
