import { useMemo, useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, parseISO, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, ChevronLeft, ChevronRight, FileSpreadsheet, Check, X as XIcon, Minus, GripVertical, RefreshCw, Save, Calendar as CalendarIcon } from 'lucide-react';
import { Rnd, RndDragCallback, RndResizeCallback } from 'react-rnd';
import { MultiSelect } from '@/components/ui/multi-select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRoutines } from '@/hooks/useRoutines';
import { useSectors } from '@/hooks/useSectors';
import { useAuth } from '@/contexts/AuthContext';
import { useIsGestorOrAdmin } from '@/hooks/useUserRole';
import { useUpdateTask } from '@/hooks/useTaskMutations';
import { useTrackerSettings } from '@/hooks/useTrackerSettings';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { RoutineDetailPanel } from '@/components/RoutineDetailPanel';
import { TaskHoverCard } from './TaskHoverCard';

interface TaskTrackerPanelProps {
    sectorIds?: string[];
    initialRoutineIds?: string[];
    initialFrequencies?: string[];
}


const frequencyOptions = [
    { label: 'Diárias', value: 'diaria' },
    { label: 'Semanais', value: 'semanal' },
    { label: 'Quinzenais', value: 'quinzenal' },
    { label: 'Mensais', value: 'mensal' },
];

