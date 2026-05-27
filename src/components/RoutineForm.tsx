import { useState, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Loader2, Users, Check, CalendarIcon, Clock, RefreshCw } from 'lucide-react';
import { useCreateRoutineWithUnits } from '@/hooks/useRoutineMutations';
import { useUnits } from '@/hooks/useUnits';
import { useProfiles } from '@/hooks/useProfiles';
import { useUnitManagers } from '@/hooks/useUnitManagers';
import { useIsGestorOrAdmin } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { MultiAssigneeSelect } from '@/components/MultiAssigneeSelect';
import type { Enums } from '@/integrations/supabase/types';

type TaskFrequency = Enums<'task_frequency'>;

interface UnitAssignment {
  unitId: string;
  assignedToIds: string[];
}

const frequencyOptions: { value: TaskFrequency; label: string }[] = [
  { value: 'diaria', label: 'Diária' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
];

const recurrenceModeOptions = [
  { value: 'schedule', label: 'Por Cronograma', description: 'Cria automaticamente um dia antes' },
  { value: 'on_completion', label: 'Ao Concluir', description: 'Cria quando a atual for concluída' },
];

const formSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  priority: z.number().min(1).max(5),
  startDate: z.date().optional(),
  startTime: z.string().optional(),
  dueDate: z.date().optional(),
  dueTime: z.string().optional(),
  isRecurring: z.boolean(),
  recurrenceFrequency: z.enum(['diaria', 'semanal', 'quinzenal', 'mensal'] as const).optional(),
  recurrenceMode: z.enum(['schedule', 'on_completion'] as const).optional(),
  repeatForever: z.boolean().optional(),
  recurrenceEndDate: z.date().optional(),
  skipWeekendsHolidays: z.boolean().optional(),
  monthlyAnchor: z.enum(['date', 'weekday'] as const).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface RoutineFormProps {
  sectorId?: string;
  onSuccess?: () => void;
}

export const RoutineForm = ({ sectorId, onSuccess }: RoutineFormProps) => {
  const [open, setOpen] = useState(false);
  const [unitAssignments, setUnitAssignments] = useState<UnitAssignment[]>([]);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [parentAssignees, setParentAssignees] = useState<string[]>([]);

  const { user } = useAuth();
  const { isGestorOrAdmin } = useIsGestorOrAdmin();
  const createRoutine = useCreateRoutineWithUnits();
  const { data: units, isLoading: loadingUnits } = useUnits();
  const { data: allProfiles } = useProfiles();
  const { data: unitManagers } = useUnitManagers();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 1,
      startDate: undefined,
      startTime: '',
      dueDate: undefined,
      dueTime: '',
      isRecurring: false,
      recurrenceFrequency: 'semanal',
      recurrenceMode: 'schedule',
      repeatForever: true,
      recurrenceEndDate: undefined,
      skipWeekendsHolidays: false,
      monthlyAnchor: 'date',
    },
  });

  const isRecurring = form.watch('isRecurring');
  const repeatForever = form.watch('repeatForever');

  const selectedUnitIds = useMemo(() => unitAssignments.map(a => a.unitId), [unitAssignments]);
  const selectedSet = useMemo(() => new Set(selectedUnitIds), [selectedUnitIds]);

  const getProfilesForUnit = useCallback((unitId: string) => {
    if (!allProfiles) return [];
    const managerUserIds = unitManagers
      ?.filter(um => um.unit_id === unitId)
      ?.map(um => um.user_id) || [];
    return allProfiles.filter(p =>
      p.unit_id === unitId || managerUserIds.includes(p.id)
    );
  }, [allProfiles, unitManagers]);

  const toggleUnit = useCallback((unitId: string) => {
    setUnitError(null);
    setUnitAssignments(prev => {
      const exists = prev.find(a => a.unitId === unitId);
      if (exists) {
        return prev.filter(a => a.unitId !== unitId);
      }
      return [...prev, { unitId, assignedToIds: [] }];
    });
  }, []);

  const updateUnitAssignees = useCallback((unitId: string, assignedToIds: string[]) => {
    setUnitAssignments(prev => {
      const updated = prev.map(a => {
        if (a.unitId === unitId) {
          return {
            ...a,
            assignedToIds: [...assignedToIds] // Create copy to ensure new reference
          };
        }
        return a;
      });
      return updated;
    });
  }, []);

  const selectAllUnits = useCallback(() => {
    setUnitError(null);
    if (units) {
      setUnitAssignments(units.map(u => ({ unitId: u.id, assignedToIds: [] })));
    }
  }, [units]);

  const deselectAllUnits = useCallback(() => {
    setUnitAssignments([]);
  }, []);

  // Helper to combine date and time
  const combineDateAndTime = (date: Date | undefined, time: string | undefined): string | null => {
    if (!date) return null;
    if (!time) return date.toISOString();
    const [hours, minutes] = time.split(':').map(Number);
    const combined = setMinutes(setHours(date, hours || 0), minutes || 0);
    return combined.toISOString();
  };

  const onSubmit = async (data: FormValues) => {
    const effectiveParentAssignees = isGestorOrAdmin
      ? (parentAssignees.length > 0 ? parentAssignees : [user?.id || ''].filter(Boolean))
      : [user?.id || ''].filter(Boolean);

    // Deep copy unitAssignments to avoid mutation issues
    const currentAssignments = [...unitAssignments];

    console.log('[RoutineForm] 1. Initial State:', currentAssignments);

    // Process assignments to include defaults
    const resolvedUnitAssignments = currentAssignments.map(ua => {
      // 1. If we have manual assignments, USE THEM.
      if (ua.assignedToIds && ua.assignedToIds.length > 0) {
        console.log(`[RoutineForm] Unit ${ua.unitId} has manual assignees:`, ua.assignedToIds);
        return { ...ua };
      }

      // 2. If NO manual assignments, use ALL Unit Managers for that unit.
      const defaultManagers = unitManagers
        ?.filter(um => um.unit_id === ua.unitId)
        .map(um => um.user_id) || [];

      console.log(`[RoutineForm] Unit ${ua.unitId} using default managers:`, defaultManagers);

      return {
        ...ua,
        assignedToIds: defaultManagers
      };
    });

    console.log('[RoutineForm] 2. Final Payload to Mutation:', resolvedUnitAssignments);

    await createRoutine.mutateAsync({
      title: data.title,
      description: data.description,
      frequency: data.isRecurring ? (data.recurrenceFrequency || 'semanal') : 'semanal',
      recurrenceMode: data.isRecurring ? (data.recurrenceMode || 'schedule') : 'schedule',
      unitAssignments: resolvedUnitAssignments,
      parentAssignedTo: effectiveParentAssignees[0] || null,
      parentAssignees: effectiveParentAssignees as string[],
      sectorId: sectorId,
      skipWeekendsHolidays: data.skipWeekendsHolidays || false,
      monthlyAnchor: data.monthlyAnchor,
      startDate: combineDateAndTime(data.startDate, data.startTime),
      dueDate: combineDateAndTime(data.dueDate, data.dueTime),
      repeatForever: data.repeatForever,
      recurrenceEndDate: data.recurrenceEndDate ? data.recurrenceEndDate.toISOString() : undefined,
    });

    form.reset();
    setUnitAssignments([]);
    setUnitError(null);
    setParentAssignees([]);
    setOpen(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-8 gap-1.5 text-xs px-3 whitespace-nowrap shrink-0">
          <Plus className="h-3.5 w-3.5" />
          Nova Rotina
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Criar Nova Rotina</DialogTitle>
          <DialogDescription>
            Configure uma nova rotina para as unidades selecionadas.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex-1 overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título da Rotina</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Checkpoint semanal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva a rotina..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(parseInt(v))}
                    defaultValue={field.value.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="1">1 - Baixa</SelectItem>
                      <SelectItem value="2">2 - Normal</SelectItem>
                      <SelectItem value="3">3 - Média</SelectItem>
                      <SelectItem value="4">4 - Alta</SelectItem>
                      <SelectItem value="5">5 - Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Data e Hora de Início */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de Início</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy", { locale: ptBR })
                            ) : (
                              <span>Selecione</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Hora de Início</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="time"
                          {...field}
                          className="pl-9"
                        />
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Data e Hora de Vencimento */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de Vencimento</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy", { locale: ptBR })
                            ) : (
                              <span>Selecione</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < (form.getValues('startDate') || new Date())}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueTime"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Hora de Vencimento</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="time"
                          {...field}
                          className="pl-9"
                        />
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tarefa Recorrente Toggle */}
            <FormField
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Tarefa Recorrente
                    </FormLabel>
                    <FormDescription className="text-xs">
                      Esta tarefa se repetirá automaticamente conforme a frequência definida
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Opções de Recorrência - só aparecem quando isRecurring está ativo */}
            {isRecurring && (
              <div className="space-y-4 rounded-lg border p-4 bg-secondary/20">
                <FormField
                  control={form.control}
                  name="recurrenceFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequência</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a frequência" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {frequencyOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />



                {form.watch('recurrenceFrequency') === 'mensal' && (
                  <FormField
                    control={form.control}
                    name="monthlyAnchor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Repetição Mensal</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || 'date'}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo de repetição" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="date">Mesmo dia do Mês (ex: todo dia 15)</SelectItem>
                            <SelectItem value="weekday">Mesmo dia da Semana (ex: toda 2ª Quarta-feira)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          {field.value === 'date'
                            ? 'A tarefa será criada sempre na mesma data, ajustando se cair em fim de semana.'
                            : 'A tarefa será criada mantendo a posição na semana.'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="repeatForever"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 bg-background">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium">Repetir para sempre</FormLabel>
                        <FormDescription className="text-xs">
                          Se desativado, defina até quando a tarefa deve se repetir
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (checked) {
                              form.setValue('recurrenceEndDate', undefined);
                            }
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {!repeatForever && (
                  <FormField
                    control={form.control}
                    name="recurrenceEndDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Repetir até</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "dd/MM/yyyy", { locale: ptBR })
                                ) : (
                                  <span>Selecione a data final</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < (form.getValues('dueDate') || new Date())}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription className="text-xs">
                          A tarefa se repetirá até esta data
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="skipWeekendsHolidays"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 bg-background">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium">
                          Ignorar feriados e finais de semana
                        </FormLabel>
                        <FormDescription className="text-xs">
                          Tarefas não serão criadas em sábados, domingos ou feriados nacionais
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Responsáveis da Tarefa Mãe - Apenas para Gestor/Admin */}
            {isGestorOrAdmin && (
              <div className="space-y-2">
                <FormLabel>Responsáveis da Tarefa Mãe</FormLabel>
                <MultiAssigneeSelect
                  profiles={allProfiles || []}
                  selectedIds={parentAssignees}
                  onChange={setParentAssignees}
                  placeholder="Selecionar responsáveis (opcional)"
                />
                <p className="text-xs text-muted-foreground">
                  Os responsáveis da tarefa mãe acompanham o progresso geral de todas as unidades.
                </p>
              </div>
            )}

            {/* Units Selection with Responsible per Unit - Apenas para Gestor/Admin */}
            {isGestorOrAdmin && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <FormLabel className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Unidades e Responsáveis ({unitAssignments.length} selecionadas) - Opcional
                  </FormLabel>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAllUnits}
                      className="text-xs h-7"
                    >
                      Selecionar todas
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={deselectAllUnits}
                      className="text-xs h-7"
                    >
                      Limpar
                    </Button>
                  </div>
                </div>

                <div className="border border-border rounded-md overflow-hidden flex flex-col max-h-60 h-full">
                  <div className="p-1 space-y-1 flex-1 overflow-y-auto w-full h-full custom-scrollbar">
                    {loadingUnits ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : units && units.length > 0 ? (
                      units.map((unit) => {
                        const isSelected = selectedSet.has(unit.id);
                        const assignment = unitAssignments.find(a => a.unitId === unit.id);
                        const profilesForUnit = getProfilesForUnit(unit.id);

                        return (
                          <div
                            key={unit.id}
                            className={cn(
                              "rounded-md border transition-colors cursor-pointer",
                              isSelected ? 'bg-primary/5 border-primary/20' : 'border-transparent hover:bg-secondary/20'
                            )}
                          >
                            <div
                              onClick={() => toggleUnit(unit.id)}
                              className="flex items-center gap-3 p-2 py-1.5"
                            >
                              <div className={cn(
                                "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-all",
                                isSelected ? 'bg-primary border-primary' : 'border-input hover:border-primary/50'
                              )}>
                                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{unit.name}</p>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="px-3 pb-2 pt-0" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2 pl-7">
                                  <div className="flex-1">
                                    <MultiAssigneeSelect
                                      profiles={profilesForUnit}
                                      selectedIds={assignment?.assignedToIds || []}
                                      onChange={(ids) => updateUnitAssignees(unit.id, ids)}
                                      placeholder="Padrão: Todos os Gestores"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-center py-4 text-muted-foreground text-sm">
                        Nenhuma unidade cadastrada
                      </p>
                    )}
                  </div>
                </div>
                {unitError && (
                  <p className="text-sm font-medium text-destructive mt-1">{unitError}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Uma tarefa mãe será criada para você acompanhar o progresso geral, e tarefas individuais serão criadas para cada unidade.
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={createRoutine.isPending}
            >
              {createRoutine.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Rotina'
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
