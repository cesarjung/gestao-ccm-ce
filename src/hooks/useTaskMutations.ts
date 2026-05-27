import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { format } from 'date-fns';


import {
  syncTaskToCalendar,
  updateCalendarEvent,
  deleteCalendarEvent
} from '@/services/googleCalendarSync';
import { isWeekendOrHoliday, getNextBusinessDay } from '@/utils/holidays';

export type TaskInsert = TablesInsert<'tasks'>;
export type TaskUpdate = TablesUpdate<'tasks'>;
export type SubtaskInsert = TablesInsert<'subtasks'>;

export interface SubtaskData {
  title: string;
  assigned_to?: string | null;
  assigned_to_ids?: string[]; // Multiple assignees
}

export interface UnitAssignment {
  unitId: string;
  assignedTo: string | null;
  assignedToIds?: string[]; // Multiple assignees per unit
}

export interface CreateTaskData {
  task: TaskInsert;
  subtasks?: SubtaskData[];
}

export interface CreateTaskWithUnitsData {
  title: string;
  description?: string | null;
  priority: number;
  start_date?: string | null;
  due_date?: string | null;
  parentAssignedTo?: string | null; // Responsável principal (backwards compatibility)
  parentAssignees?: string[]; // Multiple assignees for parent task
  unitAssignments: UnitAssignment[];
  subtasks?: SubtaskData[];
  // Campos de recorrência
  is_recurring?: boolean;
  recurrence_frequency?: 'diaria' | 'semanal' | 'quinzenal' | 'mensal';
  recurrence_mode?: 'schedule' | 'on_completion';
  // Setor
  sector_id?: string;
  // Seção do Setor (Dynamic Sections)
  section_id?: string;
  // Ignorar feriados e finais de semana
  skip_weekends_holidays?: boolean;
}

export const useCreateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ task, subtasks }: CreateTaskData) => {
      // Insert task
      const { data: newTask, error: taskError } = await supabase
        .from('tasks')
        .insert(task)
        .select()
        .single();

      if (taskError) throw taskError;

      // Insert subtasks if provided
      if (subtasks && subtasks.length > 0) {
        const subtasksData: SubtaskInsert[] = subtasks.map((subtask, index) => ({
          task_id: newTask.id,
          title: subtask.title,
          assigned_to: subtask.assigned_to || null,
          order_index: index,
        }));

        const { error: subtasksError } = await supabase
          .from('subtasks')
          .insert(subtasksData);

        if (subtasksError) throw subtasksError;
      }

      // Sync to Google Calendar (fire and forget)
      syncTaskToCalendar(
        newTask.id,
        newTask.title,
        newTask.description,
        newTask.start_date,
        newTask.due_date
      ).catch(console.error);

      return newTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tracker-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-stats'] });
      toast.success('Tarefa criada com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating task:', error);
      toast.error('Erro ao criar tarefa');
    },
  });
};

