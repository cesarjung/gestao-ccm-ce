import { useState, useMemo, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Trash2, Users, Check, CalendarIcon, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import { useUpdateRoutine, useDeleteRoutine } from '@/hooks/useRoutineMutations';
import { useIsGestorOrAdmin } from '@/hooks/useUserRole';
import { useUnits } from '@/hooks/useUnits';
import { useProfiles } from '@/hooks/useProfiles';
import { useUnitManagers } from '@/hooks/useUnitManagers';
import { MultiAssigneeSelect } from '@/components/MultiAssigneeSelect';
import { cn } from '@/lib/utils';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Routine = Tables<'routines'>;
type TaskFrequency = Enums<'task_frequency'>;

const frequencyOptions: { value: TaskFrequency; label: string }[] = [
  { value: 'diaria', label: 'Diária' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
];

const recurrenceModeOptions = [
  { value: 'schedule', label: 'Por Cronograma', description: 'Cria automaticamente um dia antes, mesmo que a atual não esteja concluída' },
  { value: 'on_completion', label: 'Ao Concluir', description: 'Só cria a próxima quando a atual for marcada como concluída' },
];

interface UnitAssignment {
  unitId: string;
  assignedToIds: string[];
}

const formSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200, 'Título muito longo'),
  description: z.string().max(1000, 'Descrição muito longa').optional().nullable(),
  frequency: z.enum(['diaria', 'semanal', 'quinzenal', 'mensal'] as const),
  recurrenceMode: z.enum(['schedule', 'on_completion'] as const),
  startDate: z.date().optional(),
  startTime: z.string().optional(),
  endDate: z.date().optional(),
  endTime: z.string().optional(),
  skipWeekendsHolidays: z.boolean(),
  monthlyAnchor: z.enum(['date', 'weekday'] as const).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface RoutineEditDialogProps {
  routine: Routine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RoutineEditDialog = ({ routine, open, onOpenChange }: RoutineEditDialogProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [unitAssignments, setUnitAssignments] = useState<UnitAssignment[]>([]);
  const [parentAssignees, setParentAssignees] = useState<string[]>([]);

  const updateRoutine = useUpdateRoutine();
  const deleteRoutine = useDeleteRoutine();
  const { isGestorOrAdmin } = useIsGestorOrAdmin();
  const { data: units, isLoading: loadingUnits } = useUnits();
  const { data: allProfiles } = useProfiles();
  const { data: unitManagers } = useUnitManagers();

  // Fetch routine assignees (parent task assignees)
  const { data: routineAssignees } = useQuery({
    queryKey: ['routine-assignees', routine?.id],
    queryFn: async () => {
      if (!routine?.id) return [];
      const { data, error } = await supabase
        .from('routine_assignees')
        .select('user_id')
        .eq('routine_id', routine.id);
      if (error) throw error;
      return data.map(ra => ra.user_id);
    },
    enabled: !!routine?.id && open,
  });

  // Fetch actual unit assignments from the latest child tasks for this routine
  useQuery({
    queryKey: ['routine-child-tasks-assignments', routine?.id],
    queryFn: async () => {
      if (!routine?.id) return null;

      // Get the most recent Parent Task for this routine
      const { data: parentTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('routine_id', routine.id)
        .is('parent_task_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!parentTask) return null;

      // Get child tasks and their assignees
      const { data: childTasks } = await supabase
        .from('tasks')
        .select('id, unit_id, assigned_to')
        .eq('parent_task_id', parentTask.id);

      if (!childTasks || childTasks.length === 0) return null;

      const taskIds = childTasks.map(t => t.id);

      // Get additional assignees from task_assignees
      const { data: taskAssignees } = await supabase
        .from('task_assignees')
        .select('task_id, user_id')
        .in('task_id', taskIds);

      // Construct the unitAssignments map
      const assignments: UnitAssignment[] = childTasks.map(task => {
        const assignees = new Set<string>();
        if (task.assigned_to) assignees.add(task.assigned_to);

        taskAssignees
          ?.filter(ta => ta.task_id === task.id)
          .forEach(ta => assignees.add(ta.user_id));

        return {
          unitId: task.unit_id,
          assignedToIds: Array.from(assignees)
        };
      });

      return assignments;
    },
    enabled: !!routine?.id && open,
  }).data;

  // Use a separate effect to load the fetched assignments into state
  // We need to capture the data from the query above.
  // Since I cannot easily assign it to a variable without breaking the rules of hooks if I conditionally call it, 
  // I will refactor to put the query result into a variable and use useEffect.

  const { data: existingAssignments } = useQuery({
    queryKey: ['routine-child-tasks-assignments', routine?.id],
    queryFn: async () => {
      if (!routine?.id) return [];

      const { data: parentTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('routine_id', routine.id)
        .is('parent_task_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!parentTask) return [];

      const { data: childTasks } = await supabase
        .from('tasks')
        .select('id, unit_id, assigned_to')
        .eq('parent_task_id', parentTask.id);

      if (!childTasks) return [];

      const taskIds = childTasks.map(t => t.id);

      const { data: taskAssignees } = await supabase
        .from('task_assignees')
        .select('task_id, user_id')
        .in('task_id', taskIds);

      return childTasks.map(task => {
        const assignees = new Set<string>();
        if (task.assigned_to) assignees.add(task.assigned_to);

        taskAssignees
          ?.filter(ta => ta.task_id === task.id)
          .forEach(ta => assignees.add(ta.user_id));

        return {
          unitId: task.unit_id,
          assignedToIds: Array.from(assignees)
        };
      });
    },
    enabled: !!routine?.id && open,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    values: routine ? {
      title: routine.title,
      description: routine.description || '',
      frequency: routine.frequency as any,
      recurrenceMode: routine.recurrence_mode || 'schedule',
      monthlyAnchor: (routine.custom_schedule as any)?.monthlyAnchor || 'date',
      startDate: undefined,
      startTime: '',
      endDate: undefined,
      endTime: '',
      skipWeekendsHolidays: false,
    } : undefined,
  });

  const { data: currentPeriodTask } = useQuery({
    queryKey: ['routine-current-task-dates', routine?.id],
    queryFn: async () => {
      if (!routine?.id) return null;
      const { data } = await supabase
        .from('tasks')
        .select('start_date, due_date')
        .eq('routine_id', routine.id)
        .in('status', ['pendente', 'em_andamento', 'atrasada'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!routine?.id && open,
  });

  useEffect(() => {
    if (currentPeriodTask) {
      if (currentPeriodTask.start_date) {
        const sd = new Date(currentPeriodTask.start_date);
        form.setValue('startDate', sd);
        form.setValue('startTime', format(sd, 'HH:mm'));
      }
      if (currentPeriodTask.due_date) {
        const dd = new Date(currentPeriodTask.due_date);
        form.setValue('endDate', dd);
        form.setValue('endTime', format(dd, 'HH:mm'));
      }
    }
  }, [currentPeriodTask, form]);

  // Reset unit assignments when routine changes and load saved data
  useEffect(() => {
    if (existingAssignments && existingAssignments.length > 0) {
      setUnitAssignments(existingAssignments);
    } else if (routine?.unit_id) {
      // Fallback for legacy or manually created routines without tasks yet
      setUnitAssignments([{ unitId: routine.unit_id, assignedToIds: routineAssignees || [] }]);
    } else {
      setUnitAssignments([]);
    }

    // Always sync parent assignees
    setParentAssignees(routineAssignees || []);
  }, [routine, routineAssignees, existingAssignments]);

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
    setUnitAssignments(prev => {
      const exists = prev.find(a => a.unitId === unitId);
      if (exists) {
        return prev.filter(a => a.unitId !== unitId);
      }
      return [...prev, { unitId, assignedToIds: [] }];
    });
  }, []);

  const updateUnitAssignees = useCallback((unitId: string, assignedToIds: string[]) => {
    setUnitAssignments(prev =>
      prev.map(a => a.unitId === unitId ? { ...a, assignedToIds } : a)
    );
  }, []);

  const selectAllUnits = useCallback(() => {
    if (units) {
      setUnitAssignments(units.map(u => ({ unitId: u.id, assignedToIds: [] })));
    }
  }, [units]);

  const deselectAllUnits = useCallback(() => {
    setUnitAssignments([]);
  }, []);

  const onSubmit = async (data: FormData) => {
    if (!routine) return;

    let startDateISO = null;
    let dueDateISO = null;

    if (data.startDate) {
      const date = setHours(setMinutes(data.startDate, parseInt(data.startTime?.split(':')[1] || '0')), parseInt(data.startTime?.split(':')[0] || '0'));
      startDateISO = date.toISOString();
    }

    if (data.endDate) {
      const date = setHours(setMinutes(data.endDate, parseInt(data.endTime?.split(':')[1] || '0')), parseInt(data.endTime?.split(':')[0] || '0'));
      dueDateISO = date.toISOString();
    }

    await updateRoutine.mutateAsync({
      id: routine.id,
      data: {
        title: data.title,
        description: data.description || null,
        frequency: data.frequency,
        recurrence_mode: data.recurrenceMode,
        skipWeekendsHolidays: data.skipWeekendsHolidays,
        monthlyAnchor: data.monthlyAnchor,
        startDate: startDateISO,
        dueDate: dueDateISO,
      },
    });

    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!routine) return;
    await deleteRoutine.mutateAsync(routine.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  if (!routine) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Editar Rotina</DialogTitle>
            <DialogDescription>
              Altere as informações da rotina
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex-1 overflow-y-auto pr-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
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
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequência</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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

              {/* Recurrence Mode */}
              <FormField
                control={form.control}
                name="recurrenceMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modo de Recorrência</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o modo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {recurrenceModeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {recurrenceModeOptions.find(o => o.value === field.value)?.description}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.watch('frequency') === 'mensal' && (
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
                          ? 'A tarefa será criada sempre na mesma data (dia 15, dia 20, etc), ajustando se cair em fim de semana.'
                          : 'A tarefa será criada mantendo a posição na semana (ex: segunda quinta-feira do mês).'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}



              {/* Data e Hora de Início */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data de início</FormLabel>
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
                      <FormLabel>Hora de início</FormLabel>
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

              {/* Data e Hora de Fim (opcional) */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="endDate"
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
                  name="endTime"
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

              {/* Responsáveis da Rotina Mãe - Apenas para Gestor/Admin */}
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

              {/* Units Selection - Apenas para Gestor/Admin */}
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

                  <div className="border border-border rounded-md overflow-y-auto max-h-48">
                    <div className="p-3 space-y-2">
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
                                "rounded-md border transition-colors",
                                isSelected ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-secondary/50'
                              )}
                            >
                              <div
                                onClick={() => toggleUnit(unit.id)}
                                className="flex items-center gap-3 p-3 cursor-pointer"
                              >
                                <div className={cn(
                                  "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0",
                                  isSelected ? 'bg-primary border-primary' : 'border-input'
                                )}>
                                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{unit.name}</p>
                                  <p className="text-xs text-muted-foreground">{unit.code}</p>
                                </div>
                              </div>

                              {isSelected && (
                                <div className="px-3 pb-3 pt-0">
                                  <div className="flex items-center gap-2 pl-7">
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">Responsáveis:</span>
                                    <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                                      <MultiAssigneeSelect
                                        profiles={profilesForUnit}
                                        selectedIds={assignment?.assignedToIds || []}
                                        onChange={(ids) => updateUnitAssignees(unit.id, ids)}
                                        placeholder="Selecionar responsáveis..."
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
                  <p className="text-xs text-muted-foreground mt-2">
                    Uma tarefa mãe será criada para você acompanhar o progresso geral, e tarefas individuais serão criadas para cada unidade.
                  </p>
                </div>
              )}

              <DialogFooter className="flex justify-between sm:justify-between pt-4 border-t">
                {isGestorOrAdmin && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </Button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={updateRoutine.isPending}>
                    {updateRoutine.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Salvando...
                      </>
                    ) : (
                      'Salvar'
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rotina?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a rotina "{routine.title}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRoutine.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
