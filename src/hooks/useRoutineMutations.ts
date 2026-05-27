import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { generateRoutineTimeline } from '@/utils/routineDates';
import { addYears } from 'date-fns';

type TaskFrequency = 'diaria' | 'semanal' | 'quinzenal' | 'mensal';

interface UnitAssignment {
  unitId: string;
  assignedToIds: string[];
}

type RecurrenceMode = 'schedule' | 'on_completion';

interface CreateRoutineData {
  title: string;
  description?: string;
  frequency: TaskFrequency;
  recurrenceMode?: RecurrenceMode;
}

interface CreateRoutineWithUnitsData extends CreateRoutineData {
  unitAssignments: UnitAssignment[];
  parentAssignedTo?: string | null; // Responsável da rotina/tarefa mãe (backwards compatible)
  parentAssignees?: string[]; // Multiple assignees for parent routine
  sectorId?: string; // Setor automático
  skipWeekendsHolidays?: boolean; // Ignorar feriados e finais de semana
  startDate?: string | null; // Data de início definida pelo usuário
  dueDate?: string | null; // Data de vencimento definida pelo usuário
  monthlyAnchor?: 'date' | 'weekday';
  repeatForever?: boolean;
  recurrenceEndDate?: string | null;
}

interface UpdateRoutineData extends Partial<CreateRoutineData> {
  is_active?: boolean;
  skipWeekendsHolidays?: boolean;
  monthlyAnchor?: 'date' | 'weekday';
  recurrence_mode?: RecurrenceMode;
  startDate?: string | null;
  dueDate?: string | null;
}