// Novo hook para criar tarefa mãe + filhas por unidade
export const useCreateTaskWithUnits = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTaskWithUnitsData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Get the user's unit_id and role
      const { data: profile } = await supabase
        .from('profiles')
        .select('unit_id')
        .eq('id', user.id)
        .single();

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      const userUnitId = profile?.unit_id;
      const isAdminOrGestor = userRole?.role === 'admin' || userRole?.role === 'gestor';

      // Helper function to adjust dates if skip_weekends_holidays is enabled
      const adjustDate = (dateStr: string | null | undefined): string | null => {
        if (!dateStr) return null;
        if (!data.skip_weekends_holidays) return dateStr;

        const date = new Date(dateStr);
        if (isWeekendOrHoliday(date)) {
          return getNextBusinessDay(date).toISOString();
        }
        return dateStr;
      };

      const adjustedStartDate = adjustDate(data.start_date);
      const adjustedDueDate = adjustDate(data.due_date);

      // If units were selected, create parent + child tasks
      if (data.unitAssignments.length > 0) {
        // Criar tarefa mãe (usa a primeira unidade como referência)
        const firstUnitId = data.unitAssignments[0].unitId;

        const { data: parentTask, error: parentError } = await supabase
          .from('tasks')
          .insert({
            title: data.title,
            description: data.description || null,
            unit_id: firstUnitId,
            sector_id: data.sector_id || null,
            section_id: data.section_id || null,
            assigned_to: data.parentAssignedTo || user.id,
            status: 'pendente',
            priority: data.priority,
            start_date: adjustedStartDate,
            due_date: adjustedDueDate,
            created_by: user.id,
            parent_task_id: null,
            is_recurring: data.is_recurring || false,
            recurrence_frequency: data.is_recurring ? data.recurrence_frequency : null,
            recurrence_mode: data.is_recurring ? data.recurrence_mode : null,
          })
          .select()
          .single();

        if (parentError) throw parentError;

        // Add multiple assignees to task_assignees table
        const parentAssigneeIds = data.parentAssignees && data.parentAssignees.length > 0
          ? data.parentAssignees
          : [data.parentAssignedTo || user.id].filter(Boolean);

        if (parentAssigneeIds.length > 0) {
          await supabase
            .from('task_assignees')
            .insert(parentAssigneeIds.map(userId => ({ task_id: parentTask.id, user_id: userId })));
        }

        // Criar tarefas filhas para cada unidade com seu responsável
        const childTasks = data.unitAssignments.map((assignment) => ({
          title: data.title,
          description: data.description || null,
          unit_id: assignment.unitId,
          sector_id: data.sector_id || null,
          section_id: data.section_id || null, // Propagate section_id to children
          assigned_to: assignment.assignedTo,
          status: 'pendente' as const,
          priority: data.priority,
          start_date: adjustedStartDate,
          due_date: adjustedDueDate,
          created_by: user.id,
          parent_task_id: parentTask.id,
        }));

        const { data: createdChildTasks, error: childError } = await supabase
          .from('tasks')
          .insert(childTasks)
          .select();

        if (childError) throw childError;

        // Add assignees for each child task
        if (createdChildTasks) {
          for (let i = 0; i < createdChildTasks.length; i++) {
            const childTask = createdChildTasks[i];
            const assignment = data.unitAssignments[i];
            const assigneeIds = assignment.assignedToIds && assignment.assignedToIds.length > 0
              ? assignment.assignedToIds
              : assignment.assignedTo ? [assignment.assignedTo] : [];

            if (assigneeIds.length > 0) {
              await supabase
                .from('task_assignees')
                .insert(assigneeIds.map(userId => ({ task_id: childTask.id, user_id: userId })));
            }
          }
        }

        // Criar subtarefas para cada tarefa filha se houver
        if (data.subtasks && data.subtasks.length > 0 && createdChildTasks) {
          const allSubtasks: SubtaskInsert[] = [];

          for (const childTask of createdChildTasks) {
            data.subtasks.forEach((subtask, index) => {
              allSubtasks.push({
                task_id: childTask.id,
                title: subtask.title,
                assigned_to: subtask.assigned_to || null,
                order_index: index,
              });
            });
          }

          if (allSubtasks.length > 0) {
            const { error: subtasksError } = await supabase
              .from('subtasks')
              .insert(allSubtasks);

            if (subtasksError) throw subtasksError;
          }
        }

        // Sync parent task to Google Calendar
        syncTaskToCalendar(
          parentTask.id,
          parentTask.title,
          parentTask.description,
          parentTask.start_date,
          parentTask.due_date
        ).catch(console.error);

        return { parentTask, childTasks: createdChildTasks };
      } else {
        // No units selected
        // Admins/Gestores podem criar sem unidade
        // Regular users MUST have a unit_id in their profile
        if (!isAdminOrGestor && !userUnitId) {
          throw new Error('Você precisa estar associado a uma unidade para criar tarefas.');
        }

        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: data.title,
            description: data.description || null,
            unit_id: userUnitId || null, // null for admins/gestors without unit
            sector_id: data.sector_id || null,
            section_id: data.section_id || null,
            assigned_to: data.parentAssignedTo || user.id,
            status: 'pendente',
            priority: data.priority,
            start_date: adjustedStartDate,
            due_date: adjustedDueDate,
            created_by: user.id,
            parent_task_id: null,
            is_recurring: data.is_recurring || false,
            recurrence_frequency: data.is_recurring ? data.recurrence_frequency : null,
            recurrence_mode: data.is_recurring ? data.recurrence_mode : null,
          })
          .select()
          .single();

        if (taskError) throw taskError;

        // Criar subtarefas se houver
        if (data.subtasks && data.subtasks.length > 0) {
          const subtasksData: SubtaskInsert[] = data.subtasks.map((subtask, index) => ({
            task_id: task.id,
            title: subtask.title,
            assigned_to: subtask.assigned_to || null,
            order_index: index,
          }));

          const { error: subtasksError } = await supabase
            .from('subtasks')
            .insert(subtasksData);

          if (subtasksError) throw subtasksError;
        }

        // Sync to Google Calendar
        syncTaskToCalendar(
          task.id,
          task.title,
          task.description,
          task.start_date,
          task.due_date
        ).catch(console.error);

        return { parentTask: task, childTasks: [] };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tracker-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-stats'] });
      const hasMultipleUnits = result.childTasks && result.childTasks.length > 0;
      toast.success(hasMultipleUnits ? 'Tarefa criada para todas as unidades!' : 'Tarefa criada com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating task with units:', error);
      toast.error('Erro ao criar tarefa');
    },
  });
};

