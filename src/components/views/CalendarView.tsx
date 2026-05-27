import { useState, useEffect, useRef } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useRoutines } from '@/hooks/useRoutines';
import { useAuth } from '@/contexts/AuthContext';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Loader2, ChevronLeft, ChevronRight, Filter, Plus } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { TaskEditDialog } from '@/components/TaskEditDialog';
import { RoutineEditDialog } from '@/components/RoutineEditDialog';
import { TaskForm } from '@/components/TaskForm';
import { RoutineForm } from '@/components/RoutineForm';
import { RoutineDetailPanel } from '@/components/RoutineDetailPanel';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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

type Routine = Tables<'routines'>;

type RoutinePeriod = Tables<'routine_periods'> & {
  routine?: Tables<'routines'>;
};
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addDays,
  subDays,
  eachDayOfInterval,
  isSameDay,
  isToday,
  isSameMonth,
  isSameWeek,
  differenceInMinutes
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface GoogleCalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
}

interface CalendarViewProps {
  sectorId?: string;
  isMyTasks?: boolean;
  type?: 'tasks' | 'routines';
  hideHeader?: boolean;
}

interface CalendarItem {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  isAllDay: boolean;
  type: 'task' | 'google' | 'routine';
  status?: string;
  routineId?: string;
}

type ViewMode = 'day' | 'week' | 'month';

