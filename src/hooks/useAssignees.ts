import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

// Task Assignees
export interface TaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  created_at: string;
  profile?: Tables<'profiles'> | null;
}

export const useTaskAssignees = (taskId?: string) => {
  return useQuery({
    queryKey: ['task-assignees', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      
      // Fetch assignees
      const { data: assignees, error } = await supabase
        .from('task_assignees')
        .select('*')
        .eq('task_id', taskId);

      if (error) throw error;
      
      // Fetch profiles for the assignees
      if (assignees && assignees.length > 0) {
        const userIds = assignees.map(a => a.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);
        
        return assignees.map(a => ({
          ...a,
          profile: profiles?.find(p => p.id === a.user_id) || null,
        })) as TaskAssignee[];
      }
      
      return assignees as TaskAssignee[];
    },
    enabled: !!taskId,
  });
};

export const useAddTaskAssignee = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: string; userId: string }) => {
      const { data, error } = await supabase
        .from('task_assignees')
        .insert({ task_id: taskId, user_id: userId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-assignees', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useRemoveTaskAssignee = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: string; userId: string }) => {
      const { error } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-assignees', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useSetTaskAssignees = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, userIds }: { taskId: string; userIds: string[] }) => {
      // Delete all existing assignees
      await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', taskId);

      // Insert new assignees
      if (userIds.length > 0) {
        const { error } = await supabase
          .from('task_assignees')
          .insert(userIds.map(userId => ({ task_id: taskId, user_id: userId })));

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-assignees', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

// Subtask Assignees
export interface SubtaskAssignee {
  id: string;
  subtask_id: string;
  user_id: string;
  created_at: string;
  profile?: Tables<'profiles'> | null;
}

export const useSubtaskAssignees = (subtaskId?: string) => {
  return useQuery({
    queryKey: ['subtask-assignees', subtaskId],
    queryFn: async () => {
      if (!subtaskId) return [];
      
      const { data, error } = await supabase
        .from('subtask_assignees')
        .select('*')
        .eq('subtask_id', subtaskId);

      if (error) throw error;
      return data as SubtaskAssignee[];
    },
    enabled: !!subtaskId,
  });
};

export const useSetSubtaskAssignees = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ subtaskId, userIds }: { subtaskId: string; userIds: string[] }) => {
      // Delete all existing assignees
      await supabase
        .from('subtask_assignees')
        .delete()
        .eq('subtask_id', subtaskId);

      // Insert new assignees
      if (userIds.length > 0) {
        const { error } = await supabase
          .from('subtask_assignees')
          .insert(userIds.map(userId => ({ subtask_id: subtaskId, user_id: userId })));

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['subtask-assignees', variables.subtaskId] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
    },
  });
};

// Routine Assignees
export interface RoutineAssignee {
  id: string;
  routine_id: string;
  user_id: string;
  created_at: string;
  profile?: Tables<'profiles'> | null;
}

export const useRoutineAssignees = (routineId?: string) => {
  return useQuery({
    queryKey: ['routine-assignees', routineId],
    queryFn: async () => {
      if (!routineId) return [];
      
      const { data, error } = await supabase
        .from('routine_assignees')
        .select('*')
        .eq('routine_id', routineId);

      if (error) throw error;
      return data as RoutineAssignee[];
    },
    enabled: !!routineId,
  });
};

export const useSetRoutineAssignees = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ routineId, userIds }: { routineId: string; userIds: string[] }) => {
      // Delete all existing assignees
      await supabase
        .from('routine_assignees')
        .delete()
        .eq('routine_id', routineId);

      // Insert new assignees
      if (userIds.length > 0) {
        const { error } = await supabase
          .from('routine_assignees')
          .insert(userIds.map(userId => ({ routine_id: routineId, user_id: userId })));

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['routine-assignees', variables.routineId] });
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
};

// Bulk operations for creating items with multiple assignees
export const useCreateTaskWithAssignees = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      taskData, 
      assigneeIds 
    }: { 
      taskData: {
        title: string;
        description?: string | null;
        priority?: number;
        start_date?: string | null;
        due_date?: string | null;
        unit_id?: string | null;
        status?: 'pendente' | 'em_andamento' | 'concluida' | 'atrasada' | 'cancelada';
        is_recurring?: boolean;
        recurrence_frequency?: 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'anual' | 'customizada';
        recurrence_mode?: 'schedule' | 'on_completion';
      }; 
      assigneeIds: string[] 
    }) => {
      // Create the task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: taskData.title,
          description: taskData.description,
          priority: taskData.priority,
          start_date: taskData.start_date,
          due_date: taskData.due_date,
          unit_id: taskData.unit_id,
          status: taskData.status || 'pendente',
          is_recurring: taskData.is_recurring,
          recurrence_frequency: taskData.recurrence_frequency,
          recurrence_mode: taskData.recurrence_mode,
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Add assignees
      if (assigneeIds.length > 0) {
        const { error: assigneesError } = await supabase
          .from('task_assignees')
          .insert(assigneeIds.map(userId => ({ task_id: task.id, user_id: userId })));

        if (assigneesError) throw assigneesError;
      }

      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};
