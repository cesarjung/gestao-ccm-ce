import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

export type Task = any;
export type TaskStatus = any;

export interface TaskWithDetails extends Task {
  routine?: any;
  unit?: any;
  subtasks?: any[];
  assignees?: any[]; // Array of profiles
}

// Helper function to fetch and merge assignees for a list of tasks
const fetchAndMergeAssignees = async (tasks: TaskWithDetails[]) => {
  if (!tasks || tasks.length === 0) return [];

  const taskIds = tasks.map(t => t.id);

  // 1. Fetch from task_assignees table
  const { data: multipleAssignees } = await supabase
    .from('task_assignees')
    .select('task_id, user_id')
    .in('task_id', taskIds);

  // Collect all unique user IDs involved
  const allUserIds = new Set<string>();
  tasks.forEach(t => {
    if (t.assigned_to) allUserIds.add(t.assigned_to);
  });
  multipleAssignees?.forEach(ma => allUserIds.add(ma.user_id));

  const uniqueUserIds = Array.from(allUserIds);
  let profileMap: Record<string, any> = {};

  if (uniqueUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', uniqueUserIds);

    if (profiles) {
      profiles.forEach(p => {
        profileMap[p.id] = p;
      });
    }
  }

  // Merge profiles into tasks
  return tasks.map(t => {
    const taskUserIds = new Set<string>();
    if (t.assigned_to) taskUserIds.add(t.assigned_to);

    multipleAssignees
      ?.filter(ma => ma.task_id === t.id)
      .forEach(ma => taskUserIds.add(ma.user_id));

    const assignees = Array.from(taskUserIds)
      .map(uid => profileMap[uid])
      .filter(Boolean);

    return {
      ...t,
      assignee: t.assigned_to ? profileMap[t.assigned_to] : null,
      assignees: assignees
    };
  });
};

export const useTasks = (unitId?: string, options?: { enabled?: boolean }) => {
  const { user } = useAuth();
  const { data: role } = useUserRole();

  return useQuery({
    queryKey: ['tasks', unitId, user?.id, role],
    queryFn: async () => {
      // Date limit to prevent fetching thousands of historic tasks
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const twoMonthsAgoStr = twoMonthsAgo.toISOString();

      let query = supabase
        .from('tasks')
        .select(`
          *,
          routine:routines(*),
          unit:units(*),
          subtasks(*)
        `)
        .gte('created_at', twoMonthsAgoStr) // Bound the query!
        .order('due_date', { ascending: true });

      if (unitId) {
        query = query.eq('unit_id', unitId);
      }

      const { data, error } = await query;

      if (error) throw error;

      let filteredTasks = data as TaskWithDetails[];

      // Filter out tasks from inactive routines AND orphan tasks (routine deleted but task remains)
      filteredTasks = filteredTasks.filter(task => {
        // If task has a routine_id but no joined routine data, it's an orphan (zombie) task -> Hide it
        if (task.routine_id && !task.routine) return false;

        if (!task.routine) return true; // Genuine standalone task
        return (task.routine as any).is_active !== false; // Active routine
      });

      // Permission Filtering
      if (role === 'usuario' && user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('unit_id')
          .eq('id', user.id)
          .single();

        const userUnitId = profile?.unit_id;

        const { data: taskAssignees } = await supabase
          .from('task_assignees')
          .select('task_id')
          .eq('user_id', user.id);

        const assignedTaskIds = new Set(taskAssignees?.map(ta => ta.task_id) || []);

        filteredTasks = filteredTasks.filter(task => {
          if (task.assigned_to === user.id) return true;
          if (assignedTaskIds.has(task.id)) return true;
          if (userUnitId && task.unit_id === userUnitId) return true;
          return false;
        });
      }

      // Fetch and merge assignees for the filtered tasks
      return await fetchAndMergeAssignees(filteredTasks);
    },
    enabled: !!user?.id && (options?.enabled !== false),
  });
};

export const useDeleteTasks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .in('id', taskIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-stats'] });
      queryClient.invalidateQueries({ queryKey: ['routine-tasks'] });
    },
  });
};

