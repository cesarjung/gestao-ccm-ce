import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSectors } from '@/hooks/useSectors';
import { useUnits } from '@/hooks/useUnits';
import { useRoutines } from '@/hooks/useRoutines';
import { useCreateDashboardPanel, useUpdateDashboardPanel, PanelFilters, DashboardPanel } from '@/hooks/useDashboardPanels';
import { MultiSelect } from '@/components/ui/multi-select';

const STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'atrasada', label: 'Atrasada' },
  { value: 'cancelada', label: 'Cancelada' },
];

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta Semana' },
  { value: 'month', label: 'Este Mês' },
  { value: 'quarter', label: 'Este Trimestre' },
  { value: 'year', label: 'Este Ano' },
  { value: 'all', label: 'Todos' },
];

const GROUP_BY_OPTIONS = [
  { value: 'unit', label: 'Por Unidade' },
  { value: 'responsible', label: 'Por Responsável' },
  { value: 'sector', label: 'Por Setor' },
  { value: 'task', label: 'Por Tarefa' },
  { value: 'task_matrix', label: 'Por Data (Legado)' },
  { value: 'tracker_gantt', label: 'Rastreador Matriz (Gantt)' },
];

interface PanelFormDialogProps {
  panel?: DashboardPanel;
  panelCount?: number;
  trigger?: React.ReactNode;
  dashboardContext?: string | null;
}