export const TaskTrackerPanel = ({ sectorIds = [], initialRoutineIds = [], initialFrequencies = [] }: TaskTrackerPanelProps) => {
    const [selectedRoutineIds, setSelectedRoutineIds] = useState<string[]>(initialRoutineIds);
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [trackerSectorIds, setTrackerSectorIds] = useState<string[]>([]);
    const [frequencyFilter, setFrequencyFilter] = useState<string[]>(initialFrequencies);
    const [layouts, setLayouts] = useState<Record<string, { x: number, y: number, width: number, height: number }>>({});
    const [maxHeight, setMaxHeight] = useState(600);
    const [selectedRoutineForPanel, setSelectedRoutineForPanel] = useState<{ routine: any; date: Date | string; exactDate?: string } | null>(null);
    const [isLayoutDirty, setIsLayoutDirty] = useState(false);
    const [hasLoadedSettings, setHasLoadedSettings] = useState(false);

    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { isGestorOrAdmin } = useIsGestorOrAdmin();
    const updateTaskMutation = useUpdateTask();

    // Use the first sectorId for settings context if we are matching 1:1, or null for global
    const singleSectorId = sectorIds.length === 1 ? sectorIds[0] : null;
    const { settings, saveSettings, isLoading: isLoadingSettings } = useTrackerSettings(singleSectorId);

    useEffect(() => {
        if (!isLoadingSettings && !hasLoadedSettings) {
            if (settings) {
                if (settings.layouts && Object.keys(settings.layouts).length > 0) {
                    setLayouts(settings.layouts);
                }
                if (settings.filters?.routines?.length > 0 && initialRoutineIds.length === 0) {
                    setSelectedRoutineIds(settings.filters.routines);
                }
                if (settings.filters?.frequencies?.length > 0) {
                    setFrequencyFilter(settings.filters.frequencies);
                }
                if (settings.filters?.sectors?.length > 0) {
                    setTrackerSectorIds(settings.filters.sectors);
                }
            }
            setHasLoadedSettings(true);
        }
    }, [settings, isLoadingSettings, hasLoadedSettings, initialRoutineIds.length]);

    const updateLayout = (id: string, updates: Partial<{ x: number, y: number, width: number, height: number }>) => {
        setLayouts(prev => {
            const current = prev[id] || { x: 0, y: 0, width: 400, height: 250 };
            return { ...prev, [id]: { ...current, ...updates } };
        });
        setIsLayoutDirty(true);
    };

    const handleSaveGlobalView = () => {
        console.log("-> Clicou em Salvar Vista", { singleSectorId, isLoadingSettings, isPending: saveSettings.isPending });

        console.log("-> Disparando saveSettings.mutate...");
        saveSettings.mutate({
            sector_id: singleSectorId,
            filters: { routines: selectedRoutineIds, frequencies: frequencyFilter, sectors: trackerSectorIds },
            layouts: layouts
        });
        setIsLayoutDirty(false);
    };

    useEffect(() => {
        let invalidateTimeout: NodeJS.Timeout;

        const channel = supabase.channel('task-tracker-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
                clearTimeout(invalidateTimeout);
                invalidateTimeout = setTimeout(() => {
                    queryClient.invalidateQueries({ queryKey: ['tracker-tasks'] });
                }, 2000); // 2-second debounce to avoid UI freeze during bulk inserts
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            clearTimeout(invalidateTimeout);
        };
    }, [queryClient]);

    const { data: routines, isLoading: isLoadingRoutines } = useRoutines();
    const { data: sectorsData } = useSectors();

    const activeRoutines = useMemo(() => {
        const _active = routines?.filter(r => r.is_active !== false) || [];

        let filtered = _active;
        if (sectorIds && sectorIds.length > 0) {
            filtered = filtered.filter((r: any) => sectorIds.includes(r.sector_id));
        }

        if (trackerSectorIds.length > 0) {
            filtered = filtered.filter((r: any) => trackerSectorIds.includes(r.sector_id));
        }

        return filtered;
    }, [routines, sectorIds, trackerSectorIds]);

    // determine which routines to show based on the filter
    const routinesToShow = useMemo(() => {
        let baseRoutines = activeRoutines;

        // Se não existir seleção manual de rotina nenhuma vez E não recebemos initialFrequencies
        // Mantemos o painel vazio por segurança. Mas se recebemos frequências via widget dashboard
        // ou salvamos globalmente, liberamos as rotinas ligadas àquelas frequências.
        const hasManualRoutines = selectedRoutineIds.length > 0;
        const hasFrequencies = frequencyFilter.length > 0;

        if (!hasManualRoutines && !hasFrequencies) {
            return []; // Nothing selected anywhere
        }

        let result = baseRoutines;

        if (hasManualRoutines) {
            result = result.filter(r => selectedRoutineIds.includes(r.id));
        }

        if (hasFrequencies) {
            result = result.filter(r => frequencyFilter.includes(r.frequency));
        }

        return result;

    }, [activeRoutines, selectedRoutineIds, frequencyFilter]);

    // Quando carregamos via Widget com Frequência mas sem Rotinas salvas, tentamos selecionar todas as ativas pra iniciar
    useEffect(() => {
        if (initialFrequencies.length > 0 && selectedRoutineIds.length === 0 && routinesToShow.length > 0) {
            setSelectedRoutineIds(routinesToShow.map(r => r.id));
        }
    }, [initialFrequencies, routinesToShow.length]);

    const routineIds = useMemo(() => routinesToShow.map(r => r.id), [routinesToShow]);

    // Fetch active units for this sector
    const { data: sectorUnits, isLoading: isLoadingUnits } = useQuery({
        queryKey: ['tracker-units', singleSectorId],
        queryFn: async () => {
            const { data, error } = await supabase.from('units').select('id, name, code').not('parent_id', 'is', null).order('name');
            if (error) throw error;
            return data;
        }
    });

    const startDate = startOfMonth(currentDate);
    const endDate = endOfMonth(currentDate);

    // Fetch tasks for ALL selected routines for the month
    const { data: tasks, isLoading: isLoadingTasks } = useQuery({
        queryKey: ['tracker-tasks', routineIds, startDate.toISOString()],
        queryFn: async () => {
            if (routineIds.length === 0) return [];

            // Chunk request by small groups of routines to perfectly bypass 
            // the Supabase default 1000-row pagination hard-limit that truncates 
            // newly generated tasks with higher IDs.
            const chunkSize = 3;
            const routineChunks = [];
            for (let i = 0; i < routineIds.length; i += chunkSize) {
                routineChunks.push(routineIds.slice(i, i + chunkSize));
            }

            const fetchPromises = routineChunks.map(async (chunk) => {
                const { data, error } = await supabase
                    .from('tasks')
                    .select(`id, status, start_date, due_date, unit_id, routine_id, title, description, priority, created_by, assigned_to, completed_at, parent_task_id, unit:units(name), assignees:task_assignees(user_id)`)
                    .in('routine_id', chunk)
                    .gte('due_date', startDate.toISOString())
                    .lte('due_date', endDate.toISOString())
                    .limit(10000);
                if (error) throw error;
                return data || [];
            });

            const results = await Promise.all(fetchPromises);
            return results.flat();
        },
        enabled: routineIds.length > 0
    });

    const daysInMonth = useMemo(() => eachDayOfInterval({ start: startDate, end: endDate }), [startDate, endDate]);

    const allUnitRows = useMemo(() => {
        if (!sectorUnits) return [];
        const units = [...sectorUnits];
        // always add unassigned just in case
        units.push({ id: 'unassigned', name: 'Sem Unidade', is_active: true });
        return units;
    }, [sectorUnits]);

    const routinesData = useMemo(() => {
        if (!routinesToShow.length || !allUnitRows.length) return [];
        const validTasks = tasks || [];

        return routinesToShow.map(routine => {
            const routineTasks = validTasks.filter(t => t.routine_id === routine.id);

            const taskMap = new Map();
            routineTasks.forEach(task => {
                if (!task.due_date) return;

                let dateKey = '';
                try {
                    const parsed = parseISO(task.due_date);
                    if (isNaN(parsed.getTime())) return;
                    dateKey = format(parsed, 'yyyy-MM-dd');
                } catch (e) {
                    return;
                }

                let unitId = task.unit_id || 'unassigned';

                // Prevent Parent Tasks (which act as invisible containers) from bleeding into 'Sem Unidade' 
                // when the Routine strictly splits workload by units.
                if (task.parent_task_id === null && unitId === 'unassigned') {
                    return;
                }

                const existingTask = taskMap.get(`${unitId}_${dateKey}`);
                // Se já existir uma tarefa filha (subtarefa) na célula e a atual for a Tarefa Mãe, ignoramos
                if (existingTask && existingTask.parent_task_id !== null && task.parent_task_id === null) {
                    return;
                }

                taskMap.set(`${unitId}_${dateKey}`, task);
            });

            // Pre-scan se esta rotina tem tarefas ou configurações em alguma Unidade real (para não exibir "Sem Unidade" atoa)
            const hasAnyTaskInAnyUnit = allUnitRows.some(u =>
                u.id !== 'unassigned' && daysInMonth.some(day => taskMap.has(`${u.id}_${format(day, 'yyyy-MM-dd')}`))
            );

            const matrix = allUnitRows.map(unit => {
                const isUnassignedRow = unit.id === 'unassigned';
                const hasAnyTask = daysInMonth.some(day => taskMap.has(`${unit.id}_${format(day, 'yyyy-MM-dd')}`));

                let appliesToUnit = false;

                if (!isUnassignedRow) {
                    // We rely on the hasAnyTask check to truly confirm it belongs.
                    // If this operative unit has ANY tasks this month, 
                    // it officially belongs to this routine's grid profile.
                    if (hasAnyTask) {
                        appliesToUnit = true;
                    }
                } else {
                    // For the "Sem Unidade" / "Global" row
                    // ONLY display it if there are actually orphan tasks floating here.
                    // This fully eliminates the ghost "Sem Unidade" empty row.
                    if (hasAnyTask) {
                        appliesToUnit = true;
                    }
                }

                const rowData = daysInMonth.map(day => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const task = taskMap.get(`${unit.id}_${dateKey}`);

                    if (task) return task;
                    if (appliesToUnit) return 'empty'; // means we should render a '-' (no task that day)
                    return null;
                });
                return { unit, days: rowData, appliesToUnit, hasAnyTask };
            }).filter(row => row.appliesToUnit || row.hasAnyTask);

            const dailyStats = daysInMonth.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const allDayTasks = routineTasks.filter(t => {
                    if (!t.due_date) return false;
                    try {
                        const parsed = parseISO(t.due_date);
                        if (isNaN(parsed.getTime())) return false;
                        return format(parsed, 'yyyy-MM-dd') === dateKey;
                    } catch (e) {
                        return false;
                    }
                });

                // Se o dia tiver tarefas filhas (parent_task_id !== null), contamos apenas elas na porcentagem. 
                // Caso contrário (rotinas sem divisão por unidades), contamos a própria tarefa raiz.
                const childTasks = allDayTasks.filter(t => t.parent_task_id !== null);
                const dayTasks = childTasks.length > 0 ? childTasks : allDayTasks;

                const total = dayTasks.length;
                const completed = dayTasks.filter(t => t.status === 'concluida' || t.status === 'nao_aplicavel').length;
                return { total, completed };
            });

            let timeRange = '00:00 - 23:59';
            const firstTask = routineTasks.find(t => t.start_date || t.due_date);

            if (firstTask) {
                let startStr = '00:00';
                let endStr = '23:59';
                try {
                    if (firstTask.start_date) {
                        const parsedStart = parseISO(firstTask.start_date);
                        if (!isNaN(parsedStart.getTime())) {
                            startStr = format(parsedStart, 'HH:mm');
                        }
                    }
                    if (firstTask.due_date) {
                        const parsedEnd = parseISO(firstTask.due_date);
                        if (!isNaN(parsedEnd.getTime())) {
                            endStr = format(parsedEnd, 'HH:mm');
                        }
                    }
                } catch (e) {
                    // ignore format errors for legacy malformed dates
                }
                timeRange = `${startStr} - ${endStr}`;
            }

            return { routine, matrix, dailyStats, timeRange };
        });
    }, [routinesToShow, allUnitRows, tasks, daysInMonth]);

    const canUserAccessTask = (task: any) => {
        if (!user) return false;
        if (isGestorOrAdmin) return true;
        if (task.created_by === user.id || task.assigned_to === user.id) return true;
        if (task.assignees && task.assignees.some((a: any) => a.user_id === user.id)) return true;
        return false;
    };

    const handleTaskClick = (task: any, routine: any) => {
        const access = canUserAccessTask(task);
        if (access) {
            // Precisamos ler a data considerando o fuso horário (ex: "2026-03-05T02:59Z" no banco é 23:59 de Hoje no Brasil)
            // Extrair substring(0,10) de '05' empurra pro dia errado! Precisamos parsear localmente primeiro.
            let dateStr = new Date().toISOString().substring(0, 10);
            if (task.due_date) {
                const parsedDate = parseISO(task.due_date);
                if (!isNaN(parsedDate.getTime())) {
                    dateStr = format(parsedDate, 'yyyy-MM-dd'); // Resulta corretamente em "2026-03-04" 
                }
            }
            setSelectedRoutineForPanel({ routine, date: dateStr, exactDate: task.due_date || undefined });
        } else {
            console.warn("🚫 Permissão negada para clique na tarefa.");
        }
    };

    const handleEmptyCellClick = (routine: any, day: Date) => {
        setSelectedRoutineForPanel({ routine, date: format(day, 'yyyy-MM-dd') });
    };

    const handleReopenTask = async (taskId: string) => {
        await updateTaskMutation.mutateAsync({ id: taskId, status: 'pendente', comment: 'Reaberta através do Rastreador de Tarefas' });
    };

    const sortedRoutinesData = routinesData;

    useEffect(() => {
        if (sortedRoutinesData.length === 0) return;

        let changed = false;
        const newLayouts = { ...layouts };

        sortedRoutinesData.forEach((r, index) => {
            if (!newLayouts[r.routine.id]) {
                const col = index % 3;
                const row = Math.floor(index / 3);
                newLayouts[r.routine.id] = {
                    x: col * 420,
                    y: row * 280,
                    width: 400,
                    height: 250
                };
                changed = true;
            }
        });

        if (changed) {
            setLayouts(newLayouts);
            // Salvar silenciosamente se mudou via carregamento inicial sem layouts
            setIsLayoutDirty(true);
        }

        let maxBottom = 600;
        Object.values(newLayouts).forEach(l => {
            if (l.y + l.height > maxBottom) maxBottom = l.y + l.height;
        });
        setMaxHeight(maxBottom + 100);

    }, [sortedRoutinesData, layouts]);

    const handlePrevMonth = () => setCurrentDate(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentDate(prev => addMonths(prev, 1));

    const getFilterLabel = () => {
        if (selectedRoutineIds.length === 0) return 'Selecione Rotinas';
        if (selectedRoutineIds.length === activeRoutines.length) return 'Todas as Rotinas';
        if (selectedRoutineIds.length === 1) {
            return activeRoutines.find(r => r.id === selectedRoutineIds[0])?.title || 'Rotina Específica';
        }
        return `${selectedRoutineIds.length} Rotinas Selecionadas`;
    };

    return (
        <Card className="flex flex-col h-[calc(100vh-140px)] min-h-[600px] overflow-hidden border-0 shadow-none">
            <CardHeader className="pb-3 shrink-0 px-2 sm:px-4">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex flex-wrap items-center gap-2 w-full">
                        <div className="w-[140px] shrink-0">
                            <MultiSelect
                                options={sectorsData?.map(s => ({ label: s.name, value: s.id })) || []}
                                selected={trackerSectorIds}
                                onChange={(vals) => {
                                    setTrackerSectorIds(vals);
                                    setIsLayoutDirty(true);
                                }}
                                placeholder="Setores..."
                            />
                        </div>

                        <div className="w-[200px] shrink-0">
                            <MultiSelect
                                options={activeRoutines.map(r => ({ label: r.title, value: r.id }))}
                                selected={selectedRoutineIds}
                                onChange={(vals) => {
                                    setSelectedRoutineIds(vals);
                                    setIsLayoutDirty(true);
                                }}
                                placeholder="Rotinas Manuais..."
                            />
                        </div>

                        <div className="w-[140px] shrink-0">
                            <MultiSelect
                                options={frequencyOptions}
                                selected={frequencyFilter}
                                onChange={(vals) => {
                                    setFrequencyFilter(vals);
                                    setIsLayoutDirty(true);
                                }}
                                placeholder="Frequências..."
                            />
                        </div>

                        {/* Botão de salvar vista para Gestores/Admin */}
                        {isGestorOrAdmin && (
                            <div className="ml-auto mr-1 shrink-0">
                                <Button
                                    size="sm"
                                    variant={singleSectorId ? "default" : "secondary"}
                                    disabled={saveSettings.isPending}
                                    onClick={handleSaveGlobalView}
                                    className="gap-1.5 h-8 text-xs px-3"
                                >
                                    {saveSettings.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {singleSectorId ? "Salvar Local" : "Salvar Global"}
                                </Button>
                            </div>
                        )}

                        <div className={`flex items-center gap-1 bg-secondary/30 rounded-md p-0.5 border shrink-0 ${isGestorOrAdmin ? '' : 'ml-auto'}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrevMonth}>
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </Button>
                            <span className="font-semibold text-xs min-w-[110px] text-center capitalize">
                                {format(currentDate, 'MMM yyyy', { locale: ptBR })}
                            </span>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNextMonth}>
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0 pb-2 px-0 sm:px-2 flex flex-col">
                {isLoadingUnits || isLoadingTasks ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : routinesData.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground border-t border-dashed m-4 rounded-lg">
                        <FileSpreadsheet className="w-12 h-12 mb-4 opacity-20" />
                        <p>Nenhuma rotina correspondente encontrada com calendário neste mês.</p>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-auto border custom-scrollbar m-2 shadow-inner bg-card relative">
                        <style dangerouslySetInnerHTML={{
                            __html: `
                            .custom-scrollbar::-webkit-scrollbar { width: 10px; height: 12px; }
                            .custom-scrollbar::-webkit-scrollbar-track { background: hsl(var(--secondary) / 0.5); }
                            .custom-scrollbar::-webkit-scrollbar-thumb { background: hsl(var(--primary) / 0.2); border-radius: 6px; border: 2px solid hsl(var(--secondary) / 0.5); }
                            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: hsl(var(--primary) / 0.4); }
                            
                            .matrix-table th, .matrix-table td {
                                border-right-width: 1px;
                                border-bottom-width: 1px;
                                border-color: rgba(150, 150, 150, 0.2);
                            }
                            .matrix-table .sticky-col-1 { position: sticky; left: 0; z-index: 20; }
                            .matrix-table .sticky-col-2 { position: sticky; left: 140px; z-index: 20; border-right-width: 2px; border-right-color: rgba(150, 150, 150, 0.4); }
                            
                            /* Maintain headers over sticky cols */
                            .matrix-table thead { position: sticky; top: 0; z-index: 40; }
                            .matrix-table thead .sticky-col-1 { z-index: 50; }
                            .matrix-table thead .sticky-col-2 { z-index: 50; }
                        `}} />
                        <div className="relative w-full" style={{ minHeight: maxHeight }}>
                            {/* BODY REPEATED PER ROUTINE */}
                            {sortedRoutinesData.map(({ routine, matrix, dailyStats, timeRange }, rIndex) => {
                                const l = layouts[routine.id] || { x: rIndex * 50, y: rIndex * 50, width: 400, height: 250 };

                                const getFrequencyColor = (freq: string | undefined) => {
                                    switch (freq) {
                                        case 'diaria': return '#f08c16';
                                        case 'semanal': return '#ef4444'; // red-500
                                        case 'quinzenal': return '#6b7280'; // gray-500
                                        case 'mensal': return '#22c55e'; // green-500
                                        default: return '#f08c16';
                                    }
                                };
                                const bannerColor = getFrequencyColor(routine.frequency);

                                return (
                                    <Rnd
                                        key={routine.id}
                                        position={{ x: l.x, y: l.y }}
                                        size={{ width: l.width, height: l.height }}
                                        onDragStop={(e, d) => updateLayout(routine.id, { x: d.x, y: d.y })}
                                        onResizeStop={(e, direction, ref, delta, position) => {
                                            updateLayout(routine.id, {
                                                width: parseInt(ref.style.width, 10),
                                                height: parseInt(ref.style.height, 10),
                                                ...position
                                            });
                                        }}
                                        dragHandleClassName="drag-handle"
                                        minWidth={300}
                                        minHeight={150}
                                        bounds="parent"
                                        className="border border-border rounded-md shadow-sm bg-background overflow-hidden flex flex-col z-10"
                                    >
                                        <div className="w-full h-full overflow-auto custom-scrollbar pb-1 flex flex-col">
                                            <table className="matrix-table w-full text-xs font-sans min-w-max border-separate border-spacing-0 relative pb-4">
                                                {/* INDIVIDUAL THEAD FOR DATES PER ROUTINE */}
                                                <thead className="bg-background shadow-sm">
                                                    <tr>
                                                        <th
                                                            className="drag-handle sticky-col-1 text-white dark:text-black font-bold p-1 px-2 text-center uppercase text-[10px] w-[140px] min-w-[140px] max-w-[140px] whitespace-normal break-words cursor-move transition-colors group relative"
                                                            style={{ backgroundColor: bannerColor }}
                                                        >
                                                            <div className="absolute left-1 top-1/2 -translate-y-1/2 text-white/50 dark:text-black/50 group-hover:text-white dark:group-hover:text-black">
                                                                <GripVertical className="w-4 h-4" />
                                                            </div>
                                                            ROTINAS
                                                        </th>
                                                        <th
                                                            className="sticky-col-2 text-white dark:text-black font-bold p-1 text-center uppercase text-[10px] w-[180px] min-w-[180px] max-w-[180px] whitespace-normal"
                                                            style={{ backgroundColor: bannerColor }}
                                                        >
                                                            {/* Blank space */}
                                                        </th>
                                                        {daysInMonth.map(day => (
                                                            <th key={`d-${day.toISOString()}`} className="bg-muted border-b border-[#ddd] text-muted-foreground font-semibold p-1 w-[26px] min-w-[26px] text-center text-[10px]">
                                                                {format(day, 'dd/M')}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                    <tr>
                                                        <th className="sticky-col-1 bg-[#e2e2e2] dark:bg-muted text-black dark:text-foreground font-bold p-1 px-2 text-center text-[9px] uppercase">
                                                            FILTRO C/ {routinesData.length} ROTINA(S)
                                                        </th>
                                                        <th className="sticky-col-2 bg-[#e2e2e2] dark:bg-muted text-black dark:text-foreground font-bold p-1 px-2 text-center text-[9px] uppercase">
                                                        </th>
                                                        {daysInMonth.map(day => (
                                                            <th key={`w-${day.toISOString()}`} className="bg-[#e2e2e2] dark:bg-secondary/40 text-muted-foreground font-medium p-1 text-center text-[9px] uppercase">
                                                                {format(day, 'EE', { locale: ptBR }).substring(0, 3)}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {/* Routine Info Header Row */}
                                                    <tr>
                                                        <th className="sticky-col-1 bg-white dark:bg-background text-black dark:text-foreground font-bold p-1.5 text-center text-[10px] uppercase border-t-2 border-[#888] align-top relative w-[140px] min-w-[140px] max-w-[140px] whitespace-normal break-words">
                                                            HORÁRIO
                                                            <div className="text-[9px] font-normal text-muted-foreground mt-0.5 whitespace-nowrap">
                                                                {timeRange}
                                                            </div>
                                                        </th>
                                                        <th
                                                            className="sticky-col-2 bg-black font-bold p-1.5 text-center text-[11px] leading-tight border-t-2 border-[#888] w-[180px] min-w-[180px] max-w-[180px] break-words whitespace-normal align-middle cursor-pointer hover:bg-[#1a1a1a] transition-colors"
                                                            style={{ color: bannerColor }}
                                                            onClick={() => handleEmptyCellClick(routine, new Date())}
                                                        >
                                                            {routine.title}
                                                        </th>

                                                        {dailyStats.map((stat, i) => {
                                                            const pct = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : null;
                                                            const bgClass = 'bg-[#df7d70] text-black cursor-pointer hover:opacity-90';
                                                            return (
                                                                <th key={`pct-${i}`} onClick={() => handleEmptyCellClick(routine, daysInMonth[i])} className={`font-medium p-1 text-center text-[9px] ${bgClass} border-t-2 border-[#888] align-top`}>
                                                                    <div className="mt-1.5">{pct !== null ? `${pct}%` : '0%'}</div>
                                                                </th>
                                                            );
                                                        })}
                                                    </tr>

                                                    {/* Routine Checkpoint Header Row */}
                                                    <tr>
                                                        <th className="sticky-col-1 bg-white dark:bg-background p-0 m-0 align-middle w-[140px] min-w-[140px] max-w-[140px]">
                                                            <div className="text-[10px] font-bold text-muted-foreground uppercase text-center w-full">
                                                                DESCRIÇÃO
                                                            </div>
                                                        </th>
                                                        <th className="sticky-col-2 bg-white dark:bg-background p-0 px-1 w-[180px] min-w-[180px] max-w-[180px]">
                                                            <div className="bg-[#f08c16] text-black font-bold p-1 px-2 text-left text-[10px] uppercase rounded-sm mx-1 my-1">
                                                                UNIDADES
                                                            </div>
                                                        </th>
                                                        {
                                                            dailyStats.map((stat, i) => {
                                                                const info = dailyStats[i];
                                                                return (
                                                                    <th key={`b-${i}`} onClick={() => handleEmptyCellClick(routine, daysInMonth[i])} className="bg-black border-[#444] border-r border-b p-0.5 cursor-pointer hover:bg-[#222]">
                                                                        {info.total > 0 ? (
                                                                            <div className="text-[9px] text-white text-center font-normal">{Math.round((info.completed / info.total) * 100)}%</div>
                                                                        ) : (
                                                                            <div className="text-[9px] text-[#888] text-center font-normal">0%</div>
                                                                        )}
                                                                    </th>
                                                                );
                                                            })
                                                        }
                                                    </tr>

                                                    {/* Routine Units Rows */}
                                                    {matrix.map((row, rowIndex) => (
                                                        <tr key={row.unit.id} className="hover:bg-accent/30 transition-colors group h-full">
                                                            {rowIndex === 0 && (
                                                                <td rowSpan={matrix.length} className="sticky-col-1 bg-white dark:bg-background p-3 align-middle text-center text-[10px] font-medium group-hover:bg-background border-r-2 border-[#888] w-[140px] min-w-[140px] max-w-[140px] break-words whitespace-normal">
                                                                    <div className="whitespace-normal break-words mt-1 flex flex-col justify-center h-full min-h-[40px]">
                                                                        {routine.description || 'Acompanhamento da Rotina.'}
                                                                    </div>
                                                                </td>
                                                            )}
                                                            <td className="sticky-col-2 bg-white dark:bg-background p-1 px-2 font-medium text-[10px] break-words whitespace-normal leading-tight overflow-hidden group-hover:bg-accent/10 border-r-2 border-[#888] w-[180px] min-w-[180px] max-w-[180px] align-middle" title={row.unit.name}>
                                                                {row.unit.name}
                                                            </td>
                                                            {row.days.map((task, colIndex) => {
                                                                if (task === null) return <td key={colIndex} className="p-0.5 text-center bg-black border-[#222]"></td>;
                                                                if (task === 'empty') return <td key={colIndex} onClick={() => handleEmptyCellClick(routine, daysInMonth[colIndex])} className="p-0.5 text-center text-muted-foreground/30 font-light text-[9px] bg-white dark:bg-card border-dotted border-gray-100 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors">-</td>;

                                                                let displayChar: React.ReactNode = '?';
                                                                let bgClass = '';

                                                                if (task.status === 'concluida') { displayChar = <Check className="w-3.5 h-3.5 stroke-[3]" />; bgClass = 'bg-[#43a047] text-white border-b-2 border-b-[#2e7d32] shadow-sm'; }
                                                                else if (task.status === 'nao_aplicavel') { displayChar = <Check className="w-3.5 h-3.5 stroke-[3]" />; bgClass = 'bg-[#0A3D14] text-white border-b-2 border-b-[#05260A] shadow-sm'; }
                                                                else if (task.status === 'atrasada') { displayChar = <XIcon className="w-3.5 h-3.5 stroke-[3]" />; bgClass = 'bg-[#e53935] text-white border-b-2 border-b-[#c62828] shadow-sm'; }
                                                                else if (task.status === 'cancelada') { displayChar = 'C'; bgClass = 'bg-gray-500 text-white border-b-2 border-b-gray-700 shadow-sm'; }
                                                                else { displayChar = <Minus className="w-3.5 h-3.5 stroke-[3]" />; bgClass = 'bg-[#fb8c00] text-white border-b-2 border-b-[#ef6c00] shadow-sm'; }

                                                                const isAllowed = canUserAccessTask(task);
                                                                const cellContent = (
                                                                    <div
                                                                        onClick={() => handleTaskClick(task, routine)}
                                                                        className={`flex items-center justify-center w-[20px] h-[16px] mx-auto rounded-[2px] ${isAllowed ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-90'} transition-opacity ${bgClass}`}
                                                                        title={task.status !== 'concluida' ? `Status: ${task.status}\nRotina: ${routine.title}\nVencimento: ${format(parseISO(task.due_date), 'dd/MM/yyyy')}` : undefined}
                                                                    >
                                                                        {displayChar}
                                                                    </div>
                                                                );

                                                                return (
                                                                    <td key={colIndex} className="p-0">
                                                                        <div className="h-full w-full min-h-[22px] p-0.5 flex items-center justify-center bg-white dark:bg-card hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors">
                                                                            {task.status === 'concluida' ? (
                                                                                <HoverCard openDelay={200} closeDelay={300}>
                                                                                    <HoverCardTrigger asChild>
                                                                                        {cellContent}
                                                                                    </HoverCardTrigger>
                                                                                    <HoverCardContent className="w-[280px] max-w-[90vw] p-4 z-[100] shadow-xl border-accent" side="top" align="center">
                                                                                        <TaskHoverCard
                                                                                            task={task}
                                                                                            routine={routine}
                                                                                            isAllowed={isAllowed}
                                                                                            handleReopenTask={handleReopenTask}
                                                                                            updateTaskMutationPending={updateTaskMutation.isPending}
                                                                                        />
                                                                                    </HoverCardContent>
                                                                                </HoverCard>
                                                                            ) : cellContent}
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </Rnd>
                                );
                            })}
                        </div>
                    </div>
                )}
            </CardContent>

            <Sheet open={!!selectedRoutineForPanel} onOpenChange={(open) => { if (!open) setSelectedRoutineForPanel(null); }}>
                <SheetContent className="sm:max-w-xl w-[90vw] p-0" side="right">
                    {selectedRoutineForPanel && (
                        <div className="h-full overflow-y-auto">
                            <RoutineDetailPanel
                                routine={selectedRoutineForPanel.routine}
                                contextDate={selectedRoutineForPanel.date}
                                exactDate={selectedRoutineForPanel.exactDate}
                                onClose={() => setSelectedRoutineForPanel(null)}
                            />
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </Card >
    );
};