export const useUpdateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, comment, assigneeIds, ...updates }: TaskUpdate & { id: string, comment?: string, assigneeIds?: string[] }) => {
      // First, get the current task to check for google_event_id and recurring info
      const { data: existingTask } = await supabase
        .from('tasks')
        .select(`
          google_event_id, 
          title, 
          description, 
          start_date, 
          due_date, 
          status, 
          is_recurring, 
          recurrence_frequency, 
          recurrence_mode, 
          unit_id, 
          sector_id, 
          assigned_to, 
          created_by, 
          priority, 
          parent_task_id, 
          routine_id,
          task_assignees(user_id),
          routine:routines(frequency)
        `)
        .eq('id', id)
        .single();

      // Build explicitly the payload for the tasks table
      const dbUpdates = { ...updates };

      const { data, error } = await supabase
        .from('tasks')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Update assignees if provided
      if (assigneeIds !== undefined) {
        // ... (existing assignee logic)
      }

      // ... (existing updateRoutineCheckin logic)

      // ... (omitting middle parts for brevity in this replace call if possible, but replace_file_content must use contiguous block)
      // Actually refetching the whole block from 340 to 470 is safer or I need to split.
      // I will only replace the select part first, then the logic part.
      // But I can't do multiple in one replace_file_content call effectively if they are far apart.
      // Let's replace the fetch part first.


      // Update assignees if provided
      if (assigneeIds !== undefined) {
        // Delete existing assignees
        const { error: deleteError } = await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', id);

        if (deleteError) throw deleteError;

        // Insert new assignees
        if (assigneeIds.length > 0) {
          const { error: insertError } = await supabase
            .from('task_assignees')
            .insert(assigneeIds.map(userId => ({ task_id: id, user_id: userId })));

          if (insertError) throw insertError;
        }

        // Update legacy assigned_to field if not explicitly in updates
        if (updates.assigned_to === undefined) {
          const newAssignedTo = assigneeIds.length > 0 ? assigneeIds[0] : null;
          if (newAssignedTo !== existingTask?.assigned_to) {
            await supabase.from('tasks').update({ assigned_to: newAssignedTo }).eq('id', id);
          }
        }
      }

      // Determine effective assignee for routine sync
      // Prefer legacy assigned_to, fallback to first mult-assignee
      let effectiveAssigneeId = existingTask?.assigned_to;
      if (!effectiveAssigneeId && existingTask?.task_assignees && existingTask.task_assignees.length > 0) {
        effectiveAssigneeId = existingTask.task_assignees[0].user_id;
      }

      // Se a tarefa está sendo concluída OU JÁ ESTÁ concluída (para permitir editar comentário depois)
      if (
        existingTask?.routine_id &&
        (updates.status === 'concluida' || (updates.status === undefined && existingTask?.status === 'concluida'))
      ) {
        await updateRoutineCheckinFromTask(
          existingTask.routine_id,
          effectiveAssigneeId,
          existingTask.unit_id,
          'completed',
          comment,
          existingTask.due_date
        );
      }

      if (
        existingTask?.routine_id &&
        updates.status === 'nao_aplicavel' &&
        existingTask?.status !== 'nao_aplicavel'
      ) {
        await updateRoutineCheckinFromTask(
          existingTask.routine_id,
          effectiveAssigneeId,
          existingTask.unit_id,
          'not_completed',
          comment,
          existingTask.due_date
        );
      }

      // If task was uncompleted and is linked to a routine, revert the checkin
      if (
        existingTask?.routine_id &&
        (existingTask?.status === 'concluida' || existingTask?.status === 'nao_aplicavel') &&
        updates.status && updates.status !== 'concluida' && updates.status !== 'nao_aplicavel'
      ) {
        await updateRoutineCheckinFromTask(existingTask.routine_id, effectiveAssigneeId, existingTask.unit_id, 'pending');
      }

      // Sync to Google Calendar if connected
      if (existingTask?.google_event_id) {
        updateCalendarEvent(
          existingTask.google_event_id,
          (updates.title as string) || existingTask.title,
          updates.description !== undefined ? updates.description : existingTask.description,
          updates.start_date !== undefined ? updates.start_date : existingTask.start_date,
          updates.due_date !== undefined ? updates.due_date : existingTask.due_date,
          (updates.status as string) || existingTask.status
        ).catch(console.error);
      }

      // If this is a child task, check and update parent task status
      if (existingTask?.parent_task_id && updates.status) {
        // We delay slightly to ensure the current update is committed before checking siblings
        // Or we can rely on the fact that we awaited the update above.
        await checkAndCompleteParentTask(existingTask.parent_task_id);
      }

      // Handle recurring task completion
      const effectiveFrequency = existingTask?.recurrence_frequency || existingTask?.routine?.frequency;



      if (
        existingTask?.is_recurring &&
        (existingTask?.recurrence_mode === 'on_completion' || existingTask?.recurrence_mode === 'schedule') &&
        !existingTask?.parent_task_id && // Only for parent/standalone tasks
        updates.status === 'concluida' &&
        // existingTask?.status !== 'concluida' && // Relaxed check
        existingTask?.start_date &&
        existingTask?.due_date &&
        effectiveFrequency
      ) {
        // Create next instance when task is completed
        await createNextRecurringInstance({
          ...existingTask,
          recurrence_frequency: effectiveFrequency as string
        }, id);
      }

      return data;
    },
    onMutate: async ({ id, ...updates }) => {
      // Cancelar queries para não sobreescrever o otimismo
      await queryClient.cancelQueries({ queryKey: ['routine-tasks'] });
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      // Snapshot do estado anterior
      const previousRoutineTasks = queryClient.getQueriesData({ queryKey: ['routine-tasks'] });
      const previousTasks = queryClient.getQueryData(['tasks']);

      // 1. Atualizar cache de 'routine-tasks' (onde a lista de tarefas da rotina vive)
      queryClient.setQueriesData({ queryKey: ['routine-tasks'] }, (oldData: any) => {
        if (!oldData || !oldData.childTasks) return oldData;

        return {
          ...oldData,
          childTasks: oldData.childTasks.map((task: any) =>
            task.id === id ? { ...task, ...updates } : task
          ),
          parentTask: oldData.parentTask?.id === id
            ? { ...oldData.parentTask, ...updates }
            : oldData.parentTask
        };
      });

      // 2. Atualizar cache de 'tasks' (lista geral)
      queryClient.setQueryData(['tasks'], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map(task => task.id === id ? { ...task, ...updates } : task);
      });

      return { previousRoutineTasks, previousTasks };
    },
    onError: (err, newTodo, context) => {
      toast.error('Erro ao atualizar tarefa');
      // Reverter em caso de erro
      if (context?.previousRoutineTasks) {
        context.previousRoutineTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks'], context.previousTasks);
      }
    },
    onSettled: () => {
      // Invalidar tudo para garantir consitência final
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tracker-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-stats'] });
      queryClient.invalidateQueries({ queryKey: ['child-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['routine-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['routine-periods'] });
      queryClient.invalidateQueries({ queryKey: ['current-period-checkins'] });

      // Dashboard invalidations
      queryClient.invalidateQueries({ queryKey: ['units-summary'] });
      queryClient.invalidateQueries({ queryKey: ['overall-stats'] });
      queryClient.invalidateQueries({ queryKey: ['unit-routine-status'] });
      queryClient.invalidateQueries({ queryKey: ['responsible-routine-status'] });

      // Invalidar TUDO para garantir que não haja chaves esquecidas
      queryClient.invalidateQueries();
    },
    onSuccess: () => {
      toast.success('Tarefa atualizada!');
    },
  });
};