export const PanelFormDialog = ({ panel, panelCount = 0, trigger, dashboardContext }: PanelFormDialogProps) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(panel?.title || '');
  const [isPrivate, setIsPrivate] = useState(panel?.is_private || false);

  // Initialize ids as array, handling legacy string values
  const [sectorIds, setSectorIds] = useState<string[]>(
    Array.isArray(panel?.filters.sector_id)
      ? panel.filters.sector_id
      : panel?.filters.sector_id
        ? [panel.filters.sector_id]
        : []
  );

  const [unitIds, setUnitIds] = useState<string[]>(
    Array.isArray(panel?.filters.unit_id)
      ? panel.filters.unit_id
      : panel?.filters.unit_id
        ? [panel.filters.unit_id]
        : []
  );

  const [selectedStatus, setSelectedStatus] = useState<string[]>(panel?.filters.status || []);
  const [selectedFrequencies, setSelectedFrequencies] = useState<string[]>(panel?.filters.task_frequency || []);
  // title_filter can be a string (legacy) or an array of strings
  const [selectedTitles, setSelectedTitles] = useState<string[]>(
    Array.isArray(panel?.filters.title_filter)
      ? panel.filters.title_filter
      : panel?.filters.title_filter
        ? [panel.filters.title_filter]
        : []
  );
  const [period, setPeriod] = useState<string>(panel?.filters.period || 'all');
  const [groupBy, setGroupBy] = useState<'unit' | 'responsible' | 'sector' | 'task' | 'task_matrix' | 'tracker_gantt'>(
    (panel?.filters.group_by as 'unit' | 'responsible' | 'sector' | 'task' | 'task_matrix' | 'tracker_gantt') || 'unit'
  );

  const { data: sectors } = useSectors();
  const { data: units } = useUnits();
  const { data: routines } = useRoutines();
  const createPanel = useCreateDashboardPanel();
  const updatePanel = useUpdateDashboardPanel();

  const handleStatusToggle = (status: string) => {
    setSelectedStatus(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleFrequencyToggle = (status: string) => {
    setSelectedFrequencies(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleSubmit = () => {
    if (!title.trim()) return;

    // Filter out generic strings that break custom panel views
    const cleanSectorIds = sectorIds.filter(id => id && id.toLowerCase() !== 'todos os setores' && id.toLowerCase() !== 'selecionar todos');
    const cleanUnitIds = unitIds.filter(id => id && id.toLowerCase() !== 'todas as unidades' && id.toLowerCase() !== 'selecionar todos');
    const cleanTitles = selectedTitles.filter(t => t && t.toLowerCase() !== 'todas as rotinas' && t.toLowerCase() !== 'todas as tarefas' && t.toLowerCase() !== 'selecionar todos');

    const filters: PanelFilters = {
      sector_id: cleanSectorIds.length > 0 ? cleanSectorIds : undefined,
      unit_id: cleanUnitIds.length > 0 ? cleanUnitIds : undefined,
      status: selectedStatus.length > 0 ? selectedStatus : undefined,
      task_frequency: selectedFrequencies.length > 0 ? selectedFrequencies : undefined,
      title_filter: (cleanTitles.length > 0 ? cleanTitles : undefined) as any,
      period: period as PanelFilters['period'],
      group_by: groupBy,
      dashboard_context: panel ? panel.filters.dashboard_context : (dashboardContext || 'global')
    };

    if (panel) {
      updatePanel.mutate({
        id: panel.id,
        title,
        filters,
        is_private: isPrivate
      }, {
        onSuccess: () => setOpen(false)
      });
    } else {
      createPanel.mutate({
        title,
        panel_type: 'summary',
        filters,
        display_config: {},
        order_index: panelCount,
        is_private: isPrivate
      }, {
        onSuccess: () => {
          setOpen(false);
          resetForm();
        }
      });
    }
  };

  const resetForm = () => {
    setTitle('');
    setIsPrivate(false);
    setSectorIds([]);
    setUnitIds([]);
    setSelectedStatus([]);
    setSelectedFrequencies([]);
    setSelectedTitles([]);
    setPeriod('all');
    setGroupBy('unit');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="gap-1">
            <Plus className="w-4 h-4" />
            Novo Painel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{panel ? 'Editar Painel' : 'Criar Painel Customizado'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">Nome do Painel</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Tarefas Atrasadas por Unidade"
            />
          </div>

          <div className="space-y-2">
            <Label>Filtrar por Nome da Tarefa (Rotina)</Label>
            <MultiSelect
              options={
                Array.from(new Set(routines?.map(r => r.title) || [])).sort().map(title => ({
                  label: title,
                  value: title
                }))
              }
              selected={selectedTitles}
              onChange={setSelectedTitles}
              placeholder="Todas as tarefas"
              searchPlaceholder="Buscar tarefa..."
              selectAllLabel="Todas as Rotinas"
              selectedPluralLabel="Rotinas Sel."
            />
          </div>

          <div className="space-y-2">
            <Label>Agrupar por / Modo de Exibição</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'unit' | 'responsible' | 'sector' | 'task' | 'task_matrix' | 'tracker_gantt')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_BY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Filtrar por Setor</Label>
            <MultiSelect
              options={sectors?.map(s => ({
                label: s.name,
                value: s.id,
                icon: ({ className }) => <div className={`w-2 h-2 rounded-full mr-2 ${className}`} style={{ backgroundColor: s.color || '#6366f1' }} />
              })) || []}
              selected={sectorIds}
              onChange={setSectorIds}
              placeholder="Todos os setores"
              searchPlaceholder="Buscar setor..."
              selectAllLabel="Todos os Setores"
              selectedPluralLabel="Setores Sel."
            />
          </div>

          <div className="space-y-2">
            <Label>Filtrar por Unidade</Label>
            <MultiSelect
              options={units?.map(u => ({ label: u.name, value: u.id })) || []}
              selected={unitIds}
              onChange={setUnitIds}
              placeholder="Todas as unidades"
              searchPlaceholder="Buscar unidade..."
              selectAllLabel="Todas as Unidades"
              selectedPluralLabel="Unidades Sel."
            />
          </div>

          <div className="space-y-2">
            <Label>Frequência da Rotina</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'diaria', label: 'Diária' },
                { value: 'semanal', label: 'Semanal' },
                { value: 'quinzenal', label: 'Quinzenal' },
                { value: 'mensal', label: 'Mensal' },
              ].map(opt => (
                <div key={opt.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`freq-${opt.value}`}
                    checked={selectedFrequencies.includes(opt.value)}
                    onCheckedChange={() => handleFrequencyToggle(opt.value)}
                  />
                  <Label htmlFor={`freq-${opt.value}`} className="text-sm font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
            {selectedFrequencies.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma selecionada = todas as frequências</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Status das Tarefas</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(opt => (
                <div key={opt.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`status-${opt.value}`}
                    checked={selectedStatus.includes(opt.value)}
                    onCheckedChange={() => handleStatusToggle(opt.value)}
                  />
                  <Label htmlFor={`status-${opt.value}`} className="text-sm font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
            {selectedStatus.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum selecionado = todos os status</p>
            )}
          </div>

          <div className="flex items-center space-x-2 pt-2 border-t border-border">
            <Switch
              id="private-panel"
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
            />
            <Label htmlFor="private-panel" className="text-sm font-normal">
              Painel Privado (Apenas eu e admins podemos ver)
            </Label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || createPanel.isPending || updatePanel.isPending}>
            {panel ? 'Salvar' : 'Criar Painel'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
