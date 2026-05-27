import { useState, useEffect } from 'react';
import { Building2, Users, Loader2, CheckCircle2, Maximize2, X, ExternalLink } from 'lucide-react';
import { useOverallStats } from '@/hooks/useDashboardData';
import { useDashboardPanels } from '@/hooks/useDashboardPanels';
import { useTasks } from '@/hooks/useTasks';
import { useIsAdmin } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PanelFormDialog } from '@/components/dashboard/PanelFormDialog';
import { CustomPanel } from '@/components/dashboard/CustomPanel';
import { UnifiedDraggablePanels } from '@/components/dashboard/UnifiedDraggablePanels';
import { TaskTrackerPanel } from '@/components/dashboard/TaskTrackerPanel';


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

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
  cancelada: 'Cancelada',
};

interface StatusData {
  completed: number;
  pending: number;
  total: number;
}

interface TasksDialogState {
  isOpen: boolean;
  title: string;
  entityId: string;
  entityType: 'unit' | 'responsible';
  frequency: string;
}

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

interface ResizablePanelProps {
  title: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
  defaultHeight?: number;
  defaultWidth?: string;
}

const ResizablePanel = ({ title, icon: Icon, count, children, defaultHeight = 280, defaultWidth = '100%' }: ResizablePanelProps) => {
  return (
    <div
      className="rounded-lg border border-border bg-card overflow-hidden flex flex-col resize"
      style={{
        minHeight: 150,
        minWidth: 280,
        height: defaultHeight,
        width: defaultWidth,
        maxWidth: '100%'
      }}
    >
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30 flex-shrink-0">
        <Icon className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">{title}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{count}</span>
      </div>
      <div className="overflow-auto flex-1">
        {children}
      </div>
    </div>
  );
};

// Tasks Dialog Component
interface TasksDialogProps {
  state: TasksDialogState;
  onClose: () => void;
  sectorId?: string | null;
}