// Helper function to update routine checkin when a task is completed
async function updateRoutineCheckinFromTask(
  routineId: string,
  assigneeUserId: string | null | undefined,
  unitId: string | null,
  status: 'completed' | 'pending' | 'not_completed',
  note?: string,
  dueDate?: string | null
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    let periodQuery = supabase
      .from('routine_periods')
      .select('id')
      .eq('routine_id', routineId);

    if (dueDate) {
      // O dueDate que vem do Tracker geralmente é o final do dia (ex: 2026-03-05T02:59:59.000Z = 23:59 de 04/03).
      // Usa a técnica do TargetPoint universal (T12:00:00Z) para fugir de pular pro dia anterior/seguinte
      const dateObj = new Date(dueDate);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const safeDateString = `${year}-${month}-${day}`;
      const targetPoint = `${safeDateString}T12:00:00Z`;

      periodQuery = periodQuery
        .lte('period_start', targetPoint)
        .gte('period_end', targetPoint)
        .order('period_start', { ascending: false })
        .limit(1);
    } else {
      periodQuery = periodQuery.eq('is_active', true).order('period_start', { ascending: false }).limit(1);
    }

    const { data: activePeriod } = await periodQuery.maybeSingle();

    let activePeriodId = activePeriod?.id;

    if (!activePeriodId && dueDate) {
      // Auto-create a period envelope for this day so the comment has somewhere to live!
      // 'dueDate' is an ISO string like '2026-03-05T02:59:59.000Z' (which is 23:59:59 BRT on Mar 4th)
      const dateObj = new Date(dueDate);
      // Extrair o YYYY-MM-DD usando o fuso horário local (Brasil), não o UTC
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const safeDateString = `${year}-${month}-${day}`;

      // Supabase GMT-3 offsets based on the user's timezone observed so far
      const startPoint = `${safeDateString}T00:00:00-03:00`;
      const endPoint = `${safeDateString}T23:59:59-03:00`;

      const { data: newPeriod } = await supabase
        .from('routine_periods')
        .insert({
          routine_id: routineId,
          period_start: startPoint,
          period_end: endPoint,
          is_active: false // Ensure we don't accidentally leave ghost active periods floating
        })
        .select('id')
        .single();

      if (newPeriod) {
        activePeriodId = newPeriod.id;
      }
    }

    if (!activePeriodId) return;
    let targetCheckin = null;

    if (assigneeUserId && unitId) {
      const { data: checkin } = await supabase
        .from('routine_checkins')
        .select('id')
        .eq('routine_period_id', activePeriodId)
        .eq('assignee_user_id', assigneeUserId)
        .eq('unit_id', unitId)
        .maybeSingle();

      targetCheckin = checkin;
    } else if (assigneeUserId) {
      const { data: checkin } = await supabase
        .from('routine_checkins')
        .select('id')
        .eq('routine_period_id', activePeriodId)
        .eq('assignee_user_id', assigneeUserId)
        .maybeSingle();

      targetCheckin = checkin;
    }

    // Fallback: If no checkin found for user, strictly grab the checkin for this unit
    if (!targetCheckin && unitId) {
      const { data: unitCheckin } = await supabase
        .from('routine_checkins')
        .select('id')
        .eq('routine_period_id', activePeriodId)
        .eq('unit_id', unitId)
        .maybeSingle();

      targetCheckin = unitCheckin;
    }

    if (!targetCheckin) {
      if (!unitId) return; // Precisa ter unidade para criar o checkin

      const { error: insertError } = await supabase
        .from('routine_checkins')
        .insert({
          routine_period_id: activePeriodId,
          unit_id: unitId,
          assignee_user_id: assigneeUserId || user?.id,
          status: status === 'pending' ? 'pending' : status,
          notes: note || null,
          completed_at: status !== 'pending' ? new Date().toISOString() : null,
          completed_by: status !== 'pending' ? (user?.id || assigneeUserId) : null,
        });

      if (insertError) {
        console.error('Failed to create missing checkin:', insertError);
      }
      return; // Já criamos e salvamos a nota.
    }

    // Update the checkin status
    if (status === 'pending') {
      await supabase
        .from('routine_checkins')
        .update({
          status: 'pending',
          completed_at: null,
          completed_by: null,
          notes: null,
        })
        .eq('id', targetCheckin.id);
    } else {
      // Prepare updates object
      const updates: any = {
        status,
        completed_at: new Date().toISOString(),
        completed_by: user?.id || assigneeUserId,
        notes: note || null, // Ensure we send null if empty string/undefined to clear or value if present
      };

      // If we know the assignee, enforce it on the checkin record (claims the checkin if it was null)
      if (assigneeUserId) {
        updates.assignee_user_id = assigneeUserId;
      }

      const { error: updateError } = await supabase
        .from('routine_checkins')
        .update(updates)
        .eq('id', targetCheckin.id);

      if (updateError) {
        console.error('Failed to update routine checkin:', updateError);
        throw updateError;
      }
    }
  } catch (error) {
    console.error('Error updating routine checkin:', error);
  }
}

