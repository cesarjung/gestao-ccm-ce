import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';

export interface SubtaskWithDetails extends Tables<'subtasks'> {
  task?: {
    id: string;
    title: string;
    unit_id: string;
    routine_id: string | null;
    unit?: Tables<'units'> | null;
    routine?: Tables<'routines'> | null;
  } | null;
}

export const useUserSubtasks = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-subtasks', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // First get subtasks from subtask_assignees table
      const { data: assignedSubtasks, error: assigneesError } = await supabase
        .from('subtask_assignees')
        .select('subtask_id')
        .eq('user_id', user.id);
      
      if (assigneesError) throw assigneesError;
      
      const subtaskIds = assignedSubtasks?.map(a => a.subtask_id) || [];
      
      // Also get subtasks assigned directly (legacy support)
      const { data: directSubtasks, error: directError } = await supabase
        .from('subtasks')
        .select(`
          *,
          task:tasks(
            id,
            title,
            unit_id,
            routine_id,
            unit:units(*),
            routine:routines(*)
          )
        `)
        .eq('assigned_to', user.id)
        .order('created_at', { ascending: false });

      if (directError) throw directError;
      
      // Get subtasks from junction table
      if (subtaskIds.length > 0) {
        const { data: junctionSubtasks, error: junctionError } = await supabase
          .from('subtasks')
          .select(`
            *,
            task:tasks(
              id,
              title,
              unit_id,
              routine_id,
              unit:units(*),
              routine:routines(*)
            )
          `)
          .in('id', subtaskIds)
          .order('created_at', { ascending: false });
        
        if (junctionError) throw junctionError;
        
        // Merge and deduplicate
        const allSubtasks = [...(directSubtasks || []), ...(junctionSubtasks || [])];
        const uniqueSubtasks = allSubtasks.filter((subtask, index, self) =>
          index === self.findIndex(s => s.id === subtask.id)
        );
        
        return uniqueSubtasks as SubtaskWithDetails[];
      }
      
      return directSubtasks as SubtaskWithDetails[];
    },
    enabled: !!user?.id,
  });
};

export const useSubtasksForTask = (taskId: string) => {
  return useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subtasks')
        .select('*')
        .eq('task_id', taskId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!taskId,
  });
};