const TasksDialog = ({ state, onClose, sectorId }: TasksDialogProps) => {
  const { data: allTasks, isLoading } = useTasks(undefined, { enabled: state.isOpen });

  // Filter tasks based on entity type and frequency
  const filteredTasks = allTasks?.filter((task: any) => {
    // Filter by entity (unit or responsible)
    if (state.entityType === 'unit') {
      if (task.unit_id !== state.entityId) return false;
    } else {
      if (task.assigned_to !== state.entityId) return false;
    }

    // Filter by sector if selected
    if (sectorId && task.sector_id !== sectorId) return false;

    // Filter by frequency (through routine)
    // Note: We need to check if the task has a routine with the matching frequency
    // For now, we show all tasks for the entity since we don't have routine data here
    // This will be filtered in the hook if needed

    return true;
  }) || [];

  return (
    <Dialog open={state.isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state.entityType === 'unit' ? (
              <Building2 className="w-5 h-5 text-primary" />
            ) : (
              <Users className="w-5 h-5 text-primary" />
            )}
            {state.title}
            {state.frequency && (
              <Badge variant="secondary" className="ml-2">
                {FREQUENCY_FULL_LABELS[state.frequency] || state.frequency}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma tarefa encontrada
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task: any) => (
                <div
                  key={task.id}
                  className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        task.status === 'concluida' ? 'default' :
                          task.status === 'atrasada' ? 'destructive' :
                            task.status === 'em_andamento' ? 'secondary' :
                              'outline'
                      }
                      className="shrink-0"
                    >
                      {STATUS_LABELS[task.status] || task.status}
                    </Badge>
                  </div>
                  {task.due_date && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Prazo: {new Date(task.due_date).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog >
  );
};

import { useSectors } from '@/hooks/useSectors';

export interface DashboardViewProps {
  forcedSectorId?: string;
  hideHeader?: boolean;
}

export const DashboardView = ({ forcedSectorId, hideHeader }: DashboardViewProps) => {
  const { user } = useAuth();

  // State for multi-sector filtering
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>(() => {
    if (forcedSectorId) return [forcedSectorId];
    try {
      const stored = localStorage.getItem('dashboard_global_sector_filters');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Track the layout context based strictly on forcedSectorId or 'global'
  const contextIdentifier = forcedSectorId || 'global';

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('public');
  const [tasksDialog, setTasksDialog] = useState<TasksDialogState>({
    isOpen: false,
    title: '',
    entityId: '',
    entityType: 'unit',
    frequency: '',
  });

  // Effect to update if forcedSectorId changes
  useEffect(() => {
    if (forcedSectorId) {
      setSelectedSectorIds([forcedSectorId]);
    }
  }, [forcedSectorId]);

  // Save to localstorage when changes
  useEffect(() => {
    if (!forcedSectorId) {
      localStorage.setItem('dashboard_global_sector_filters', JSON.stringify(selectedSectorIds));
    }
  }, [selectedSectorIds, forcedSectorId]);

  const { data: sectors } = useSectors();
  const { data: statsData, isLoading } = useOverallStats(selectedSectorIds);
  const unitStatus = statsData?.unitStatus || [];
  const responsibleStatus = statsData?.responsibleStatus || [];
  const { data: customPanels } = useDashboardPanels();
  const { isAdmin } = useIsAdmin();

  const overallPercentage = statsData?.percentage || 0;

  const filteredPanels = customPanels?.filter(panel => {
    // Backwards compatibility: if dashboard_context doesn't exist, try to infer from sector_id or treat as global
    let panelContext = panel.filters?.dashboard_context;

    if (!panelContext) {
      if (panel.filters?.sector_id && typeof panel.filters.sector_id === 'string') {
        panelContext = panel.filters.sector_id;
      } else {
        panelContext = 'global';
      }
    }

    if (panelContext !== contextIdentifier) return false;

    // Permissions checking
    if (activeTab === 'public') {
      return !panel.is_private;
    } else {
      return panel.is_private && panel.user_id === user?.id;
    }
  }) || [];

  const openTasksDialog = (
    entityId: string,
    entityName: string,
    entityType: 'unit' | 'responsible',
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

  // Fullscreen view
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-auto">
        {/* Fullscreen Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-8 py-4 flex items-center justify-between">

          <h1 className="text-2xl font-bold text-foreground">Gerenciamento de Rotinas</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullscreen(false)}
            className="hover:bg-destructive/10"
          >
            <X className="h-5 w-5" />
          </Button>
        </header>

        {/* Fullscreen Content */}
        <div className="p-8 space-y-6">
          {/* Tabs for fullscreen */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[500px]">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="public">Dashboard Público</TabsTrigger>
              <TabsTrigger value="private">Meu Dashboard Privado</TabsTrigger>
              <TabsTrigger value="tracker">Rastreador de Tarefas</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Custom Panels */}
          {customPanels && customPanels.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              {customPanels.map(panel => (
                <CustomPanel key={panel.id} panel={panel} dashboardSectorId={selectedSectorIds[0] || undefined} />
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span><b>D</b>=Diária <b>S</b>=Semanal <b>Q</b>=Quinzenal <b>M</b>=Mensal</span>
                <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-success/30" />100%</span>
                <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/30" />≥70%</span>
                <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-warning/30" />≥40%</span>
                <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-destructive/30" />&lt;40%</span>
              </div>

              {/* Custom Panels */}
              {filteredPanels && filteredPanels.length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                  {filteredPanels.map(panel => (
                    <CustomPanel key={panel.id} panel={panel} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-card rounded-lg border border-border border-dashed">
                  <p className="text-lg font-medium">Nenhum painel configurado</p>
                  <p className="text-sm">Vá até as Engrenagens do Topo Direto ou '+' para adicionar painéis customizados.</p>
                </div>
              )}
            </>
          )}

          {/* Tasks Dialog */}
          <TasksDialog
            state={tasksDialog}
            onClose={closeTasksDialog}
            sectorId={selectedSectorIds[0] || undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", activeTab === 'tracker' ? "overflow-hidden" : "overflow-auto space-y-3")}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
          <div className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
            overallPercentage >= 70 ? 'bg-success/20 text-success' :
              overallPercentage >= 40 ? 'bg-warning/20 text-warning' :
                'bg-destructive/20 text-destructive'
          )}>
            {overallPercentage}%
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[450px] hidden sm:block">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="public">Público</TabsTrigger>
              <TabsTrigger value="private">Minha Visão</TabsTrigger>
              <TabsTrigger value="tracker">Rastreador</TabsTrigger>
            </TabsList>
          </Tabs>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsFullscreen(true)}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Tela cheia</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {isAdmin && <PanelFormDialog panelCount={filteredPanels?.length || 0} dashboardContext={contextIdentifier} />}

          {!forcedSectorId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2 border-dashed font-normal">
                  Filtro Setor
                  {selectedSectorIds.length > 0 && (
                    <Badge variant="secondary" className="px-1 rounded-sm text-[10px] h-4">
                      {selectedSectorIds.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuLabel>Filtrar por Setor</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={selectedSectorIds.length === 0}
                  onCheckedChange={() => setSelectedSectorIds([])}
                >
                  <span className="font-semibold text-primary">Todos</span>
                </DropdownMenuCheckboxItem>
                {sectors?.map(sector => (
                  <DropdownMenuCheckboxItem
                    key={sector.id}
                    checked={selectedSectorIds.includes(sector.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedSectorIds(prev => [...prev, sector.id]);
                      } else {
                        setSelectedSectorIds(prev => prev.filter(id => id !== sector.id));
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sector.color || '#6366f1' }} />
                      {sector.name}
                    </div>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className={cn("flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap", activeTab === 'tracker' ? "hidden" : "flex-shrink-0")}>
        <span><b>D</b>=Diária <b>S</b>=Semanal <b>Q</b>=Quinzenal <b>M</b>=Mensal</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-success/30" />100%</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-emerald-500/30" />≥70%</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-warning/30" />≥40%</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-destructive/30" />&lt;40%</span>
      </div>

      {activeTab === 'tracker' ? (
        <div className="mt-4 flex-1 overflow-hidden min-h-0 flex flex-col border rounded-lg bg-card shadow-sm">
          <TaskTrackerPanel sectorIds={selectedSectorIds} />
        </div>
      ) : (
        /* All Panels with Unified Drag and Drop */
        <UnifiedDraggablePanels
          customPanels={customPanels || []}
          selectedSectorId={selectedSectorIds[0] || undefined}
          renderUnitsPanel={() => (
            <ResizablePanel title="Unidades" icon={Building2} count={unitStatus?.length || 0}>
              {unitStatus?.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-xs">Sem dados</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-medium text-muted-foreground">Nome</th>
                      {FREQUENCIES.map(f => <th key={f} className="p-1 text-center font-medium text-muted-foreground w-9">{FREQUENCY_LABELS[f]}</th>)}
                      <th className="p-2 text-right font-medium text-muted-foreground w-10">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {unitStatus?.map(unit => (
                      <tr key={unit.id} className="hover:bg-secondary/20">
                        <td className="p-2">
                          <p className="font-medium text-foreground" title={unit.name}>{unit.name}</p>
                        </td>
                        {FREQUENCIES.map(f => (
                          <td key={f} className="p-1 text-center">
                            <StatusBadge 
                              data={unit.frequencies[f]} 
                              frequency={f}
                              onClick={unit.frequencies[f].total > 0 
                                ? () => openTasksDialog(unit.id, unit.name, 'unit', f)
                                : undefined
                              }
                            />
                          </td>
                        ))}
                        <td className="p-2 text-right"><TotalBadge data={unit.totals} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ResizablePanel>
          )}
          renderResponsiblesPanel={() => (
            <ResizablePanel title="Responsáveis" icon={Users} count={responsibleStatus?.length || 0}>
              {responsibleStatus?.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-xs">Sem dados</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-medium text-muted-foreground">Nome</th>
                      {FREQUENCIES.map(f => <th key={f} className="p-1 text-center font-medium text-muted-foreground w-9">{FREQUENCY_LABELS[f]}</th>)}
                      <th className="p-2 text-right font-medium text-muted-foreground w-10">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {responsibleStatus?.map(person => (
                      <tr key={person.id} className="hover:bg-secondary/20">
                        <td className="p-2">
                          <p className="font-medium text-foreground" title={person.name}>{person.name}</p>
                        </td>
                        {FREQUENCIES.map(f => (
                          <td key={f} className="p-1 text-center">
                            <StatusBadge 
                              data={person.frequencies[f]} 
                              frequency={f}
                              onClick={person.frequencies[f].total > 0 
                                ? () => openTasksDialog(person.id, person.name, 'responsible', f)
                                : undefined
                              }
                            />
                          </td>
                        ))}
                        <td className="p-2 text-right"><TotalBadge data={person.totals} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ResizablePanel>
          )}
        />
      )}
    </div>
  );
};