// Helper function to check and complete parent task when all children are done
async function checkAndCompleteParentTask(parentTaskId: string): Promise<void> {
  try {
    // Get all child tasks
    const { data: childTasks, error } = await supabase
      .from('tasks')
      .select('id, status, unit_id')
      .eq('parent_task_id', parentTaskId);

    if (error) throw error;
    if (!childTasks || childTasks.length === 0) return;

    // Check statuses
    const total = childTasks.length;
    const completed = childTasks.filter(t => t.status === 'concluida').length;
    const na = childTasks.filter(t => t.status === 'nao_aplicavel').length;
    const effectiveCompleted = completed + na;

    let newStatus: 'pendente' | 'em_andamento' | 'concluida' = 'pendente';

    if (effectiveCompleted === total) {
      newStatus = 'concluida';
    } else if (effectiveCompleted > 0) {
      newStatus = 'em_andamento';
    }

    // Get parent task info and ROUTINE info
    const { data: parentTask, error: parentError } = await supabase
      .from('tasks')
      .select('id, status, is_recurring, recurrence_frequency, recurrence_mode, start_date, due_date, title, description, unit_id, sector_id, assigned_to, created_by, priority, parent_task_id, routine_id, routine:routines(id, frequency)')
      .eq('id', parentTaskId)
      .single();

    if (parentError) throw parentError;
    if (!parentTask) return;

    // effective frequency
    const effectiveFreq = parentTask.recurrence_frequency || parentTask.routine?.frequency;

    // Only update if status changed
    if (parentTask.status !== newStatus) {
      // Update the parent task
      await supabase
        .from('tasks')
        .update({
          status: newStatus,
          completed_at: newStatus === 'concluida' ? new Date().toISOString() : null,
        })
        .eq('id', parentTaskId);

      console.log(`Parent task ${parentTaskId} updated to ${newStatus}`);
    }

    // If completed and is recurring (on_completion or schedule mode), create next instance
    if (
      newStatus === 'concluida' &&
      parentTask.status !== 'concluida' && // Only if it wasn't already completed
      parentTask.is_recurring &&
      (parentTask.recurrence_mode === 'on_completion' || parentTask.recurrence_mode === 'schedule') &&
      parentTask.start_date &&
      parentTask.due_date &&
      effectiveFreq
    ) {
      await createNextRecurringInstanceWithChildren({
        ...parentTask,
        recurrence_frequency: effectiveFreq as string
      }, childTasks.map(t => ({ id: t.id, status: t.status, unit_id: t.unit_id || undefined })));
    }
  } catch (error) {
    console.error('Error checking/completing parent task:', error);
  }
}

