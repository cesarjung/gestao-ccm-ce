import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Loader2, Trash2, RefreshCw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
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

import { useUpdateTask, useDeleteTask } from '@/hooks/useTaskMutations';
import { useProfiles } from '@/hooks/useProfiles';
import { MultiAssigneeSelect } from '@/components/MultiAssigneeSelect';
import type { Tables } from '@/integrations/supabase/types';

type Task = Tables<'tasks'> & {
  unit?: { name: string; code: string } | null;
  assignees?: any[];
};

const statusOptions = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'atrasada', label: 'Atrasada' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'nao_aplicavel', label: 'N/A (Não se Aplica)' },
];

const frequencyOptions = [
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
  title: z.string().min(1, 'Título é obrigatório').max(200, 'Título muito longo'),
  description: z.string().max(1000, 'Descrição muito longa').optional().nullable(),
  status: z.enum(['pendente', 'em_andamento', 'concluida', 'atrasada', 'cancelada', 'nao_aplicavel']),
  priority: z.number().min(1).max(5),
  start_date: z.date().optional().nullable(),
  start_time: z.string().optional(),
  due_date: z.date().optional().nullable(),
  due_time: z.string().optional(),
  // Recurrence Fields
  is_recurring: z.boolean().optional(),
  recurrence_frequency: z.enum(['diaria', 'semanal', 'quinzenal', 'mensal']).optional().nullable(),
  recurrence_mode: z.enum(['schedule', 'on_completion']).optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface TaskEditDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TaskEditDialog = ({ task, open, onOpenChange }: TaskEditDialogProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: profiles } = useProfiles();

  useQuery({
    queryKey: ['task-assignees-edit', task?.id],
    queryFn: async () => {
      if (!task?.id) return [];

      const { data, error } = await supabase
        .from('task_assignees')
        .select('user_id')
        .eq('task_id', task.id);

      if (error) throw error;
      const ids = data.map(r => r.user_id);

      if (task.assigned_to && !ids.includes(task.assigned_to)) {
        ids.push(task.assigned_to);
      }

      setAssignedToIds(ids);
      return ids;
    },
    enabled: !!task?.id && open
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    values: task ? {
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority || 1,
      start_date: task.start_date ? new Date(task.start_date) : null,
      start_time: task.start_date ? format(new Date(task.start_date), 'HH:mm') : '',
      due_date: task.due_date ? new Date(task.due_date) : null,
      due_time: task.due_date ? format(new Date(task.due_date), 'HH:mm') : '',
      is_recurring: task.is_recurring || false,
      recurrence_frequency: task.recurrence_frequency as any,
      recurrence_mode: task.recurrence_mode as any,
    } : undefined,
  });

  // Helper to combine date and time
  const combineDateAndTime = (date: Date | null | undefined, time: string | undefined): string | null => {
    if (!date) return null;
    if (!time) return date.toISOString();
    const [hours, minutes] = time.split(':').map(Number);
    const combined = setMinutes(setHours(date, hours || 0), minutes || 0);
    return combined.toISOString();
  };

  const isRecurring = form.watch('is_recurring');

  const onSubmit = async (data: FormData) => {
    if (!task) return;

    await updateTask.mutateAsync({
      id: task.id,
      title: data.title,
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      start_date: combineDateAndTime(data.start_date, data.start_time),
      due_date: combineDateAndTime(data.due_date, data.due_time),
      completed_at: data.status === 'concluida' ? new Date().toISOString() : null,
      assigneeIds: assignedToIds,
      is_recurring: data.is_recurring,
      recurrence_frequency: data.is_recurring ? data.recurrence_frequency : null,
      recurrence_mode: data.is_recurring ? data.recurrence_mode : null,
    });

    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!task) return;
    await deleteTask.mutateAsync(task.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  if (!task) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Editar Tarefa</DialogTitle>
            <DialogDescription>
              {task.unit?.name ? `Unidade: ${task.unit.name}` : 'Detalhes e configurações da tarefa'}
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
                      <Input placeholder="Ex: Manutenção Elétrica" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Responsáveis</FormLabel>
                <MultiAssigneeSelect
                  profiles={profiles || []}
                  selectedIds={assignedToIds}
                  onChange={setAssignedToIds}
                  placeholder="Selecionar responsáveis..."
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Descreva a tarefa..."
                        rows={3}
                        className="resize-none"
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {statusOptions.map((option) => (
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

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(parseInt(v))}
                        value={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a prioridade" />
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
              </div>

              {/* Start Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_date"
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
                            selected={field.value || undefined}
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
                  name="start_time"
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

              {/* Due Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="due_date"
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
                            selected={field.value || undefined}
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
                  name="due_time"
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

              {/* Recurrence Section - Standardized with TaskForm */}
              <div className="border rounded-lg p-3 space-y-4">
                <FormField
                  control={form.control}
                  name="is_recurring"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium flex items-center gap-2">
                          <RefreshCw className="h-4 w-4" />
                          Tarefa Recorrente
                        </FormLabel>
                        <FormDescription className="text-xs">
                          Repetir automaticamente
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

                {isRecurring && (
                  <div className="space-y-3 pt-2 border-t">
                    <FormField
                      control={form.control}
                      name="recurrence_frequency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Frequência</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
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

                    <FormField
                      control={form.control}
                      name="recurrence_mode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Modo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
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
                          <FormDescription className="text-xs">
                            {recurrenceModeOptions.find(o => o.value === field.value)?.description}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="flex justify-between sm:justify-between pt-4 border-t mt-4">
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
                <div className="flex gap-2 ml-auto">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={updateTask.isPending}>
                    {updateTask.isPending ? (
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
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a tarefa "{task.title}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTask.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
