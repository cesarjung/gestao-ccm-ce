import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import type { Tables, Enums } from '@/integrations/supabase/types';

export type Routine = Tables<'routines'> & {
  status?: 'pendente' | 'em_andamento' | 'concluida' | 'atrasada' | 'cancelada' | 'inativa';
  active_statuses?: string[];
};
export type TaskFrequency = Enums<'task_frequency'>;

export const useRoutines = (unitId?: string) => {
  const { user } = useAuth();
  const { data: role } = useUserRole();

  return useQuery({
    queryKey: ['routines', unitId, user?.id, role],
    queryFn: async () => {
      let query = supabase
        .from('routines')
        .select('*, routine_periods(id, period_start, period_end, is_active)')
        .eq('is_active', true)
        .order('title');

      if (unitId) {
        query = query.eq('unit_id', unitId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Se usuário não é admin/gestor, filtrar para mostrar apenas rotinas relevantes
      if (role === 'usuario' && user?.id) {
        // Buscar unit_id do usuário
        const { data: profile } = await supabase
          .from('profiles')
          .select('unit_id')
          .eq('id', user.id)
          .single();

        const userUnitId = profile?.unit_id;

        // Buscar rotinas atribuídas ao usuário diretamente na rotina
        const { data: routineAssignees } = await supabase
          .from('routine_assignees')
          .select('routine_id')
          .eq('user_id', user.id);

        const assignedRoutineIds = new Set(routineAssignees?.map(ra => ra.routine_id) || []);

        // NOVO: Buscar rotinas das quais o usuário é responsável por uma TAREFA específica
        const { data: taskAssignees } = await supabase
          .from('task_assignees')
          .select('task:tasks(routine_id)')
          .eq('user_id', user.id);

        if (taskAssignees && taskAssignees.length > 0) {
          taskAssignees.forEach((ta: any) => {
            if (ta.task && ta.task.routine_id) {
              assignedRoutineIds.add(ta.task.routine_id);
            }
          });
        }

        // NOVO 2: Buscar rotinas das quais o usuário é responsável via coluna assigned_to legado nas tasks
        const { data: directTasks } = await supabase
          .from('tasks')
          .select('routine_id')
          .eq('assigned_to', user.id);

        if (directTasks && directTasks.length > 0) {
          directTasks.forEach((t: any) => {
            if (t.routine_id) {
              assignedRoutineIds.add(t.routine_id);
            }
          });
        }

        // Buscar rotinas que têm checkins para a unidade do usuário
        let routinesWithUserUnitCheckins = new Set<string>();
        if (userUnitId) {
          const { data: checkins } = await supabase
            .from('routine_checkins')
            .select('routine_period_id')
            .eq('unit_id', userUnitId);

          if (checkins && checkins.length > 0) {
            const periodIds = checkins.map(c => c.routine_period_id);
            const { data: periods } = await supabase
              .from('routine_periods')
              .select('routine_id')
              .in('id', periodIds);

            routinesWithUserUnitCheckins = new Set(periods?.map(p => p.routine_id) || []);
          }
        }

        return (data as Routine[]).filter(routine => {
          // Mostrar se for o criador da rotina
          if (routine.created_by === user.id) return true;
          // Mostrar se o usuário está na tabela routine_assignees
          if (assignedRoutineIds.has(routine.id)) return true;
          // Mostrar se a rotina é da unidade do usuário
          if (userUnitId && routine.unit_id === userUnitId) return true;
          // Mostrar se existe um checkin para a unidade do usuário nesta rotina
          if (routinesWithUserUnitCheckins.has(routine.id)) return true;
          return false;
        });

        const routineIds = routinesToCalculateStatus.map(r => r.id);

        if (routineIds.length === 0) return routinesToCalculateStatus;

        // Fetch active tasks to determine routine status accurately
        const todayStr = new Date().toISOString().substring(0, 10);

        let activeTasksQuery = supabase
          .from('tasks')
          .select('routine_id, status, due_date, unit_id, assigned_to')
          .in('routine_id', routineIds)
          .lte('due_date', `${todayStr}T23:59:59.999Z`);

        // NOVO: if NOT admin/gestor, regular users should only have their routines evaluated based on tasks THEY can see.
        // The tasks should either belong to their unit, or be explicitly assigned to them.
        // We use an OR filter to achieve this intersection in the calculation loop.
        if (userUnitId) {
          activeTasksQuery = activeTasksQuery.or(`unit_id.eq.${userUnitId},assigned_to.eq.${user.id}`);
        } else {
          activeTasksQuery = activeTasksQuery.eq('assigned_to', user.id);
        }

        const { data: activeTasks } = await activeTasksQuery;

        // Create a map of routine_id to its most relevant status
        const routineStatusMap = new Map<string, Routine['status']>();
        const routineActiveStatusesMap = new Map<string, string[]>();

        if (activeTasks) {
          // Group tasks by routine
          const tasksByRoutine = activeTasks.reduce((acc, task) => {
            if (!acc[task.routine_id]) acc[task.routine_id] = [];

            let effectiveStatus = task.status;
            if (effectiveStatus === 'pendente' && task.due_date) {
              const taskDate = task.due_date.substring(0, 10);
              if (taskDate < todayStr) {
                effectiveStatus = 'atrasada';
              }
            }
            acc[task.routine_id].push(effectiveStatus);
            return acc;
          }, {} as Record<string, string[]>);

          // Determine priority status and active statuses
          Object.entries(tasksByRoutine).forEach(([routineId, statuses]: [string, string[]]) => {
            if (statuses.includes('atrasada')) {
              routineStatusMap.set(routineId, 'atrasada');
            } else if (statuses.includes('em_andamento')) {
              routineStatusMap.set(routineId, 'em_andamento');
            } else if (statuses.includes('pendente')) {
              routineStatusMap.set(routineId, 'pendente');
            } else if (statuses.every(s => s === 'concluida' || s === 'cancelada' || s === 'nao_aplicavel')) {
              routineStatusMap.set(routineId, 'concluida');
            } else {
              routineStatusMap.set(routineId, 'pendente');
            }

            const uniqueStatuses = Array.from(new Set(statuses));
            if (uniqueStatuses.every(s => s === 'concluida' || s === 'cancelada' || s === 'nao_aplicavel')) {
              routineActiveStatusesMap.set(routineId, ['concluida']);
            } else {
              const active = uniqueStatuses.filter(s => s !== 'concluida' && s !== 'cancelada' && s !== 'nao_aplicavel');
              routineActiveStatusesMap.set(routineId, active.length ? active : ['concluida']);
            }
          });
        }

        const routinesWithStatus = routinesToCalculateStatus.map(r => ({
          ...r,
          status: !r.is_active
            ? 'inativa'
            : (routineStatusMap.get(r.id) || 'concluida'),
          active_statuses: !r.is_active
            ? ['inativa']
            : (routineActiveStatusesMap.get(r.id) || ['concluida'])
        })) as Routine[];

        return routinesWithStatus;
      }

      // ----------------------------------------------------------------------
      // If role is ADMIN or GESTOR (Bypass Visibility Filtering)
      // ----------------------------------------------------------------------

      const routines = data as Routine[];
      const routineIds = routines.map(r => r.id);

      if (routineIds.length === 0) return routines;

      // Fetch active tasks to determine routine status accurately
      const todayStr = new Date().toISOString().substring(0, 10);

      const { data: activeTasks } = await supabase
        .from('tasks')
        .select('routine_id, status, due_date')
        .in('routine_id', routineIds)
        .lte('due_date', `${todayStr}T23:59:59.999Z`);

      // Create a map of routine_id to its most relevant status
      const routineStatusMap = new Map<string, Routine['status']>();
      const routineActiveStatusesMap = new Map<string, string[]>();

      if (activeTasks) {
        // Group tasks by routine
        const tasksByRoutine = activeTasks.reduce((acc, task) => {
          if (!acc[task.routine_id]) acc[task.routine_id] = [];

          let effectiveStatus = task.status;
          if (effectiveStatus === 'pendente' && task.due_date) {
            const taskDate = task.due_date.substring(0, 10);
            if (taskDate < todayStr) {
              effectiveStatus = 'atrasada';
            }
          }
          acc[task.routine_id].push(effectiveStatus);
          return acc;
        }, {} as Record<string, string[]>);

        // Determine priority status and active statuses
        Object.entries(tasksByRoutine).forEach(([routineId, statuses]: [string, string[]]) => {
          if (statuses.includes('atrasada')) {
            routineStatusMap.set(routineId, 'atrasada');
          } else if (statuses.includes('em_andamento')) {
            routineStatusMap.set(routineId, 'em_andamento');
          } else if (statuses.includes('pendente')) {
            routineStatusMap.set(routineId, 'pendente');
          } else if (statuses.every(s => s === 'concluida' || s === 'cancelada' || s === 'nao_aplicavel')) {
            routineStatusMap.set(routineId, 'concluida');
          } else {
            routineStatusMap.set(routineId, 'pendente');
          }

          const uniqueStatuses = Array.from(new Set(statuses));
          if (uniqueStatuses.every(s => s === 'concluida' || s === 'cancelada' || s === 'nao_aplicavel')) {
            routineActiveStatusesMap.set(routineId, ['concluida']);
          } else {
            const active = uniqueStatuses.filter(s => s !== 'concluida' && s !== 'cancelada' && s !== 'nao_aplicavel');
            routineActiveStatusesMap.set(routineId, active.length ? active : ['concluida']);
          }
        });
      }

      const routinesWithStatus = routines.map(r => ({
        ...r,
        status: !r.is_active
          ? 'inativa'
          : (routineStatusMap.get(r.id) || 'concluida'),
        active_statuses: !r.is_active
          ? ['inativa']
          : (routineActiveStatusesMap.get(r.id) || ['concluida'])
      })) as Routine[];

      return routinesWithStatus;
    },
    enabled: !!user?.id,
  });
};

export const useDeleteRoutines = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (routineIds: string[]) => {
      const { error } = await supabase
        .from('routines')
        .delete()
        .in('id', routineIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
};

export const useRoutinesByFrequency = (frequency: TaskFrequency) => {
  const { user } = useAuth();
  const { data: role } = useUserRole();

  return useQuery({
    queryKey: ['routines', 'frequency', frequency, user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('routines')
        .select('*')
        .eq('frequency', frequency)
        .eq('is_active', true)
        .order('title');

      if (error) throw error;

      // Se usuário não é admin/gestor, filtrar
      if (role === 'usuario' && user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('unit_id')
          .eq('id', user.id)
          .single();

        const userUnitId = profile?.unit_id;

        const { data: routineAssignees } = await supabase
          .from('routine_assignees')
          .select('routine_id')
          .eq('user_id', user.id);

        const assignedRoutineIds = new Set(routineAssignees?.map(ra => ra.routine_id) || []);

        // Buscar rotinas que têm checkins para a unidade do usuário
        let routinesWithUserUnitCheckins = new Set<string>();
        if (userUnitId) {
          const { data: checkins } = await supabase
            .from('routine_checkins')
            .select('routine_period_id')
            .eq('unit_id', userUnitId);

          if (checkins && checkins.length > 0) {
            const periodIds = checkins.map(c => c.routine_period_id);
            const { data: periods } = await supabase
              .from('routine_periods')
              .select('routine_id')
              .in('id', periodIds);

            routinesWithUserUnitCheckins = new Set(periods?.map(p => p.routine_id) || []);
          }
        }

        return (data as Routine[]).filter(routine => {
          if (routine.created_by === user.id) return true;
          if (assignedRoutineIds.has(routine.id)) return true;
          if (userUnitId && routine.unit_id === userUnitId) return true;
          if (routinesWithUserUnitCheckins.has(routine.id)) return true;
          return false;
        });
      }

      return data as Routine[];
    },
    enabled: !!user?.id,
  });
};