// Helper function to create next recurring task instance with children
async function createNextRecurringInstanceWithChildren(
  parentTask: {
    id: string;
    title: string;
    description: string | null;
    start_date: string;
    due_date: string;
    recurrence_frequency: string;
    unit_id: string | null;
    sector_id: string | null;
    assigned_to: string | null;
    created_by: string | null;
    priority: number | null;
    routine_id: string | null;
    parent_task_id?: string | null;
    recurrence_mode?: string | null;
  },
  childTasks: { id: string; status: string; unit_id?: string }[]
): Promise<void> {
  const startDate = new Date(parentTask.start_date);
  const dueDate = new Date(parentTask.due_date);
  const duration = dueDate.getTime() - startDate.getTime();

  const now = new Date();
  const nextStart = new Date(now);
  nextStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);

  if (nextStart <= now) {
    nextStart.setDate(nextStart.getDate() + 1);
  }

  const nextDue = new Date(nextStart.getTime() + duration);

  // Create new parent task
  const { data: newParentTask, error: parentError } = await supabase
    .from('tasks')
    .insert({
      title: parentTask.title,
      description: parentTask.description,
      unit_id: parentTask.unit_id,
      sector_id: parentTask.sector_id,
      assigned_to: parentTask.assigned_to,
      created_by: parentTask.created_by,
      start_date: nextStart.toISOString(),
      due_date: nextDue.toISOString(),
      priority: parentTask.priority || 1,
      status: 'pendente',
      is_recurring: true,
      recurrence_frequency: parentTask.recurrence_frequency as 'diaria' | 'semanal' | 'quinzenal' | 'mensal',
      recurrence_mode: (parentTask.recurrence_mode as any) || 'on_completion',
      parent_task_id: parentTask.parent_task_id || parentTask.id,
      routine_id: parentTask.routine_id, // Ensure propagated
    })
    .select('id')
    .single();

  if (parentError || !newParentTask) {
    console.error('Error creating next parent task:', parentError);
    return;
  }

  // Create NEW Routine Period for the next cycle (Fix for Routines View)
  if (parentTask.routine_id) {
    // Deactivate previous periods to prevent view stagnation
    await supabase
      .from('routine_periods')
      .update({ is_active: false })
      .eq('routine_id', parentTask.routine_id)
      .eq('is_active', true);

    const { data: newPeriod, error: periodError } = await supabase
      .from('routine_periods')
      .insert({
        routine_id: parentTask.routine_id,
        period_start: nextStart.toISOString(),
        period_end: nextDue.toISOString(),
        is_active: true,
      })
      .select()
      .single();

    if (periodError) console.error('Error creating next period:', periodError);

    // We should ideally create checkins here too if we want them to appear immediately
    // The original logic created checkins based on Unit IDs.
    const unitIds = [...new Set(childTasks.map(t => t.unit_id).filter(Boolean))];
    if (newPeriod && unitIds.length > 0) {
      const checkins = unitIds.map(uid => ({
        routine_period_id: newPeriod.id,
        unit_id: uid
      }));
      const { error: checkinError } = await supabase.from('routine_checkins').insert(checkins);
      if (checkinError) console.error('Error creating next checkins:', checkinError);
    }
  }

  // Copy Parent Task Assignees
  const { data: parentAssignees } = await supabase
    .from('task_assignees')
    .select('user_id')
    .eq('task_id', parentTask.id);

  if (parentAssignees && parentAssignees.length > 0) {
    await supabase.from('task_assignees').insert(
      parentAssignees.map(a => ({
        task_id: newParentTask.id,
        user_id: a.user_id
      }))
    );
  }

  // Get original child tasks with full details
  const { data: originalChildren, error: childError } = await supabase
    .from('tasks')
    .select('id, title, description, unit_id, sector_id, assigned_to, created_by, priority')
    .eq('parent_task_id', parentTask.id);

  if (childError || !originalChildren) {
    console.error('Error fetching original children:', childError);
    return;
  }

  // Create new child tasks one by one to copy assignees
  for (const child of originalChildren) {
    const { data: newChildTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        title: child.title,
        description: child.description,
        unit_id: child.unit_id,
        sector_id: child.sector_id,
        assigned_to: child.assigned_to,
        created_by: child.created_by,
        start_date: nextStart.toISOString(),
        due_date: nextDue.toISOString(),
        priority: child.priority || 1,
        status: 'pendente' as const,
        parent_task_id: newParentTask.id,
        routine_id: parentTask.routine_id,
      })
      .select('id')
      .single();

    if (insertError || !newChildTask) {
      console.error('Error creating child task:', insertError);
      continue;
    }

    // Fetch and copy assignees for this child task
    const { data: childAssignees } = await supabase
      .from('task_assignees')
      .select('user_id')
      .eq('task_id', child.id);

    if (childAssignees && childAssignees.length > 0) {
      await supabase.from('task_assignees').insert(
        childAssignees.map(a => ({
          task_id: newChildTask.id,
          user_id: a.user_id
        }))
      );
    }
  }

  console.log('Next recurring task created with children:', newParentTask.id);
}

