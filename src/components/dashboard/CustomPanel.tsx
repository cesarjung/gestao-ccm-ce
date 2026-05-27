import { useState, useRef, useCallback } from 'react';
import { FolderKanban, Building2, Users, Loader2, Play, Settings, Trash2, CheckCircle2, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useTasks } from '@/hooks/useTasks';
import { useRoutines } from '@/hooks/useRoutines';
import { useIsAdmin } from '@/hooks/useUserRole';
import { useDeleteDashboardPanel, useUpdateDashboardPanel, DashboardPanel } from '@/hooks/useDashboardPanels';
import { PanelFormDialog } from '@/components/dashboard/PanelFormDialog';
import { TaskTrackerPanel } from '@/components/dashboard/TaskTrackerPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';

const FREQUENCIES = ['diaria', 'semanal', 'quinzenal', 'mensal'] as const;
const FREQUENCY_LABELS: Record<string, string> = {
  diaria: 'D',
  semanal: 'S',
  quinzenal: 'Q',
  mensal: 'M',
};
const FREQUENCY_FULL_LABELS: Record<string, string> = {
  diaria: 'Diária',
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
};

interface StatusData {
  completed: number;
  pending: number;
  total: number;
}

const getPeriodDates = (period: string) => {
  const now = new Date();
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'quarter':
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case 'year':
      return { start: startOfYear(now), end: endOfYear(now) };
    default:
      return null;
  }
};

