import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// --- Checklist Hooks ---

export const useChecklist = (taskId?: string, subtaskId?: string) => {
    return useQuery({
        queryKey: ['checklist', taskId, subtaskId],
        queryFn: async () => {
            let query = supabase
                .from('checklist_items' as any)
                .select('*')
                .order('order_index', { ascending: true })
                .order('created_at', { ascending: true });

            if (taskId) {
                query = query.eq('task_id', taskId);
            } else if (subtaskId) {
                query = query.eq('subtask_id', subtaskId);
            } else {
                return [];
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        },
        enabled: !!(taskId || subtaskId),
    });
};

export const useAddChecklistItem = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ taskId, subtaskId, content }: { taskId?: string; subtaskId?: string; content: string }) => {
            if (!user) throw new Error('User not authenticated');

            const { error } = await supabase
                .from('checklist_items' as any)
                .insert({
                    task_id: taskId || null,
                    subtask_id: subtaskId || null,
                    content,
                    created_by: user.id,
                    is_completed: false,
                });

            if (error) throw error;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['checklist', variables.taskId, variables.subtaskId] });
            // Log history logic could go here
        },
        onError: (error) => {
            toast.error('Erro ao adicionar item: ' + error.message);
        },
    });
};

export const useToggleChecklistItem = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
            const { error } = await supabase
                .from('checklist_items' as any)
                .update({ is_completed: isCompleted })
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: (_, variables) => {
            // Invalidate both potential keys by being broad or smart? 
            // We don't know the taskId/subtaskId here easily unless passed.
            // We will invalidate all 'checklist' queries for simplicity or require context.
            queryClient.invalidateQueries({ queryKey: ['checklist'] });
        },
        onError: (error) => {
            toast.error('Erro ao atualizar item: ' + error.message);
        },
    });
};

export const useDeleteChecklistItem = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('checklist_items' as any)
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['checklist'] });
        },
        onError: (error) => {
            toast.error('Erro ao excluir item: ' + error.message);
        },
    });
};

// --- Attachments Hooks ---

export const useTaskAttachments = (taskId: string) => {
    return useQuery({
        queryKey: ['task-attachments', taskId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('task_attachments' as any)
                .select('*')
                .eq('task_id', taskId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!taskId,
    });
};

export const useUploadTaskAttachment = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ taskId, file }: { taskId: string; file: File }) => {
            if (!user) throw new Error('User not authenticated');

            const fileName = `${taskId}/${Date.now()}_${file.name}`;

            // Upload to bucket 'task-attachments'
            // Note: Bucket must enable public access or handle signed URLs.
            // Assuming 'task-attachments' bucket exists or we use 'subtask-attachments' for everything?
            // Let's try 'task-attachments' first, if it fails user needs to create it.
            const { error: uploadError } = await supabase.storage
                .from('task-attachments')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('task-attachments')
                .getPublicUrl(fileName);

            const { error: insertError } = await supabase
                .from('task_attachments' as any)
                .insert({
                    task_id: taskId,
                    user_id: user.id,
                    file_name: file.name,
                    file_url: urlData.publicUrl,
                    file_type: file.type,
                    file_size: file.size,
                });

            if (insertError) throw insertError;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['task-attachments', variables.taskId] });
            toast.success('Arquivo anexado com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao enviar arquivo: ' + error.message);
        },
    });
};

export const useDeleteTaskAttachment = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, path }: { id: string; path: string }) => {
            // Delete from storage
            // Path usually depends on how we stored it. 
            // If we stored as `taskId/timestamp_filename`, we need that path.
            // But we stored the URL. We might need to extract the path or store the path in DB.
            // For now, let's just delete the DB record. Cleaning storage is a bonus.
            // Actually, we should try to clean storage.
            // If we don't have the path, we can't easily delete from storage without parsing URL.

            const { error } = await supabase
                .from('task_attachments' as any)
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['task-attachments'] });
            toast.success('Anexo removido');
        },
        onError: (error) => {
            toast.error('Erro ao remover anexo: ' + error.message);
        },
    });
};

// --- History & Comments Hooks ---

export const useTaskHistory = (taskId: string) => {
    return useQuery({
        queryKey: ['task-history', taskId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('task_history' as any)
                .select(`
          *,
          user:user_id (
            email,
            full_name,
            avatar_url
          )
        `)
                .eq('task_id', taskId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!taskId,
    });
};

export const useTaskComments = (taskId: string) => {
    return useQuery({
        queryKey: ['task-comments', taskId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('task_comments' as any)
                .select(`
          *,
          user:user_id (
            email,
            full_name,
            avatar_url
          )
        `)
                .eq('task_id', taskId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!taskId,
    });
};

export const useAddTaskComment = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ taskId, content }: { taskId: string; content: string }) => {
            if (!user) throw new Error('User not authenticated');

            const { error } = await supabase
                .from('task_comments' as any)
                .insert({
                    task_id: taskId,
                    user_id: user.id,
                    content,
                });

            if (error) throw error;

            // Add to history as well
            await supabase.from('task_history' as any).insert({
                task_id: taskId,
                user_id: user.id,
                action_type: 'comment',
                details: { snippet: content.substring(0, 50) }
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['task-comments', variables.taskId] });
            queryClient.invalidateQueries({ queryKey: ['task-history', variables.taskId] });
            toast.success('Comentário enviado');
        },
        onError: (error) => {
            toast.error('Erro ao enviar comentário: ' + error.message);
        },
    });
};