export const useBulkUpdateTasks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskIds, status }: { taskIds: string[], status: TaskStatus }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status })
        .in('id', taskIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-stats'] });
      queryClient.invalidateQueries({ queryKey: ['routine-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
};

export const useTasksByStatus = (status: TaskStatus) => {
  const { user } = useAuth();
  const { data: role } = useUserRole();

  return useQuery({
    queryKey: ['tasks', 'status', status, user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          routine:routines(*),
          unit:units(*),
          subtasks(*)
        `)
        .eq('status', status)
        .order('due_date', { ascending: true });

      if (error) throw error;

      let filteredTasks = data as TaskWithDetails[];

      // Filter out tasks from inactive routines AND orphan tasks
      filteredTasks = filteredTasks.filter(task => {
        // If task has a routine_id but no joined routine data, it's an orphan (zombie) task -> Hide it
        if (task.routine_id && !task.routine) return false;

        if (!task.routine) return true; // Standalone task
        return (task.routine as any).is_active !== false; // Active routine
      });

      // Permission Filtering
      if (role === 'usuario' && user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('unit_id')
          .eq('id', user.id)
          .single();

        const userUnitId = profile?.unit_id;

        const { data: taskAssignees } = await supabase
          .from('task_assignees')
          .select('task_id')
          .eq('user_id', user.id);

        const assignedTaskIds = new Set(taskAssignees?.map(ta => ta.task_id) || []);

        filteredTasks = filteredTasks.filter(task => {
          if (task.assigned_to === user.id) return true;
          if (assignedTaskIds.has(task.id)) return true;
          if (userUnitId && task.unit_id === userUnitId) return true;
          return false;
        });
      }

      // Fetch and merge assignees for the filtered tasks
      return await fetchAndMergeAssignees(filteredTasks);
    },
    enabled: !!user?.id,
  });
};

export const useTaskStats = () => {
  const { user } = useAuth();
  const { data: role } = useUserRole();

  return useQuery({
    queryKey: ['task-stats', user?.id, role],
    queryFn: async () => {
      const { data: allTasks, error } = await supabase
        .from('tasks')
        .select('id, status, assigned_to, unit_id');

      if (error) throw error;

      let tasks = allTasks;

      // Se usuário não é admin/gestor, filtrar
      if (role === 'usuario' && user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('unit_id')
          .eq('id', user.id)
          .single();

        const userUnitId = profile?.unit_id;

        const { data: taskAssignees } = await supabase
          .from('task_assignees')
          .select('task_id')
          .eq('user_id', user.id);

        const assignedTaskIds = new Set(taskAssignees?.map(ta => ta.task_id) || []);

        tasks = allTasks?.filter(task => {
          if (task.assigned_to === user.id) return true;
          if (assignedTaskIds.has(task.id)) return true;
          if (userUnitId && task.unit_id === userUnitId) return true;
          return false;
        }) || [];
      }

      const stats = {
        total: tasks?.length || 0,
        pendente: tasks?.filter(t => t.status === 'pendente').length || 0,
        em_andamento: tasks?.filter(t => t.status === 'em_andamento').length || 0,
        concluida: tasks?.filter(t => t.status === 'concluida').length || 0,
        atrasada: tasks?.filter(t => t.status === 'atrasada').length || 0,
      };

      return stats;
    },
    enabled: !!user?.id,
  });
};

// Hook to get tasks linked to a specific routine
export const useRoutineTasks = (routineId: string, contextDate?: string, exactDate?: string) => {
  return useQuery({
    queryKey: ['routine-tasks', routineId, contextDate, exactDate],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          unit:units(id, name, code)
        `)
        .eq('routine_id', routineId)
        .is('parent_task_id', null);

      if (exactDate || contextDate) {
        const targetDate = exactDate || contextDate;
        const safeDateString = targetDate!.substring(0, 10); // "YYYY-MM-DD"

        // As tarefas pré-geradas localmente sempre recebem:
        // due_date e start_date estritamente com a string "YYYY-MM-DD"
        // ex: "2025-03-09"
        // Para garantir que a engine do supabase encontre essas datas strings
        // com segurança independentemente de HH:mm:ss, vamos buscar usando strict `like`
        // ou um range gte/lt seguro de 24h exatas limitadas ao timezone UTC.

        const startPoint = `${safeDateString}T00:00:00.000Z`;
        const endPoint = `${safeDateString}T23:59:59.999Z`;

        // Busca hibrida: Tasks novas tem 'YYYY-MM-DD'. Tasks velhas tem ISO.
        query = query.or(`due_date.eq.${safeDateString},and(due_date.gte.${startPoint},due_date.lte.${endPoint})`);
      }

      // Evitar crash do maybeSingle caso existam clones órfãos garantindo ordem descendente
      query = query.order('created_at', { ascending: false }).limit(1);

      const { data: parentTask, error: parentError } = await query.maybeSingle();

      if (parentError) throw parentError;
      if (!parentTask) return { parentTask: null, childTasks: [] };

      // Get child tasks
      const { data: childTasks, error: childError } = await supabase
        .from('tasks')
        .select(`
          *,
          unit:units(id, name, code)
        `)
        .eq('parent_task_id', parentTask.id)
        .order('created_at', { ascending: true });

      if (childError) throw childError;

      // Use the helper to fetch and merge assignees
      const tasksWithAssignees = await fetchAndMergeAssignees(childTasks as TaskWithDetails[]);

      return {
        parentTask,
        childTasks: tasksWithAssignees || [],
      };
    },
    enabled: !!routineId,
  });
};

// Hook to get child tasks for a parent task
export const useChildTasks = (parentTaskId: string | null | undefined) => {
  return useQuery({
    queryKey: ['child-tasks', parentTaskId],
    queryFn: async () => {
      if (!parentTaskId) return [];

      const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
          *,
          unit:units(id, name, code)
        `)
        .eq('parent_task_id', parentTaskId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Use the helper to fetch and merge assignees
      return await fetchAndMergeAssignees(tasks as TaskWithDetails[]);
    },
    enabled: !!parentTaskId,
  });
};