const useCustomPanelData = (panel: DashboardPanel, dashboardSectorId?: string | null) => {
  const { filters } = panel;

  return useQuery({
    queryKey: ['custom-panel-data', panel.id, filters, dashboardSectorId],
    queryFn: async () => {
      // Get period dates
      const periodDates = getPeriodDates(filters.period || 'all');

      // Build tasks query
      let tasksQuery = supabase.from('tasks').select('id, status, unit_id, assigned_to, routine_id, created_at, due_date, sector_id');
      
      const effectiveSectorId = dashboardSectorId && dashboardSectorId !== 'all' ? dashboardSectorId : filters.sector_id;

      if (filters.unit_id) {
        if (Array.isArray(filters.unit_id)) {
          const validUnits = filters.unit_id.filter(id => id && id.toLowerCase() !== 'todas as unidades' && id.toLowerCase() !== 'selecionar todos');
          if (validUnits.length > 0) tasksQuery = tasksQuery.in('unit_id', validUnits);
        } else if (filters.unit_id.toLowerCase() !== 'todas as unidades' && filters.unit_id.toLowerCase() !== 'selecionar todos') {
          tasksQuery = tasksQuery.eq('unit_id', filters.unit_id);
        }
      }

      if (filters.status && filters.status.length > 0) {
        tasksQuery = tasksQuery.in('status', filters.status as ('pendente' | 'em_andamento' | 'concluida' | 'atrasada' | 'cancelada')[]);
      }

      // Instead of relying on task.sector_id which could be null for old tasks,
      // we filter the routines by sector_id AND frequency together.
      let queryRoutines = supabase.from('routines').select('id').eq('is_active', true);
      let needsRoutineFilter = false;

      if (effectiveSectorId) {
        queryRoutines = queryRoutines.eq('sector_id', effectiveSectorId);
        needsRoutineFilter = true;
      }
      
      if (filters.task_frequency && filters.task_frequency.length > 0) {
        queryRoutines = queryRoutines.in('frequency', filters.task_frequency);
        needsRoutineFilter = true;
      }

      let allowedRoutineIds: string[] | null = null;

      if (needsRoutineFilter) {
        const { data: matchedRoutines } = await queryRoutines;
        if (matchedRoutines && matchedRoutines.length > 0) {
          allowedRoutineIds = matchedRoutines.map((r: any) => r.id);
        } else {
          allowedRoutineIds = []; // No routines match the filters
        }
      }

      if (allowedRoutineIds !== null) {
        if (allowedRoutineIds.length === 0) {
          tasksQuery = tasksQuery.eq('routine_id', '00000000-0000-0000-0000-000000000000');
        } else {
          tasksQuery = tasksQuery.in('routine_id', allowedRoutineIds);
        }
      } else {
        if (titleFallback && titleFallback.length > 0) {
          tasksQuery = tasksQuery.in('title', titleFallback);
        } else if (titleIlikeFallback) {
          tasksQuery = tasksQuery.ilike('title', `%${titleIlikeFallback}%`);
        }
      }

      if (periodDates) {
        // Precisamos converter os limites de start/end locais para a janela UTC de GMT-3 correta
        // Para que o Supabase filtre exatamente o "Hoje" (de 03:00 de hoje até 02:59 de amanhã UTC)

        const formatDateString = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const startStr = formatDateString(periodDates.start);
        const endStr = `${formatDateString(periodDates.end)}T23:59:59.999Z`;

        tasksQuery = tasksQuery
          .gte('due_date', startStr)
          .lte('due_date', endStr);
      }

      // Fetch all task rows bypassing the 1000 row Supabase API default:
      tasksQuery = tasksQuery.limit(3000); // 3000 is a safe threshold for browser memory per panel.
      const { data: rawTasks, error: fetchError } = await tasksQuery;
      if (fetchError) throw fetchError;

      console.log('CustomPanel Debug - rawTasks fetched for', panel.title, ':', rawTasks?.length);
      if (rawTasks && rawTasks.length > 0) {
        console.log('CustomPanel Debug - Sample rawTask:', rawTasks[0]);
      }

      // Get routines for frequency mapping
      const routineIds = [...new Set(rawTasks?.filter(t => t.routine_id).map(t => t.routine_id) || [])];
      let routinesMap: Record<string, string> = {};
      let routineTitlesMap: Record<string, string> = {};

      if (routineIds.length > 0) {
        const { data: routines } = await supabase
          .from('routines')
          .select('id, frequency, title, is_active')
          .in('id', routineIds);

        routinesMap = (routines || []).reduce((acc, r) => {
          if (r.is_active !== false) {
            acc[r.id] = r.frequency;
          }
          return acc;
        }, {} as Record<string, string>);

        routineTitlesMap = (routines || []).reduce((acc, r) => {
          if (r.is_active !== false) {
            acc[r.id] = r.title;
          }
          return acc;
        }, {} as Record<string, string>);
      }

      // Filter tasks by frequency if specified
      const tasks = rawTasks?.filter(t => {
        if (!filters.task_frequency || filters.task_frequency.length === 0) return true;
        if (!t.routine_id) return false; // Non-routine tasks don't have frequency

        const freq = routinesMap[t.routine_id];
        if (!freq) return false; // This filters out tasks belonging to inactive routines automatically!

        return filters.task_frequency.includes(freq);
      });

      // Group data based on group_by
      let results: any[] = [];

      if (filters.group_by === 'unit') {
        let unitsQuery = supabase.from('units').select('id, name');
        if (filters.unit_id) {
          if (Array.isArray(filters.unit_id) && filters.unit_id.length > 0) {
            unitsQuery = unitsQuery.in('id', filters.unit_id);
          } else if (!Array.isArray(filters.unit_id)) {
            unitsQuery = unitsQuery.eq('id', filters.unit_id);
          }
        }
        const { data: units } = await unitsQuery;

        results = (units || []).map(unit => {
          // Strictly filter out global orchestrator tasks!
          const unitTasks = tasks?.filter(t => t.unit_id === unit.id && t.unit_id !== null) || [];
          const frequencies: Record<string, StatusData> = {};

          FREQUENCIES.forEach(f => {
            const freqTasks = unitTasks.filter(t => t.routine_id && routinesMap[t.routine_id] === f);
            frequencies[f] = {
              completed: freqTasks.filter(t => t.status === 'concluida').length,
              pending: freqTasks.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length,
              total: freqTasks.length
            };
          });

          const totals = {
            completed: unitTasks.filter(t => t.status === 'concluida').length,
            pending: unitTasks.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length,
            total: unitTasks.length
          };

          return { id: unit.id, name: unit.name, frequencies, totals };
        })
          .filter(u => u.totals.total > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
      } else if (filters.group_by === 'responsible') {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email');

        results = (profiles || []).map(profile => {
          const profileTasks = tasks?.filter(t => t.assigned_to === profile.id) || [];
          const frequencies: Record<string, StatusData> = {};

          FREQUENCIES.forEach(f => {
            const freqTasks = profileTasks.filter(t => t.routine_id && routinesMap[t.routine_id] === f);
            frequencies[f] = {
              completed: freqTasks.filter(t => t.status === 'concluida').length,
              pending: freqTasks.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length,
              total: freqTasks.length
            };
          });

          const totals = {
            completed: profileTasks.filter(t => t.status === 'concluida').length,
            pending: profileTasks.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length,
            total: profileTasks.length
          };

          return { id: profile.id, name: profile.full_name || profile.email, frequencies, totals };
        }).filter(p => p.totals.total > 0);
      } else if (filters.group_by === 'sector') {
        let sectorsQuery = supabase.from('sectors').select('id, name, color');
        if (filters.sector_id) {
          if (Array.isArray(filters.sector_id) && filters.sector_id.length > 0) {
            sectorsQuery = sectorsQuery.in('id', filters.sector_id);
          } else if (!Array.isArray(filters.sector_id)) {
            sectorsQuery = sectorsQuery.eq('id', filters.sector_id);
          }
        }
        const { data: sectors } = await sectorsQuery;

        // Get tasks with sector
        const { data: tasksWithSector } = await supabase
          .from('tasks')
          .select('id, status, sector_id, routine_id, created_at, due_date')
          .not('sector_id', 'is', null);

        results = (sectors || []).map(sector => {
          const sectorTasks = tasksWithSector?.filter(t => t.sector_id === sector.id) || [];
          const frequencies: Record<string, StatusData> = {};

          FREQUENCIES.forEach(f => {
            const freqTasks = sectorTasks.filter(t => t.routine_id && routinesMap[t.routine_id] === f);
            frequencies[f] = {
              completed: freqTasks.filter(t => t.status === 'concluida').length,
              pending: freqTasks.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length,
              total: freqTasks.length
            };
          });

          const totals = {
            completed: sectorTasks.filter(t => t.status === 'concluida').length,
            pending: sectorTasks.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length,
            total: sectorTasks.length
          };

          return { id: sector.id, name: sector.name, color: sector.color, frequencies, totals };
        }).filter(s => s.totals.total > 0);
      } else if (filters.group_by === 'task') {
        // Group by Routine / Task Title
        const routineMap = new Map<string, { id: string, name: string, tasks: any[] }>();

        // Populate distinct routines first
        const distinctRoutineIds = [...new Set(tasks?.map(t => t.routine_id).filter(Boolean))];
        if (distinctRoutineIds.length > 0) {
          const { data: routines } = await supabase
            .from('routines')
            .select('id, title')
            .in('id', distinctRoutineIds as string[]);

          routines?.forEach(r => {
            routineMap.set(r.id, { id: r.id, name: r.title, tasks: [] });
          });
        }

        // Group tasks into routines or standalone titles
        tasks?.forEach(task => {
          let key = task.routine_id || `title:${task.title}`;
          let name = task.title;

          if (task.routine_id && routineMap.has(task.routine_id)) {
            name = routineMap.get(task.routine_id)!.name;
          } else if (!routineMap.has(key)) {
            routineMap.set(key, { id: key, name: name, tasks: [] });
          }

          routineMap.get(key)!.tasks.push(task);
        });

        // Calculate frequencies and totals for each task/routine group
        results = Array.from(routineMap.values()).map(group => {
          const frequencies: Record<string, StatusData> = {};

          FREQUENCIES.forEach(f => {
            const freqTasks = group.tasks.filter(t => t.routine_id && routinesMap[t.routine_id] === f);
            frequencies[f] = {
              completed: freqTasks.filter(t => t.status === 'concluida').length,
              pending: freqTasks.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length,
              total: freqTasks.length
            };
          });

          const totals = {
            completed: group.tasks.filter(t => t.status === 'concluida').length,
            pending: group.tasks.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length,
            total: group.tasks.length
          };

          return { id: group.id, name: group.name, frequencies, totals };
        }).filter(g => g.totals.total > 0);
      } else if (filters.group_by === 'task_matrix') {
        let unitsQuery = supabase.from('units').select('id, name, code').order('name');
        if (filters.unit_id) {
          if (Array.isArray(filters.unit_id) && filters.unit_id.length > 0) {
            unitsQuery = unitsQuery.in('id', filters.unit_id);
          } else if (!Array.isArray(filters.unit_id)) {
            unitsQuery = unitsQuery.eq('id', filters.unit_id);
          }
        }
        const { data: units } = await unitsQuery;

        // Group tasks by routine (or title if no routine)
        const routineMap = new Map<string, { id: string, name: string, units: Record<string, any> }>();

        // Pre-fill with routines if we have them in the filtered set
        const distinctRoutineIds = [...new Set((tasks || []).map(t => t.routine_id).filter(Boolean))];

        if (distinctRoutineIds.length > 0) {
          const { data: routines } = await supabase
            .from('routines')
            .select('id, title')
            .in('id', distinctRoutineIds as string[]);

          routines?.forEach(r => {
            routineMap.set(r.id, { id: r.id, name: r.title, units: {} });
          });
        }

        // Also handle ad-hoc tasks by grouping by title
        (tasks || []).forEach(task => {
          let key = task.routine_id || `title:${task.title} `;
          let name = task.title;

          if (task.routine_id && routineMap.has(task.routine_id)) {
            name = routineMap.get(task.routine_id)!.name;
          } else if (!routineMap.has(key)) {
            routineMap.set(key, { id: key, name: name, units: {} });
          }

          const entry = routineMap.get(key)!;
          entry.units[task.unit_id || 'unassigned'] = {
            status: task.status,
            taskId: task.id,
            date: task.created_at
          };
        });

        results = Array.from(routineMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        return { results, routinesMap, routineTitlesMap, units: units || [], rawTasks };
      }

      return { results, routinesMap, routineTitlesMap, rawTasks };
    }
  });
};

interface StatusBadgeProps {
  data: StatusData;
  frequency: string;
  onClick?: () => void;
}

const StatusBadge = ({ data, frequency, onClick }: StatusBadgeProps) => {
  if (data.total === 0) {
    return <div className="w-7 h-7 rounded bg-secondary/30 flex items-center justify-center text-muted-foreground text-[10px]">-</div>;
  }

  const percentage = Math.round((data.completed / data.total) * 100);
  const isComplete = percentage === 100;
  const isGood = percentage >= 70;
  const isWarning = percentage >= 40 && percentage < 70;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={onClick}
            className={cn(
              'w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-110',
              onClick && 'cursor-pointer hover:ring-2 hover:ring-primary/50',
              !onClick && 'cursor-default',
              isComplete && 'bg-success/20 text-success',
              isGood && !isComplete && 'bg-emerald-500/20 text-emerald-400',
              isWarning && 'bg-warning/20 text-warning',
              !isGood && !isWarning && 'bg-destructive/20 text-destructive'
            )}
          >
            {isComplete ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <span>{data.completed}/{data.total}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-semibold">{FREQUENCY_FULL_LABELS[frequency]}</p>
          <p>{data.completed}/{data.total} ({percentage}%)</p>
          {onClick && <p className="text-muted-foreground">Clique para ver tarefas</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const TotalBadge = ({ data }: { data: StatusData }) => {
  if (data.total === 0) return <span className="text-muted-foreground text-xs">-</span>;

  const percentage = Math.round((data.completed / data.total) * 100);
  const isGood = percentage >= 70;
  const isWarning = percentage >= 40 && percentage < 70;

  return (
    <span className={cn(
      'text-xs font-bold',
      isGood ? 'text-success' : isWarning ? 'text-warning' : 'text-destructive'
    )}>
      {percentage}%
    </span>
  );
};

const getGroupIcon = (groupBy: string) => {
  switch (groupBy) {
    case 'unit': return Building2;
    case 'responsible': return Users;
    case 'sector': return FolderKanban;
    case 'task': return ClipboardList;
    default: return Building2;
  }
};

interface TasksDialogState {
  isOpen: boolean;
  title: string;
  entityId: string;
  entityType: 'unit' | 'responsible' | 'sector' | 'task';
  frequency: string;
}

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
  cancelada: 'Cancelada',
};

interface CustomPanelProps {
  panel: DashboardPanel;
  dashboardSectorId?: string | null;
}

export const CustomPanel = ({ panel, dashboardSectorId }: CustomPanelProps) => {
  const { data, isLoading } = useCustomPanelData(panel, dashboardSectorId);
  const Icon = getGroupIcon(panel.filters.group_by);
  const updatePanel = useUpdateDashboardPanel();

  const panelRef = useRef<HTMLDivElement>(null);

  const savedHeight = (panel.display_config?.height as number) || (panel.filters.group_by === 'tracker_gantt' ? 480 : 350);
  const savedWidth = panel.display_config?.width as number | undefined;

  const handleResizeStop = useCallback(() => {
    if (!panelRef.current) return;

    const currentWidth = panelRef.current.offsetWidth;
    const currentHeight = panelRef.current.offsetHeight;

    if (Math.abs(currentHeight - savedHeight) > 10 || (savedWidth && Math.abs(currentWidth - savedWidth) > 10)) {
      updatePanel.mutate({
        id: panel.id,
        display_config: {
          ...panel.display_config,
          width: currentWidth,
          height: currentHeight
        }
      });
    }
  }, [panel.id, panel.display_config, savedHeight, savedWidth, updatePanel]);

  const [tasksDialog, setTasksDialog] = useState<TasksDialogState>({
    isOpen: false,
    title: '',
    entityId: '',
    entityType: 'unit',
    frequency: '',
  });

  const { data: allTasks } = useTasks(undefined, { enabled: tasksDialog.isOpen });
  const deletePanel = useDeleteDashboardPanel();
  const { isAdmin } = useIsAdmin();

  const openTasksDialog = (
    entityId: string,
    entityName: string,
    entityType: 'unit' | 'responsible' | 'sector' | 'task',
    frequency: string
  ) => {
    setTasksDialog({
      isOpen: true,
      title: entityName,
      entityId,
      entityType,
      frequency,
    });
  };

  const closeTasksDialog = () => {
    setTasksDialog(prev => ({ ...prev, isOpen: false }));
  };

  // Filter tasks based on dialog state
  const filteredTasks = (data?.rawTasks || [])?.filter(task => {
    if (!tasksDialog.isOpen) return false;

    // Filter by entity type
    if (tasksDialog.entityType === 'unit') {
      if ((task as any).unit_id !== tasksDialog.entityId) return false;
    } else if (tasksDialog.entityType === 'responsible') {
      if ((task as any).assigned_to !== tasksDialog.entityId) return false;
    } else if (tasksDialog.entityType === 'sector') {
      if ((task as any).sector_id !== tasksDialog.entityId) return false;
    } else if (tasksDialog.entityType === 'task') {
      // If grouped by task, the entityId is either a routine_id or a 'title:...'
      if (tasksDialog.entityId.startsWith('title:')) {
        const titleKey = tasksDialog.entityId.substring(6);
        if ((task as any).title !== titleKey || (task as any).routine_id) return false;
      } else {
        if ((task as any).routine_id !== tasksDialog.entityId) return false;
      }
    }
    
    // Filter by effective sector
    const effectiveSectorId = dashboardSectorId && dashboardSectorId !== 'all' ? dashboardSectorId : panel.filters.sector_id;
    if (effectiveSectorId && task.sector_id !== effectiveSectorId) return false;
    
    return true;
  }) || [];

  // Determine visible frequencies
  const visibleFrequencies = panel.filters.task_frequency && panel.filters.task_frequency.length > 0
    ? FREQUENCIES.filter(f => panel.filters.task_frequency?.includes(f))
    : FREQUENCIES;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      );
    }

    if (!data?.results?.length) {
      return (
        <div className="p-4 flex flex-col items-center justify-center text-xs text-muted-foreground gap-2">
          <p className="font-semibold text-destructive">Sem dados para os filtros: {JSON.stringify(panel.filters.task_frequency)}</p>
          <div className="text-left w-full space-y-1 bg-secondary/20 p-2 rounded">
            <p><strong>DB rawTasks Total:</strong> {data?.rawTasks?.length || 0}</p>
            <p><strong>Routines Map Keys:</strong> {Object.keys(data?.routinesMap || {}).length}</p>
            <p><strong>Frequencies mapped:</strong> {Object.values(data?.routinesMap || {}).join(', ')}</p>
            <p><strong>Frequencies mapped:</strong> {Object.values(data?.routinesMap || {}).join(', ')}</p>
            <p> Se 'rawTasks' estiver vazio, o Supabase não devolveu tarefas nesse período.</p>
            <p> Se 'rawTasks' for {'>'} 0, a falha está no filtro routinesMap ou Unit ID.</p>
          </div>
        </div>
      );
    }

    if (panel.filters.group_by === 'task_matrix') {
      return (
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-card z-10 shadow-sm">
            <tr className="border-b border-border">
              <th className="text-left p-2 font-medium text-muted-foreground min-w-[200px] sticky left-0 bg-card z-20 border-r">Tarefa</th>
              {data?.units?.map((u: any) => (
                <th key={u.id} className="p-2 text-center font-medium text-muted-foreground min-w-[60px] whitespace-nowrap" title={u.name}>
                  {u.code || u.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {data?.results?.map((row: any) => (
              <tr key={row.id} className="hover:bg-secondary/20">
                <td className="p-2 font-medium text-foreground sticky left-0 bg-card z-10 border-r group-hover:bg-secondary/20 truncate max-w-[200px]" title={row.name}>
                  {row.name}
                </td>
                {data?.units?.map((u: any) => {
                  const cell = row.units[u.id];
                  return (
                    <td key={u.id} className="p-2 text-center border-l border-border/30">
                      {cell ? (
                        <div className="flex justify-center">
                          {cell.status === 'concluida' ? (
                            <div className="w-6 h-6 rounded-full bg-success/20 text-success flex items-center justify-center">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                              cell.status === 'atrasada' ? "bg-destructive/20 text-destructive" :
                                cell.status === 'em_andamento' ? "bg-warning/20 text-warning" :
                                  "bg-secondary text-muted-foreground"
                            )}>
                              {cell.status === 'atrasada' ? '!' : '-'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30 text-[10px]">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return (
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            <th className="text-left p-2 font-medium text-muted-foreground">Nome</th>
            {visibleFrequencies.map(f => <th key={f} className="p-1 text-center font-medium text-muted-foreground min-w-[36px]">{FREQUENCY_LABELS[f]}</th>)}
            <th className="p-2 text-right font-medium text-muted-foreground w-10">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data?.results?.map((item: { id: string; name: string; frequencies: Record<string, StatusData>; totals: StatusData }) => (
            <tr key={item.id} className="hover:bg-secondary/20">
              <td className="p-2">
                <p className="font-medium text-foreground" title={item.name}>{item.name}</p>
              </td>
              {visibleFrequencies.map(f => (
                <td key={f} className="p-1 text-center">
                  <StatusBadge
                    data={item.frequencies[f]}
                    frequency={f}
                    onClick={item.frequencies[f].total > 0
                      ? () => openTasksDialog(
                        item.id,
                        item.name,
                        panel.filters.group_by as 'unit' | 'responsible' | 'sector' | 'task',
                        f
                      )
                      : undefined
                    }
                  />
                </td>
              ))}
              <td className="p-2 text-right"><TotalBadge data={item.totals} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // Render tracker gantt (new tracking mode)
  if (panel.filters.group_by === 'tracker_gantt') {
    return (
      <div
        ref={panelRef}
        onMouseUp={handleResizeStop}
        className="rounded-lg border border-border bg-card overflow-hidden flex flex-col resize"
        style={{
          minHeight: 250,
          minWidth: 280,
          height: savedHeight,
          width: savedWidth || 'auto',
          maxWidth: '100%'
        }}
      >
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30 flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm truncate">{panel.title}</span>

          {isAdmin && (
            <div className="flex items-center gap-1 ml-auto">
              <PanelFormDialog
                panel={panel}
                trigger={
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Settings className="w-3 h-3" />
                  </Button>
                }
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover painel?</AlertDialogTitle>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deletePanel.mutate(panel.id)}>
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
        <TaskTrackerPanel
          sectorIds={
            dashboardSectorId && dashboardSectorId !== 'all'
              ? [dashboardSectorId]
              : (panel.filters.sector_id ? (Array.isArray(panel.filters.sector_id) ? panel.filters.sector_id : [panel.filters.sector_id as string]) : [])
          }
          initialFrequencies={panel.filters.task_frequency || []}
          initialRoutineIds={Array.isArray(panel.filters.title_filter) ? panel.filters.title_filter : []}
        />
      </div>
    );
  }

  return (
    <>
      <div
        ref={panelRef}
        onMouseUp={handleResizeStop}
        className="rounded-lg border border-border bg-card overflow-hidden flex flex-col resize"
        style={{
          minHeight: 150,
          minWidth: 280,
          height: savedHeight,
          width: savedWidth || 'auto',
          maxWidth: '100%'
        }}
      >
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30 flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm truncate">{panel.title}</span>
          <span className="text-[10px] text-muted-foreground ml-auto">{data?.results?.length || 0}</span>

          {isAdmin && (
            <div className="flex items-center gap-1 ml-2">
              <PanelFormDialog
                panel={panel}
                trigger={
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Settings className="w-3 h-3" />
                  </Button>
                }
              />

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover painel?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. O painel "{panel.title}" será removido permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deletePanel.mutate(panel.id)}>
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        <div className="overflow-auto flex-1">
          {renderContent()}
        </div>
      </div>

      {/* Tasks Dialog */}
      <Dialog open={tasksDialog.isOpen} onOpenChange={(open) => !open && closeTasksDialog()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className="w-5 h-5 text-primary" />
              {tasksDialog.title}
              {tasksDialog.frequency && (
                <Badge variant="secondary" className="ml-2">
                  {FREQUENCY_FULL_LABELS[tasksDialog.frequency] || tasksDialog.frequency}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma tarefa encontrada
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTasks.map((task: any) => (
                  <div key={task.id} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-medium">{task.title}</h4>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          {task.routine && (
                            <span className="flex items-center gap-1">
                              <Play className="w-3 h-3" />
                              Rotina: {task.routine.title}
                            </span>
                          )}
                          <span className={cn(
                            "px-2 py-0.5 rounded-full font-medium flex items-center gap-1",
                            task.status === 'concluida' ? "bg-success/20 text-success" :
                              task.status === 'atrasada' ? "bg-destructive/20 text-destructive" :
                                task.status === 'em_andamento' ? "bg-warning/20 text-warning" :
                                  "bg-secondary/50"
                          )}>
                            {STATUS_LABELS[task.status] || task.status}
                          </span>
                          {task.due_date && (
                            <span>Vencimento: {new Date(task.due_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