const HOUR_HEIGHT = 48;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const CalendarView = ({ sectorId, isMyTasks, type = 'tasks', hideHeader }: CalendarViewProps) => {
  const { data: tasks, isLoading: isLoadingTasks } = useTasks();
  const { data: routines } = useRoutines();
  const { user } = useAuth();
  const { isConnected, fetchEvents } = useGoogleCalendar();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [isLoadingGoogleEvents, setIsLoadingGoogleEvents] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [routineDialogOpen, setRoutineDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [selectedDateContext, setSelectedDateContext] = useState<Date | null>(null);

  // Fetch active routine periods
  const { data: routinePeriods } = useQuery({
    queryKey: ['routine-periods-calendar', routines?.map(r => r.id)],
    queryFn: async () => {
      if (!routines || routines.length === 0) return [];

      const routineIds = routines.map(r => r.id);
      const { data, error } = await supabase
        .from('routine_periods')
        .select('*, routine:routines(*)')
        .in('routine_id', routineIds)
        .eq('is_active', true);

      if (error) throw error;
      return data as RoutinePeriod[];
    },
    enabled: !!routines && routines.length > 0,
  });

  const isLoading = isLoadingTasks;

  const handleEditTask = (taskId: string) => {
    const task = tasks?.find(t => t.id === taskId);
    if (task) {
      setEditingTask(task as Task);
      setEditDialogOpen(true);
    }
  };

  const handleSelectRoutine = (routineId: string, contextDate?: Date) => {
    const routine = routines?.find(r => r.id === routineId);
    if (routine) {
      setSelectedRoutine(routine);
      if (contextDate) {
        setSelectedDateContext(contextDate);
      } else {
        setSelectedDateContext(null);
      }
    }
  };

  // Calculate date ranges based on view mode
  const getDateRange = () => {
    switch (viewMode) {
      case 'day':
        return { start: currentDate, end: currentDate };
      case 'week':
        return {
          start: startOfWeek(currentDate, { weekStartsOn: 0 }),
          end: endOfWeek(currentDate, { weekStartsOn: 0 })
        };
      case 'month':
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return {
          start: startOfWeek(monthStart, { weekStartsOn: 0 }),
          end: endOfWeek(monthEnd, { weekStartsOn: 0 })
        };
    }
  };

  const { start: rangeStart, end: rangeEnd } = getDateRange();
  const daysToShow = viewMode === 'day'
    ? [currentDate]
    : eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  // Scroll to current time on mount (for day/week views)
  useEffect(() => {
    if (scrollRef.current && viewMode !== 'month') {
      const now = new Date();
      const scrollPosition = (now.getHours() - 1) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = Math.max(0, scrollPosition);
    }
  }, [viewMode]);

  // Fetch Google Calendar events
  useEffect(() => {
    if (isMyTasks && isConnected) {
      const fetchGoogleEvents = async () => {
        setIsLoadingGoogleEvents(true);
        try {
          const events = await fetchEvents(
            rangeStart.toISOString(),
            rangeEnd.toISOString()
          );
          setGoogleEvents(events);
        } catch (error) {
          console.error('Error fetching Google Calendar events:', error);
        } finally {
          setIsLoadingGoogleEvents(false);
        }
      };
      fetchGoogleEvents();
    } else {
      setGoogleEvents([]);
    }
  }, [isMyTasks, isConnected, currentDate, viewMode]);

  const goToToday = () => setCurrentDate(new Date());

  const goToPrev = () => {
    switch (viewMode) {
      case 'day': setCurrentDate(subDays(currentDate, 1)); break;
      case 'week': setCurrentDate(subWeeks(currentDate, 1)); break;
      case 'month': setCurrentDate(subMonths(currentDate, 1)); break;
    }
  };

  const goToNext = () => {
    switch (viewMode) {
      case 'day': setCurrentDate(addDays(currentDate, 1)); break;
      case 'week': setCurrentDate(addWeeks(currentDate, 1)); break;
      case 'month': setCurrentDate(addMonths(currentDate, 1)); break;
    }
  };

  const getItemsForDay = (date: Date): CalendarItem[] => {
    const items: CalendarItem[] = [];

    // Add tasks - filter to avoid duplicates
    // For tasks with parent_task_id (child tasks), only show if user belongs to that unit
    // For parent tasks, only show if they have no children or if viewing all (isMyTasks mode shows only assigned)
    tasks?.forEach(task => {
      if (!task.due_date) return;
      const matchesSector = !sectorId || (task as any).sector_id === sectorId || task.routine?.sector_id === sectorId || task.unit?.sector_id === sectorId;
      // Update MatchesUser to include assignees
      const matchesUser = !isMyTasks ||
        task.assigned_to === user?.id ||
        task.assignees?.some((a: any) => a.id === user?.id);

      // Skip parent tasks that have children (to avoid duplicates)
      // Parent tasks have parent_task_id === null but may have children
      const hasChildren = task.parent_task_id === null &&
        tasks.some(t => t.parent_task_id === task.id);

      // If this is a parent task with children, skip it (children will show instead)
      if (hasChildren) {
        return;
      }
      
      const matchesType = typeFilter === 'all' || (typeFilter === 'tasks_only' && !task.routine_id) || (typeFilter === 'routines_only' && !!task.routine_id);
      
      if (matchesSector && matchesUser && matchesType && isSameDay(new Date(task.due_date), date)) {
        const dueDate = new Date(task.due_date);
        // Use start_date if available (for routine tasks with duration), otherwise default to 1 hour before due date
        const startDate = (task as any).start_date
          ? new Date((task as any).start_date)
          : new Date(dueDate.getTime() - 60 * 60 * 1000);

        // If start date is same as due date (legacy), default to 1 hour duration
        const finalStartDate = startDate.getTime() === dueDate.getTime()
          ? new Date(dueDate.getTime() - 60 * 60 * 1000)
          : startDate;

        const isAllDay = finalStartDate.getHours() === 0 && finalStartDate.getMinutes() === 0 &&
          (dueDate.getHours() === 0 || dueDate.getHours() === 23);

        items.push({
          id: task.id,
          title: task.title,
          startDate: finalStartDate,
          endDate: dueDate,
          isAllDay,
          type: 'task',
          status: task.status,
          routineId: task.routine_id,
        });
      }
    });

    // Routine periods rendering restored (shows in "All Day" / Top section)
    routinePeriods?.forEach(period => {
      if (typeFilter === 'tasks_only') return;
      if (!period.routine) return;

      const periodStart = new Date(period.period_start);
      const periodEnd = new Date(period.period_end);

      // Check if this day falls within the period
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      // Show routine if the day is within the period range
      if (dayStart <= periodEnd && dayEnd >= periodStart) {
        // Only show strictly on the end date to avoid spanning weirdness, 
        // OR simply show if it's the active period. 
        // Showing on deadline day is a safe default for "Top" items.
        if (isSameDay(periodEnd, date)) {

          // Calculate status based on parent task (same logic as before)
          const parentTask = tasks?.find(t =>
            t.routine_id === period.routine_id &&
            t.parent_task_id === null &&
            t.due_date && isSameDay(new Date(t.due_date), periodEnd)
          );

          let computedStatus = 'pendente';
          if (parentTask) {
            computedStatus = parentTask.status;
            // Add extra logic for partial completion if needed, but keeping it simple for now or reusing the logic if available
            const childTasks = tasks?.filter(t => t.parent_task_id === parentTask.id) || [];
            if (parentTask.status === 'concluida' && childTasks.length > 0 && childTasks.some(t => t.status !== 'concluida' && t.status !== 'nao_aplicavel')) {
              computedStatus = 'concluida_parcial';
            }
          }

          let startDate = new Date(periodEnd);
          let endDate = new Date(periodEnd.getTime() + 60 * 60 * 1000);
          
          if (period.routine.time_start) {
            const [hours, minutes] = period.routine.time_start.split(':');
            startDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          } else {
            startDate.setHours(8, 0, 0, 0);
          }
          
          if (period.routine.time_end) {
            const [hours, minutes] = period.routine.time_end.split(':');
            endDate = new Date(startDate);
            endDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            
            if (endDate < startDate) {
              endDate.setDate(endDate.getDate() + 1);
            }
          }

          const isAllDay = startDate.getHours() === 0 && startDate.getMinutes() === 0 &&
            (endDate.getHours() === 0 || endDate.getHours() === 23);

          items.push({
            id: period.id,
            title: `🔄 ${period.routine.title}`,
            startDate: startDate,
            endDate: endDate,
            isAllDay,
            type: 'routine',
            routineId: period.routine_id,
            status: computedStatus
          });
        }
      }
    });

    // Add Google events
    if (isMyTasks) {
      googleEvents.forEach(event => {
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);

        if (isSameDay(startDate, date)) {
          const isAllDay = startDate.getHours() === 0 &&
            startDate.getMinutes() === 0 &&
            (differenceInMinutes(endDate, startDate) >= 1440 || endDate.getHours() === 0);

          items.push({
            id: event.id,
            title: event.title,
            startDate,
            endDate,
            isAllDay,
            type: 'google'
          });
        }
      });
    }

    return items;
  };

  const getEventPosition = (item: CalendarItem) => {
    const startMinutes = item.startDate.getHours() * 60 + item.startDate.getMinutes();
    const endMinutes = item.endDate.getHours() * 60 + item.endDate.getMinutes();
    const duration = Math.max(endMinutes - startMinutes, 30);

    const top = (startMinutes / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;

    return { top, height: Math.max(height, 20) };
  };

  const getItemColor = (item: CalendarItem) => {
    if (item.type === 'google') {
      return 'bg-blue-500 border-blue-600';
    }

    // Routine type now uses status colors
    // if (item.type === 'routine') {
    //   return 'bg-purple-500 border-purple-600';
    // }

    const statusColors: Record<string, string> = {
      pendente: 'bg-yellow-500 border-yellow-600',
      em_andamento: 'bg-primary border-primary', // Changed to match "Em Andamento" blue theme
      concluida: 'bg-green-500 border-green-600',
      atrasada: 'bg-red-500 border-red-600',
      cancelada: 'bg-slate-500 border-slate-600',
      concluida_parcial: 'bg-green-800 border-green-900',
      nao_aplicavel: 'bg-[#0A3D14] border-[#05260A] text-white',
    };

    return statusColors[item.status || 'pendente'] || statusColors.pendente;
  };

  const getCurrentTimePosition = () => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    return (minutes / 60) * HOUR_HEIGHT;
  };

  const getHeaderTitle = () => {
    switch (viewMode) {
      case 'day':
        return format(currentDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
      case 'week':
      case 'month':
        return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Calendário</h1>
          <p className="text-muted-foreground">Visualize tarefas por data</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Month View Component
  const MonthView = () => {
    const weeks: Date[][] = [];
    for (let i = 0; i < daysToShow.length; i += 7) {
      weeks.push(daysToShow.slice(i, i + 7));
    }

    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Week Header */}
        <div className="grid grid-cols-7 bg-muted/30">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
            <div
              key={day}
              className="py-3 text-center text-sm font-medium text-muted-foreground border-b border-border"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7">
            {week.map((day) => {
              const dayItems = getItemsForDay(day);
              const isCurrentDay = isToday(day);
              const isInCurrentMonth = isSameMonth(day, currentDate);

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'min-h-[100px] border-b border-r border-border last:border-r-0 p-1',
                    !isInCurrentMonth && 'bg-muted/20',
                    isCurrentDay && 'bg-primary/5'
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span
                      className={cn(
                        'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
                        isCurrentDay && 'bg-primary text-primary-foreground',
                        !isInCurrentMonth && 'text-muted-foreground/50'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayItems.length > 0 && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {dayItems.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayItems.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded truncate text-white cursor-pointer hover:opacity-80',
                          getItemColor(item)
                        )}
                        title={item.title}
                        onClick={(e) => {
                          if (item.type === 'task') {
                            if (item.routineId) {
                              handleSelectRoutine(item.routineId);
                            } else {
                              handleEditTask(item.id);
                            }
                          } else if (item.type === 'routine' && item.routineId) {
                            handleSelectRoutine(item.routineId);
                          }
                        }}
                      >
                        {item.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // Day/Week View Component (Time Grid)
  const TimeGridView = () => {
    const gridCols = viewMode === 'day' ? 'grid-cols-[60px_1fr]' : 'grid-cols-[60px_repeat(7,1fr)]';

    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className={cn('grid border-b border-border', gridCols)}>
          <div className="p-2 text-xs text-muted-foreground text-center border-r border-border">
            GMT-03
          </div>
          {daysToShow.map((day) => {
            const isCurrentDay = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className="p-2 text-center border-r border-border last:border-r-0"
              >
                <div className={cn(
                  "text-xs uppercase font-medium",
                  isCurrentDay ? "text-primary" : "text-muted-foreground"
                )}>
                  {format(day, 'EEE', { locale: ptBR })}.
                </div>
                <div className={cn(
                  "text-xl font-medium mt-1",
                  isCurrentDay && "w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto"
                )}>
                  {format(day, 'd')}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day events row */}
        <div className={cn('grid border-b border-border min-h-[40px]', gridCols)}>
          <div className="p-1 text-xs text-muted-foreground text-right pr-2 border-r border-border" />
          {daysToShow.map((day) => {
            const allDayItems = getItemsForDay(day).filter(item => item.isAllDay);
            return (
              <div
                key={`allday-${day.toISOString()}`}
                className="p-1 border-r border-border last:border-r-0 space-y-1 min-w-0" // Add min-w-0
              >
                {allDayItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'text-xs px-2 py-1 rounded text-white cursor-pointer hover:opacity-80 whitespace-normal break-words shadow-sm', // Wrap text
                      getItemColor(item)
                    )}
                    title={item.title}
                    onClick={(e) => {
                      if (item.type === 'task') {
                        if (item.routineId) {
                          handleSelectRoutine(item.routineId, day);
                        } else {
                          handleEditTask(item.id);
                        }
                      } else if (item.type === 'routine' && item.routineId) {
                        handleSelectRoutine(item.routineId, day);
                      }
                    }}
                  >
                    {item.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Time Grid */}
        <div
          ref={scrollRef}
          className="overflow-y-auto max-h-[600px] relative"
        >
          <div className={cn('grid', gridCols)}>
            {/* Hours Column */}
            <div className="relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-r border-border relative"
                  style={{ height: HOUR_HEIGHT }}
                >
                  <span className="absolute -top-2 right-2 text-xs text-muted-foreground">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {daysToShow.map((day) => {
              const dayItems = getItemsForDay(day).filter(item => !item.isAllDay);
              const isCurrentDay = isToday(day);

              return (
                <div
                  key={day.toISOString()}
                  className="relative border-r border-border last:border-r-0"
                >
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="border-b border-border"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}

                  {isCurrentDay && (
                    <div
                      className="absolute left-0 right-0 z-20 flex items-center"
                      style={{ top: getCurrentTimePosition() }}
                    >
                      <div className="w-3 h-3 rounded-full bg-red-500 -ml-1.5" />
                      <div className="flex-1 h-0.5 bg-red-500" />
                    </div>
                  )}

                  {dayItems.map((item, itemIndex) => {
                    const { top, height } = getEventPosition(item);
                    const timeStr = format(item.startDate, 'HH:mm');
                    const endTimeStr = format(item.endDate, 'HH:mm');

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'absolute left-1 right-1 rounded-sm px-2 py-1 text-white text-xs overflow-hidden cursor-pointer border-l-4 z-10 hover:opacity-90',
                          getItemColor(item)
                        )}
                        style={{
                          top: top + 1,
                          height: height - 2,
                          left: itemIndex > 0 ? `${(itemIndex % 2) * 40}%` : undefined,
                          width: itemIndex > 0 ? '60%' : undefined,
                          zIndex: itemIndex > 0 ? 20 : 10,
                        }}
                        title={`${item.title} (${timeStr} - ${endTimeStr})`}
                        onClick={(e) => {
                          if (item.type === 'task') {
                            if (item.routineId) {
                              handleSelectRoutine(item.routineId, day);
                            } else {
                              handleEditTask(item.id);
                            }
                          } else if (item.type === 'routine' && item.routineId) {
                            handleSelectRoutine(item.routineId, day);
                          }
                        }}
                      >
                        <div className="font-medium truncate">{item.title}</div>
                        {height > 30 && (
                          <div className="text-white/80 truncate">
                            {timeStr} - {endTimeStr}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {!isMyTasks && !hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">
              Calendário {type === 'routines' ? '(Rotinas)' : ''}
            </h1>
            <p className="text-muted-foreground">Visualize {type === 'routines' ? 'rotinas' : 'tarefas'} organizadas por data</p>
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


      {/* Navigation Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="font-medium"
          >
            Hoje
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goToPrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={goToNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <h2 className="text-lg font-semibold text-foreground capitalize">
            {getHeaderTitle()}
          </h2>
        </div>

        {/* View Mode Toggle & Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px] bg-background">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tudo</SelectItem>
              <SelectItem value="tasks_only">Apenas Tarefas</SelectItem>
              <SelectItem value="routines_only">Apenas Rotinas</SelectItem>
            </SelectContent>
          </Select>
          <ToggleGroup 
            type="single" 
            value={viewMode} 
            onValueChange={(value) => value && setViewMode(value as ViewMode)}
            className="border rounded-lg bg-background flex-shrink-0"
          >
            <ToggleGroupItem value="day" className="px-4">
              Dia
            </ToggleGroupItem>
            <ToggleGroupItem value="week" className="px-4">
              Semana
            </ToggleGroupItem>
            <ToggleGroupItem value="month" className="px-4">
              Mês
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Calendar View */}
      {viewMode === 'month' ? <MonthView /> : <TimeGridView />}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-yellow-500" />
          <span className="text-muted-foreground">Pendente</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-orange-500" />
          <span className="text-muted-foreground">Em Andamento</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span className="text-muted-foreground">Concluída</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span className="text-muted-foreground">Atrasada</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-green-800" />
          <span className="text-muted-foreground">Encerrada (Parcial)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-slate-500" />
          <span className="text-muted-foreground">Cancelada</span>
        </div>
        {isMyTasks && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <span className="text-muted-foreground">Google Calendar</span>
          </div>
        )}
      </div>

      <TaskEditDialog
        task={editingTask}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      <RoutineEditDialog
        routine={editingRoutine}
        open={routineDialogOpen}
        onOpenChange={setRoutineDialogOpen}
      />

      <Sheet open={!!selectedRoutine} onOpenChange={(open) => !open && setSelectedRoutine(null)}>
        <SheetContent className="sm:max-w-xl w-[90vw] p-0" side="right">
          {selectedRoutine && (
            <div className="h-full overflow-y-auto">
              <RoutineDetailPanel
                routine={selectedRoutine}
                onClose={() => {
                  setSelectedRoutine(null);
                  setSelectedDateContext(null);
                }}
                contextDate={selectedDateContext}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