// Helper function to create next recurring task instance
async function createNextRecurringInstance(
  existingTask: {
    title: string;
    description: string | null;
    start_date: string;
    due_date: string;
    recurrence_frequency: string;
    unit_id: string | null;
    sector_id: string | null;
    assigned_to: string | null;
    created_by: string | null;
    priority: number | null;
    parent_task_id: string | null;
    recurrence_mode: string | null;
    routine_id: string | null;
  },
  currentTaskId: string
): Promise<void> {
  const startDate = new Date(existingTask.start_date);
  const dueDate = new Date(existingTask.due_date);
  const duration = dueDate.getTime() - startDate.getTime();

  // Calculate next start date based on frequency
  const now = new Date();
  let nextStart = new Date(now);

  if (existingTask.recurrence_mode === 'schedule') {
    // For Schedule mode, strictly add frequency to Previous Start Date
    nextStart = new Date(startDate);

    switch (existingTask.recurrence_frequency) {
      case 'diaria': nextStart.setDate(nextStart.getDate() + 1); break;
      case 'semanal': nextStart.setDate(nextStart.getDate() + 7); break;
      case 'quinzenal': nextStart.setDate(nextStart.getDate() + 15); break;
      case 'mensal': nextStart.setMonth(nextStart.getMonth() + 1); break;
    }

    // Maintain time part
    nextStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);

  } else {
    // On Completion Mode (Original Logic)
    nextStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);

    // If the calculated time has already passed today, start tomorrow
    if (nextStart <= now) {
      nextStart.setDate(nextStart.getDate() + 1);
    }
  }

  const nextDue = new Date(nextStart.getTime() + duration);

  // Check if instance already exists
  const startOfDay = new Date(nextStart);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(nextStart);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: existingInstance } = await supabase
    .from('tasks')
    .select('id')
    .eq('parent_task_id', existingTask.parent_task_id || currentTaskId)
    .gte('start_date', startOfDay.toISOString())
    .lte('start_date', endOfDay.toISOString())
    .limit(1);

  if (existingInstance && existingInstance.length > 0) {
    console.log('Next recurring instance already exists');
    return;
  }

  // Create new task instance
  const { data: newTask, error } = await supabase
    .from('tasks')
    .insert({
      title: existingTask.title,
      description: existingTask.description,
      unit_id: existingTask.unit_id,
      sector_id: existingTask.sector_id,
      assigned_to: existingTask.assigned_to,
      created_by: existingTask.created_by,
      start_date: nextStart.toISOString(),
      due_date: nextDue.toISOString(),
      priority: existingTask.priority || 1,
      status: 'pendente',
      is_recurring: true,
      recurrence_frequency: existingTask.recurrence_frequency as 'diaria' | 'semanal' | 'quinzenal' | 'mensal',
      recurrence_mode: existingTask.recurrence_mode as 'schedule' | 'on_completion',
      // If it's a root task (parent_task_id is null), keep it null.
      // Do NOT link to the old task, otherwise it becomes a child and disappears from Routine View.
      parent_task_id: existingTask.parent_task_id,
      routine_id: existingTask.routine_id,
    })
    .select('id')
    .single();

  // ALSO Create Period for Single Task Recurrence (if routine_id exists)
  if (existingTask.routine_id) {
    // Deactivate previous periods
    await supabase
      .from('routine_periods')
      .update({ is_active: false })
      .eq('routine_id', existingTask.routine_id)
      .eq('is_active', true);

    await supabase.from('routine_periods').insert({
      routine_id: existingTask.routine_id,
      period_start: nextStart.toISOString(),
      period_end: nextDue.toISOString(),
      is_active: true
    });
    // We don't necessarily creating checkins for single task as checkins are usually for Multi-Unit Routines.
  }

  if (error) {
    console.error('Error creating next recurring instance:', error);
    return;
  }

  if (newTask) {
    // Copy task assignees
    const { data: assignees } = await supabase
      .from('task_assignees')
      .select('user_id')
      .eq('task_id', currentTaskId);

    if (assignees && assignees.length > 0) {
      await supabase
        .from('task_assignees')
        .insert(assignees.map(a => ({ task_id: newTask.id, user_id: a.user_id })));
    }

    // Copy subtasks
    const { data: subtasks } = await supabase
      .from('subtasks')
      .select('title, assigned_to, order_index')
      .eq('task_id', currentTaskId);

    if (subtasks && subtasks.length > 0) {
      await supabase
        .from('subtasks')
        .insert(subtasks.map(s => ({
          task_id: newTask.id,
          title: s.title,
          assigned_to: s.assigned_to,
          order_index: s.order_index,
          is_completed: false,
        })));
    }

    toast.success('Próxima tarefa recorrente criada!');
  }
}

