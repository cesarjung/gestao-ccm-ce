import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Types for the new tables (not yet in generated types)
interface RoutinePeriod {
  id: string;
  routine_id: string;
  period_start: string;
  period_end: string;
  is_active: boolean;
  created_at: string;
}

interface RoutineCheckin {
  id: string;
  routine_period_id: string;
  unit_id: string;
  assignee_user_id: string | null;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
  status: 'pending' | 'completed' | 'not_completed';
  created_at: string;
}

interface RoutineCheckinWithDetails extends RoutineCheckin {
  unit?: {
    id: string;
    name: string;
    code: string;
  };
  assignee_profile?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  completed_by_profile?: {
    id: string;
    full_name: string | null;
    email: string;
  };
}

interface RoutinePeriodWithCheckins extends RoutinePeriod {
  routine_checkins: RoutineCheckinWithDetails[];
}

export const useRoutinePeriods = (routineId?: string) => {
  return useQuery({
    queryKey: ['routine-periods', routineId],
    queryFn: async () => {
      let query = supabase
        .from('routine_periods')
        .select(`
          *,
          routine_checkins (
            *,
            unit:units (id, name, code)
          )
        `)
        .eq('is_active', true)
        .order('period_start', { ascending: false });

      if (routineId) {
        query = query.eq('routine_id', routineId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch assignee profiles separately
      const checkinIds = data?.flatMap(p => p.routine_checkins?.map(c => c.assignee_user_id).filter(Boolean)) || [];
      const uniqueUserIds = [...new Set(checkinIds)];

      let profilesMap = new Map();
      if (uniqueUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', uniqueUserIds);

        profiles?.forEach(p => profilesMap.set(p.id, p));
      }

      // Enrich checkins with assignee profiles
      const enrichedData = data?.map(period => ({
        ...period,
        routine_checkins: period.routine_checkins?.map(checkin => ({
          ...checkin,
          assignee_profile: checkin.assignee_user_id ? profilesMap.get(checkin.assignee_user_id) : null,
        })) || [],
      }));

      return enrichedData as RoutinePeriodWithCheckins[];
    },
    enabled: !!routineId,
  });
};

// Hook to get all active periods for all routines (for the list view)
export const useAllActiveRoutinePeriods = () => {
  return useQuery({
    queryKey: ['all-active-routine-periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('routine_periods')
        .select('routine_id, period_start, period_end')
        .eq('is_active', true)
        .order('period_start', { ascending: false });

      if (error) throw error;

      // Create a map of routine_id to its active period
      const periodsByRoutine: Record<string, { period_start: string; period_end: string }> = {};
      data?.forEach(period => {
        if (!periodsByRoutine[period.routine_id]) {
          periodsByRoutine[period.routine_id] = {
            period_start: period.period_start,
            period_end: period.period_end,
          };
        }
      });

      return periodsByRoutine;
    },
  });
};

export const useCurrentPeriodCheckins = (routineId: string, contextDate?: string, exactDate?: string) => {
  return useQuery({
    queryKey: ['current-period-checkins', routineId, contextDate, exactDate],
    queryFn: async () => {
      // Get routine info
      const { data: routine, error: routineError } = await supabase
        .from('routines')
        .select('frequency')
        .eq('id', routineId)
        .single();

      if (routineError) throw routineError;

      // Get the most recent active period for this routine (current or future)
      let query = supabase
        .from('routine_periods')
        .select(`
          *,
          routine_checkins (
            *,
            unit:units (id, name, code)
          )
        `)
        .eq('routine_id', routineId);

      if (exactDate) {
        // O exactDate que vem do Grid geralmente é o final do dia (ex: 2026-03-05T02:59:59.000Z = 23:59 de 04/03).
        // Se usarmos ele puro, ele pode cair exatamente 1 segundo ANTES do 'period_start' do dia 05/03.
        // A melhor forma é converter isso pro fuso local de volta, extrair a data correta (04/03 ou 05/03) 
        // e ancorar no meio-dia universal (que cruza 100% da janela daquele dia).

        const dateObj = new Date(exactDate);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const safeDateString = `${year}-${month}-${day}`;
        const targetPoint = `${safeDateString}T12:00:00Z`;

        query = query
          .lte('period_start', targetPoint)
          .gte('period_end', targetPoint)
          .order('period_start', { ascending: false })
          .limit(1);
      } else if (contextDate) {
        // Fallback Mestre: a âncora do meio-dia (12:00:00Z) para ignorar fusos horários locais.
        // O Supabase salva periods que começam 03:00 de hoje até 02:59 de amanhã (GMT-3).
        // Um ponto fixo no meio-dia universal (T12:00:00Z) sempre interseciona essa janela!
        const safeDateString = contextDate.substring(0, 10);
        const targetPoint = `${safeDateString}T12:00:00Z`;

        query = query
          .lte('period_start', targetPoint)
          .gte('period_end', targetPoint)
          .order('period_start', { ascending: false })
          .limit(1);
      } else {
        query = query.eq('is_active', true).order('period_start', { ascending: false }).limit(1);
      }

      let { data: period, error: periodError } = await query.maybeSingle();

      if (periodError) throw periodError;

      // Fetch assignee profiles
      let enrichedPeriod = period;
      if (period?.routine_checkins) {
        const userIds = period.routine_checkins
          .map(c => c.assignee_user_id)
          .filter(Boolean);
        const uniqueUserIds = [...new Set(userIds)];

        let profilesMap = new Map();
        if (uniqueUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', uniqueUserIds);

          profiles?.forEach(p => profilesMap.set(p.id, p));
        }

        enrichedPeriod = {
          ...period,
          routine_checkins: period.routine_checkins.map(checkin => ({
            ...checkin,
            assignee_profile: checkin.assignee_user_id ? profilesMap.get(checkin.assignee_user_id) : null,
          })),
        };
      }

      return {
        period: enrichedPeriod as RoutinePeriodWithCheckins | null,
        frequency: routine.frequency,
      };
    },
    enabled: !!routineId,
  });
};

export const useCreatePeriodWithCheckins = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ routineId, periodStart, periodEnd }: {
      routineId: string;
      periodStart: Date;
      periodEnd: Date;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Get routine info
      const { data: routine, error: routineError } = await supabase
        .from('routines')
        .select('title, description, unit_id, sector_id')
        .eq('id', routineId)
        .single();

      if (routineError) throw routineError;

      // Find all units that were previously associated with this routine
      const { data: existingRoutineTasks } = await supabase
        .from('tasks')
        .select('unit_id')
        .eq('routine_id', routineId)
        .not('parent_task_id', 'is', null);

      const routineUnitIdsSet = new Set<string>();
      if (routine.unit_id) routineUnitIdsSet.add(routine.unit_id);
      existingRoutineTasks?.forEach(t => t.unit_id && routineUnitIdsSet.add(t.unit_id));
      
      const routineUnitIds = Array.from(routineUnitIdsSet);

      // Get routine assignees (users assigned to this routine)
      const { data: assignees, error: assigneesError } = await supabase
        .from('routine_assignees')
        .select('user_id, profiles:user_id(unit_id, full_name)')
        .eq('routine_id', routineId);

      if (assigneesError) throw assigneesError;

      const { data: allManagers } = await supabase.from('unit_managers').select('unit_id, user_id');

      // Build the strict UTC borders for the targeted day, preserving the exact day the user requested
      const year = periodStart.getFullYear();
      const month = String(periodStart.getMonth() + 1).padStart(2, '0');
      const day = String(periodStart.getDate()).padStart(2, '0');

      // The period should range from midnight to 23:59:59 exactly in BRT (-03:00). 
      // Supabase will automatically store this as 03:00:00 of today until 02:59:59 of tomorrow in UTC 
      const exactStart = `${year}-${month}-${day}T00:00:00-03:00`;
      const exactEnd = `${year}-${month}-${day}T23:59:59-03:00`;

      // Upsert / Busca Segura do period
      let period;
      const { data: existingPeriod } = await supabase
        .from('routine_periods')
        .select('*')
        .eq('routine_id', routineId)
        .eq('period_start', exactStart)
        .maybeSingle();

      if (existingPeriod) {
        period = existingPeriod;
      } else {
        const { data: newPeriod, error: periodError } = await supabase
          .from('routine_periods')
          .insert({
            routine_id: routineId,
            period_start: exactStart,
            period_end: exactEnd,
            is_active: true,
          })
          .select()
          .single();
        if (periodError) throw periodError;
        period = newPeriod;
      }

      // Upsert / Busca Segura do Parent Task
      let parentTask;
      const { data: existingParentTask } = await supabase
        .from('tasks')
        .select('*')
        .eq('routine_id', routineId)
        .is('parent_task_id', null)
        .eq('start_date', periodStart.toISOString())
        .maybeSingle();

      if (existingParentTask) {
        parentTask = existingParentTask;
      } else {
        const { data: newParentTask, error: parentTaskError } = await supabase
          .from('tasks')
          .insert({
            title: `[Rotina] ${routine.title}`,
            description: routine.description,
            routine_id: routineId,
            unit_id: routine.unit_id,
            sector_id: routine.sector_id,
            created_by: user.id,
            due_date: periodEnd.toISOString(),
            start_date: periodStart.toISOString(),
            status: 'pendente',
          })
          .select()
          .single();
        if (parentTaskError) throw parentTaskError;
        parentTask = newParentTask;
      }

      // Create checkins and child tasks
      const checkins: any[] = [];
      const childTasks: any[] = [];
      const processedUnits = new Set<string>();

      // FETCH EXISTENTES PARA DEDUPLICAÇÃO SE O PERIODO JÁ EXISTIA
      if (existingPeriod) {
        const { data: existingCheckins } = await supabase
          .from('routine_checkins')
          .select('unit_id')
          .eq('routine_period_id', period.id);

        existingCheckins?.forEach(c => c.unit_id && processedUnits.add(c.unit_id));
      }

      const existingTasksByUnit = new Set<string>();
      if (existingParentTask) {
        const { data: existingTasks } = await supabase
          .from('tasks')
          .select('unit_id')
          .eq('parent_task_id', parentTask.id);

        existingTasks?.forEach(t => t.unit_id && existingTasksByUnit.add(t.unit_id));
      }

      // 1. Process Assignees (if any)
      if (assignees && assignees.length > 0) {
        for (const assignee of assignees) {
          const assigneeProfile = assignee.profiles as any;
          // Coletar todas as unidades possíveis deste usuário
          const userUnits = new Set<string>();

          if (assigneeProfile?.unit_id) {
            userUnits.add(assigneeProfile.unit_id);
          }
          if (routine.unit_id) {
            userUnits.add(routine.unit_id);
          }

          const managedUnits = allManagers?.filter(m => m.user_id === assignee.user_id) || [];
          managedUnits.forEach(m => userUnits.add(m.unit_id));

          // Somente unidades que importam pra esta rotina
          let validUnits = Array.from(userUnits);
          if (routineUnitIds.length > 0) {
            validUnits = validUnits.filter(u => routineUnitIds.includes(u));
          }

          if (validUnits.length === 0 && routine.unit_id) {
            validUnits = [routine.unit_id];
          }

          for (const assigneeUnitId of validUnits) {
            // Create checkin ONLY ONCE per unit, AND ONLY IF unit exists
            if (assigneeUnitId && !processedUnits.has(assigneeUnitId)) {
              checkins.push({
                routine_period_id: period.id,
                unit_id: assigneeUnitId,
                assignee_user_id: assignee.user_id,
                status: 'pending',
              });
              processedUnits.add(assigneeUnitId);
            }

            // Create child task para esta conjunção Usuario+Unidade se não existir
            if (!existingTasksByUnit.has(assigneeUnitId)) {
              childTasks.push({
                title: `[Rotina] ${routine.title}`,
                description: routine.description,
                routine_id: routineId,
                parent_task_id: parentTask.id,
                unit_id: assigneeUnitId,
                sector_id: routine.sector_id,
                assigned_to: assignee.user_id,
                created_by: user.id,
                due_date: periodEnd.toISOString(),
                start_date: periodStart.toISOString(),
                status: 'pendente',
              });
              existingTasksByUnit.add(assigneeUnitId);
            }
          }
        }
      }

      // 2. Process remaining units that didn't have any specific assignee
      for (const unitId of routineUnitIds) {
        if (!processedUnits.has(unitId)) {
          checkins.push({
            routine_period_id: period.id,
            unit_id: unitId,
            assignee_user_id: null,
            status: 'pending',
          });
          processedUnits.add(unitId);
        }

        if (!existingTasksByUnit.has(unitId)) {
          childTasks.push({
            title: `[Rotina] ${routine.title}`,
            description: routine.description,
            routine_id: routineId,
            parent_task_id: parentTask.id,
            unit_id: unitId,
            sector_id: routine.sector_id,
            assigned_to: null, // No specific user assigned
            created_by: user.id,
            due_date: periodEnd.toISOString(),
            start_date: periodStart.toISOString(),
            status: 'pendente',
          });
          existingTasksByUnit.add(unitId);
        }
      }

      // Insert checkins ONLY if we have new ones
      if (checkins.length > 0) {
        const { error: checkinsError } = await supabase
          .from('routine_checkins')
          .insert(checkins);
        if (checkinsError) throw checkinsError;
      }

      // Insert child tasks ONLY if we have new ones
      let createdChildTasks: any[] = [];
      if (childTasks.length > 0) {
        const { data, error: childTasksError } = await supabase
          .from('tasks')
          .insert(childTasks)
          .select();
        if (childTasksError) throw childTasksError;
        createdChildTasks = data || [];
      }

      // Add task assignees for each child task
      if (createdChildTasks && createdChildTasks.length > 0) {
        const taskAssignees = createdChildTasks
          .filter(task => task.assigned_to)
          .map(task => ({
            task_id: task.id,
            user_id: task.assigned_to,
          }));

        if (taskAssignees.length > 0) {
          await supabase.from('task_assignees').insert(taskAssignees);
        }
      }

      return period;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routine-periods'] });
      queryClient.invalidateQueries({ queryKey: ['current-period-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['all-active-routine-periods'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['user-tasks'] });
      toast({
        title: 'Período criado',
        description: 'Tarefas criadas para os responsáveis da rotina.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar período',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useCompleteCheckin = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ checkinId, notes }: { checkinId: string; notes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('routine_checkins')
        .update({
          completed_by: user.id,
          completed_at: new Date().toISOString(),
          notes: notes || null,
          status: 'completed',
        })
        .eq('id', checkinId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routine-periods'] });
      queryClient.invalidateQueries({ queryKey: ['current-period-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['routines'] });

      // Dashboard invalidations
      queryClient.invalidateQueries({ queryKey: ['units-summary'] });
      queryClient.invalidateQueries({ queryKey: ['overall-stats'] });
      queryClient.invalidateQueries({ queryKey: ['unit-routine-status'] });
      queryClient.invalidateQueries({ queryKey: ['responsible-routine-status'] });

      toast({
        title: 'Check-in concluído',
        description: 'O checkin foi marcado como concluído.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao completar checkin',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useMarkCheckinNotCompleted = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ checkinId, notes }: { checkinId: string; notes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('routine_checkins')
        .update({
          completed_by: user.id,
          completed_at: new Date().toISOString(),
          notes: notes || null,
          status: 'not_completed',
        })
        .eq('id', checkinId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routine-periods'] });
      queryClient.invalidateQueries({ queryKey: ['current-period-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['routines'] });

      // Dashboard invalidations
      queryClient.invalidateQueries({ queryKey: ['units-summary'] });
      queryClient.invalidateQueries({ queryKey: ['overall-stats'] });
      queryClient.invalidateQueries({ queryKey: ['unit-routine-status'] });
      queryClient.invalidateQueries({ queryKey: ['responsible-routine-status'] });

      toast({
        title: 'Marcado como não concluído',
        description: 'O checkin foi marcado como não foi possível realizar.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao marcar checkin',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useUndoCheckin = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (checkinId: string) => {
      const { data, error } = await supabase
        .from('routine_checkins')
        .update({
          completed_by: null,
          completed_at: null,
          notes: null,
          status: 'pending',
        })
        .eq('id', checkinId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routine-periods'] });
      queryClient.invalidateQueries({ queryKey: ['current-period-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['routines'] });

      // Dashboard invalidations
      queryClient.invalidateQueries({ queryKey: ['units-summary'] });
      queryClient.invalidateQueries({ queryKey: ['overall-stats'] });
      queryClient.invalidateQueries({ queryKey: ['unit-routine-status'] });
      queryClient.invalidateQueries({ queryKey: ['responsible-routine-status'] });

      toast({
        title: 'Check-in desfeito',
        description: 'O checkin foi desmarcado.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao desfazer checkin',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};