export const useCreateRoutine = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateRoutineData) => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      const { data: routine, error } = await supabase
        .from('routines')
        .insert({
          title: data.title,
          description: data.description || null,
          frequency: data.frequency,
          created_by: user.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return routine;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      toast({
        title: 'Rotina criada',
        description: 'A nova rotina foi criada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar rotina',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useCreateRoutineWithUnits = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateRoutineWithUnitsData) => {
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

      // Create the routine (without unit_id - it's optional)
      const { data: routine, error: routineError } = await supabase
        .from('routines')
        .insert({
          title: data.title,
          description: data.description || null,
          frequency: data.frequency,
          recurrence_mode: data.recurrenceMode || 'schedule',
          created_by: user.id,
          is_active: true,
          sector_id: data.sectorId || null,
          // unit_id is optional - only set if there's a single unit assignment
          unit_id: data.unitAssignments.length === 1 ? data.unitAssignments[0].unitId : null,
          custom_schedule: {
            skipWeekendsHolidays: !!data.skipWeekendsHolidays,
            monthlyAnchor: data.monthlyAnchor || 'date'
          },
        })
        .select()
        .single();

      if (routineError) throw routineError;

      // Calculate initial base dates for the timeline generation
      let baseStart: Date;
      let baseEnd: Date;

      if (data.startDate && data.dueDate) {
        baseStart = new Date(data.startDate);
        baseEnd = new Date(data.dueDate);
      } else {
        let now = new Date();
        switch (data.frequency) {
          case 'diaria':
            baseStart = new Date(now);
            baseStart.setHours(0, 0, 0, 0);
            baseEnd = new Date(baseStart);
            baseEnd.setHours(23, 59, 59, 999);
            break;
          case 'semanal':
            const dayOfWeek = now.getDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            baseStart = new Date(now);
            baseStart.setDate(now.getDate() + diffToMonday);
            baseStart.setHours(0, 0, 0, 0);
            baseEnd = new Date(baseStart);
            baseEnd.setDate(baseStart.getDate() + 6);
            baseEnd.setHours(23, 59, 59, 999);
            break;
          case 'quinzenal':
            const dayOfWeek2 = now.getDay();
            const diffToMonday2 = dayOfWeek2 === 0 ? -6 : 1 - dayOfWeek2;
            baseStart = new Date(now);
            baseStart.setDate(now.getDate() + diffToMonday2);
            baseStart.setHours(0, 0, 0, 0);
            baseEnd = new Date(baseStart);
            baseEnd.setDate(baseStart.getDate() + 13);
            baseEnd.setHours(23, 59, 59, 999);
            break;
          case 'mensal':
            baseStart = new Date(now.getFullYear(), now.getMonth(), 1);
            baseEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;
          default:
            baseStart = new Date(now);
            baseStart.setHours(0, 0, 0, 0);
            baseEnd = new Date(baseStart);
            baseEnd.setHours(23, 59, 59, 999);
        }
      }

      // Determine the limit date for the pre-generation
      let limitDate = new Date();
      if (data.repeatForever || !data.recurrenceEndDate) {
        // Limit initial generation to 3 months to prevent client-side screen freezes
        const maxMonthsPreGenerated = 3;
        const targetDate = new Date(baseStart);
        targetDate.setMonth(targetDate.getMonth() + maxMonthsPreGenerated);

        limitDate = targetDate;
      } else {
        limitDate = new Date(data.recurrenceEndDate);

        // Safety cap even if they choose a date 10 years from now
        const maxDateSafety = new Date(baseStart);
        maxDateSafety.setMonth(maxDateSafety.getMonth() + 6);
        if (limitDate > maxDateSafety) {
          limitDate = maxDateSafety;
        }
      }

      // Pre-Generate Timeline
      const timeline = generateRoutineTimeline(baseStart, baseEnd, {
        frequency: data.frequency as 'diaria' | 'semanal' | 'quinzenal' | 'mensal',
        limitDate,
        skipWeekendsHolidays: !!data.skipWeekendsHolidays,
        monthlyAnchor: data.monthlyAnchor || 'date'
      });

      if (timeline.length === 0) {
        throw new Error('Nenhuma data válida gerada para esta rotina.');
      }

      // Add routine assignees (single insert since it belongs to the routine)
      const routineAssigneeIds = data.parentAssignees && data.parentAssignees.length > 0
        ? data.parentAssignees
        : [data.parentAssignedTo || user.id].filter(Boolean);

      if (routineAssigneeIds.length > 0) {
        await supabase
          .from('routine_assignees')
          .insert(routineAssigneeIds.map(userId => ({ routine_id: routine.id, user_id: userId })));
      }

      // Prepare bulk arrays
      const periodsToInsert = timeline.map(t => ({
        routine_id: routine.id,
        period_start: t.start.toISOString(),
        period_end: t.end.toISOString(),
        is_active: true,
      }));

      // Insert periods in chunks to avoid request size limits
      const insertedPeriods: any[] = [];
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < periodsToInsert.length; i += CHUNK_SIZE) {
        const chunk = periodsToInsert.slice(i, i + CHUNK_SIZE);
        const { data: chunkData, error: chunkError } = await supabase
          .from('routine_periods')
          .insert(chunk)
          .select('id, period_start');
        if (chunkError) throw chunkError;
        if (chunkData) insertedPeriods.push(...chunkData);
      }

      const unitIds = data.unitAssignments.map(a => a.unitId);
      const unitAssigneesMap = new Map<string, string[]>();
      data.unitAssignments.forEach(a => {
        unitAssigneesMap.set(a.unitId, a.assignedToIds || []);
      });

      if (unitIds.length > 0) {
        const firstUnitId = unitIds[0];
        const checkinsToInsert: any[] = [];
        const parentTasksToInsert: any[] = [];

        // Build Checkins and Parent Tasks
        for (let i = 0; i < insertedPeriods.length; i++) {
          const period = insertedPeriods[i];
          const t = timeline[i];

          unitIds.forEach(unitId => {
            checkinsToInsert.push({
              routine_period_id: period.id,
              unit_id: unitId,
            });
          });

          parentTasksToInsert.push({
            title: `[Rotina] ${routine.title}`,
            description: data.description || `Rotina ${data.frequency}: ${routine.title}`,
            unit_id: null, // Orchestrator parent task sits globally to map to tracker properly
            sector_id: data.sectorId || null,
            routine_id: routine.id,
            assigned_to: data.parentAssignedTo || user.id,
            created_by: user.id,
            start_date: t.start.toISOString(),
            due_date: t.end.toISOString(),
            status: 'pendente' as const,
            priority: 2,
            parent_task_id: null,
            is_recurring: false, // We don't want the Cron to interact with them anymore!
            recurrence_frequency: data.frequency,
            recurrence_mode: data.recurrenceMode || 'schedule',
          });
        }

        // Bulk Insert checkins
        for (let i = 0; i < checkinsToInsert.length; i += CHUNK_SIZE) {
          const { error } = await supabase.from('routine_checkins').insert(checkinsToInsert.slice(i, i + CHUNK_SIZE));
          if (error) throw error;
        }

        // Bulk Insert Parent Tasks
        const insertedParentTasks: any[] = [];
        for (let i = 0; i < parentTasksToInsert.length; i += CHUNK_SIZE) {
          const chunk = parentTasksToInsert.slice(i, i + CHUNK_SIZE);
          const { data: chunkData, error } = await supabase.from('tasks').insert(chunk).select('id');
          if (error) throw error;
          if (chunkData) insertedParentTasks.push(...chunkData);
        }

        // Parent Task Assignees
        const parentTaskAssigneesToInsert: any[] = [];
        for (const pt of insertedParentTasks) {
          routineAssigneeIds.forEach(userId => {
            parentTaskAssigneesToInsert.push({ task_id: pt.id, user_id: userId });
          });
        }
        for (let i = 0; i < parentTaskAssigneesToInsert.length; i += CHUNK_SIZE) {
          await supabase.from('task_assignees').insert(parentTaskAssigneesToInsert.slice(i, i + CHUNK_SIZE));
        }

        // Child Tasks
        const childTasksToInsert: any[] = [];
        for (let i = 0; i < insertedParentTasks.length; i++) {
          const pt = insertedParentTasks[i];
          const t = timeline[i];

          unitIds.forEach(unitId => {
            const assigneeIds = Array.from(new Set(unitAssigneesMap.get(unitId) || []));
            childTasksToInsert.push({
              title: `[Rotina] ${routine.title}`,
              description: data.description || `Rotina ${data.frequency}: ${routine.title}`,
              unit_id: unitId,
              sector_id: data.sectorId || null,
              routine_id: routine.id,
              assigned_to: assigneeIds[0] || null,
              created_by: user.id,
              start_date: t.start.toISOString(),
              due_date: t.end.toISOString(),
              status: 'pendente' as const,
              priority: 2,
              parent_task_id: pt.id,
            });
          });
        }

        // Bulk Insert Child Tasks
        const insertedChildTasks: any[] = [];
        for (let i = 0; i < childTasksToInsert.length; i += CHUNK_SIZE) {
          const chunk = childTasksToInsert.slice(i, i + CHUNK_SIZE);
          const { data: chunkData, error } = await supabase.from('tasks').insert(chunk).select('id, unit_id');
          if (error) throw error;
          if (chunkData) insertedChildTasks.push(...chunkData);
        }

        // Child Task Assignees
        const childTaskAssigneesToInsert: any[] = [];
        for (const ct of insertedChildTasks) {
          const assigneeIds = Array.from(new Set(unitAssigneesMap.get(ct.unit_id) || []));
          assigneeIds.forEach(userId => {
            childTaskAssigneesToInsert.push({ task_id: ct.id, user_id: userId });
          });
        }
        for (let i = 0; i < childTaskAssigneesToInsert.length; i += CHUNK_SIZE) {
          await supabase.from('task_assignees').insert(childTaskAssigneesToInsert.slice(i, i + CHUNK_SIZE));
        }

      } else {
        // No units selected (Admins/Gestores sem unidade)
        if (!isAdminOrGestor && !userUnitId) {
          throw new Error('Você precisa estar associado a uma unidade para criar rotinas.');
        }

        const checkinsToInsert: any[] = [];
        const parentTasksToInsert: any[] = [];

        for (let i = 0; i < insertedPeriods.length; i++) {
          const period = insertedPeriods[i];
          const t = timeline[i];

          if (userUnitId) {
            checkinsToInsert.push({
              routine_period_id: period.id,
              unit_id: userUnitId,
            });
          }

          parentTasksToInsert.push({
            title: `[Rotina] ${routine.title}`,
            description: data.description || `Rotina ${data.frequency}: ${routine.title}`,
            unit_id: userUnitId || null,
            sector_id: data.sectorId || null,
            routine_id: routine.id,
            assigned_to: data.parentAssignedTo || user.id,
            created_by: user.id,
            start_date: t.start.toISOString(),
            due_date: t.end.toISOString(),
            status: 'pendente' as const,
            priority: 2,
            parent_task_id: null,
            is_recurring: false, // Cron decoupled
            recurrence_frequency: data.frequency,
            recurrence_mode: data.recurrenceMode || 'schedule',
          });
        }

        for (let i = 0; i < checkinsToInsert.length; i += CHUNK_SIZE) {
          await supabase.from('routine_checkins').insert(checkinsToInsert.slice(i, i + CHUNK_SIZE));
        }

        for (let i = 0; i < parentTasksToInsert.length; i += CHUNK_SIZE) {
          await supabase.from('tasks').insert(parentTasksToInsert.slice(i, i + CHUNK_SIZE));
        }
      }

      return routine;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      queryClient.invalidateQueries({ queryKey: ['routine-periods'] });
      queryClient.invalidateQueries({ queryKey: ['current-period-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['user-subtasks'] });
      toast({
        title: 'Rotina criada',
        description: 'A rotina foi criada com tarefas e subtarefas para cada unidade.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar rotina',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateRoutine = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateRoutineData }) => {

      const updatePayload: any = { ...data };

      // Extract properties that shouldn't go directly to the routines table
      const { startDate, dueDate, recurrenceMode, skipWeekendsHolidays, monthlyAnchor, ...routineUpdatePayload } = updatePayload;

      // Update custom_schedule if skipWeekendsHolidays OR monthlyAnchor provided
      if (skipWeekendsHolidays !== undefined || monthlyAnchor !== undefined) {
        routineUpdatePayload.custom_schedule = {
          skipWeekendsHolidays: skipWeekendsHolidays ?? false,
          monthlyAnchor: monthlyAnchor ?? 'date'
        };
      }

      if (recurrenceMode && !routineUpdatePayload.recurrence_mode) {
        routineUpdatePayload.recurrence_mode = recurrenceMode;
      }

      const { data: routine, error } = await supabase
        .from('routines')
        .update(routineUpdatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Update tasks dates for active tasks of this routine
      if (startDate !== undefined || dueDate !== undefined) {
        const taskUpdate: any = {};
        if (startDate !== undefined) taskUpdate.start_date = startDate;
        if (dueDate !== undefined) taskUpdate.due_date = dueDate;

        if (Object.keys(taskUpdate).length > 0) {
          const { error: taskError } = await supabase
            .from('tasks')
            .update(taskUpdate)
            .eq('routine_id', id)
            .in('status', ['pendente', 'em_andamento', 'atrasada']);

          if (taskError) {
            console.error("Error updating tasks dates for routine:", taskError);
          }
        }
      }

      return routine;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Rotina atualizada',
        description: 'A rotina foi atualizada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar rotina',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteRoutine = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // 1. Soft-delete the routine
      const { error } = await supabase
        .from('routines')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      // 2. Cascade delete all pending future tasks for this routine so they don't haunt the dashboards
      await supabase
        .from('tasks')
        .delete()
        .eq('routine_id', id)
        .eq('status', 'pendente');

      // 3. Cascade delete all future periods for this routine
      const today = new Date().toISOString();
      await supabase
        .from('routine_periods')
        .delete()
        .eq('routine_id', id)
        .gte('start_date', today);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      toast({
        title: 'Rotina removida',
        description: 'A rotina foi desativada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover rotina',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};