export const useDeleteTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      // First, get the task to check for google_event_id
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('google_event_id')
        .eq('id', taskId)
        .single();

      // Get all child tasks (tarefas filhas) to delete their calendar events too
      const { data: childTasks } = await supabase
        .from('tasks')
        .select('id, google_event_id')
        .eq('parent_task_id', taskId);

      // Delete child tasks first (cascade delete)
      if (childTasks && childTasks.length > 0) {
        // Delete calendar events for child tasks
        for (const child of childTasks) {
          if (child.google_event_id) {
            deleteCalendarEvent(child.google_event_id).catch(console.error);
          }
        }

        // Delete all child tasks
        const { error: childError } = await supabase
          .from('tasks')
          .delete()
          .eq('parent_task_id', taskId);

        if (childError) throw childError;
      }

      // Delete the parent task
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;

      // Delete from Google Calendar if connected
      if (existingTask?.google_event_id) {
        deleteCalendarEvent(existingTask.google_event_id).catch(console.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tracker-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-stats'] });
      toast.success('Tarefa e tarefas filhas excluídas!');
    },
    onError: (error) => {
      console.error('Error deleting task:', error);
      toast.error('Erro ao excluir tarefa');
    },
  });
};

export const useToggleSubtask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ subtaskId, isCompleted }: { subtaskId: string; isCompleted: boolean }) => {
      const { data, error } = await supabase
        .from('subtasks')
        .update({
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .eq('id', subtaskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useBulkDeleteTasks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      if (!taskIds || taskIds.length === 0) return;

      const { data: tasksToDelete } = await supabase
        .from('tasks')
        .select('id, google_event_id')
        .in('id', taskIds);

      if (tasksToDelete) {
        for (const task of tasksToDelete) {
          if (task.google_event_id) {
            deleteCalendarEvent(task.google_event_id).catch(console.error);
          }
        }
      }

      const { error } = await supabase
        .from('tasks')
        .delete()
        .in('id', taskIds);

      if (error) throw error;

      return taskIds;
    },
    onSuccess: (deletedIds) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tracker-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-stats'] });
      queryClient.invalidateQueries({ queryKey: ['child-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['routine-tasks'] });
      toast.success(`${deletedIds?.length || 0} tarefas excluídas`);
    },
    onError: (error) => {
      console.error('Error deleting tasks:', error);
      toast.error('Erro ao excluir tarefas');
    },
  });
};

export const useBulkUpdateStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskIds, status }: { taskIds: string[], status: TablesInsert<'tasks'>['status'] }) => {
      if (!taskIds || taskIds.length === 0) return;

      const { data, error } = await supabase
        .from('tasks')
        .update({
          status,
          completed_at: status === 'concluida' ? new Date().toISOString() : null,
          completed_by: status === 'concluida' ? (await supabase.auth.getUser()).data.user?.id : null
        })
        .in('id', taskIds)
        .select();

      if (error) throw error;

      if (data) {
        for (const task of data) {
          if (task.google_event_id) {
            updateCalendarEvent(
              task.google_event_id,
              task.title,
              task.description,
              task.start_date,
              task.due_date,
              task.status
            ).catch(console.error);
          }
        }
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tracker-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-stats'] });
      queryClient.invalidateQueries({ queryKey: ['child-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['routine-tasks'] });
      toast.success(`${data?.length || 0} tarefas atualizadas`);
    },
    onError: (error) => {
      console.error('Error updating tasks:', error);
      toast.error('Erro ao atualizar tarefas');
    },
  });
};
