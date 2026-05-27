import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// --- Routine Checklist Hooks ---

export const useRoutineChecklist = (routineId?: string) => {
    return useQuery({
        queryKey: ['routine-checklist', routineId],
        queryFn: async () => {
            if (!routineId) return [];

            const { data, error } = await supabase
                .from('checklist_items' as any)
                .select('*')
                .eq('routine_id', routineId)
                .order('order_index', { ascending: true })
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data as any[];
        },
        enabled: !!routineId,
    });
};

export const useAddRoutineChecklistItem = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ routineId, content }: { routineId: string; content: string }) => {
            if (!user) throw new Error('User not authenticated');

            const { error } = await supabase
                .from('checklist_items' as any)
                .insert({
                    routine_id: routineId,
                    task_id: null,
                    subtask_id: null,
                    content,
                    created_by: user.id,
                    is_completed: false,
                });

            if (error) throw error;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['routine-checklist', variables.routineId] });

            // Add to history
            supabase.from('routine_history' as any).insert({
                routine_id: variables.routineId,
                action_type: 'checklist_add',
                details: { snippet: variables.content.substring(0, 30) }
            }).then();
        },
        onError: (error) => {
            toast.error('Erro ao adicionar item: ' + error.message);
        },
    });
};

export const useToggleRoutineChecklistItem = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
            const { error } = await supabase
                .from('checklist_items' as any)
                .update({ is_completed: isCompleted })
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['routine-checklist'] });
        },
        onError: (error) => {
            toast.error('Erro ao atualizar item: ' + error.message);
        },
    });
};

export const useDeleteRoutineChecklistItem = () => {
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
            queryClient.invalidateQueries({ queryKey: ['routine-checklist'] });
        },
        onError: (error) => {
            toast.error('Erro ao excluir item: ' + error.message);
        },
    });
};

// --- Routine Attachments Hooks ---

export const useRoutineAttachments = (routineId: string) => {
    return useQuery({
        queryKey: ['routine-attachments', routineId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('routine_attachments' as any)
                .select('*')
                .eq('routine_id', routineId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as any[];
        },
        enabled: !!routineId,
    });
};

export const useUploadRoutineAttachment = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ routineId, file }: { routineId: string; file: File }) => {
            if (!user) throw new Error('User not authenticated');

            const fileName = `routine_${routineId}/${Date.now()}_${file.name}`;

            // Upload to bucket 'task-attachments' (reusing same bucket for now, just different folder structure essentially)
            const { error: uploadError } = await supabase.storage
                .from('task-attachments')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('task-attachments')
                .getPublicUrl(fileName);

            const { error: insertError } = await supabase
                .from('routine_attachments' as any)
                .insert({
                    routine_id: routineId,
                    user_id: user.id,
                    file_name: file.name,
                    file_url: urlData.publicUrl,
                    file_type: file.type,
                    file_size: file.size,
                });

            if (insertError) throw insertError;

            // History
            await supabase.from('routine_history' as any).insert({
                routine_id: routineId,
                user_id: user.id,
                action_type: 'upload',
                details: { file_name: file.name }
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['routine-attachments', variables.routineId] });
            queryClient.invalidateQueries({ queryKey: ['routine-history', variables.routineId] });
            toast.success('Arquivo anexado com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao enviar arquivo: ' + error.message);
        },
    });
};

export const useDeleteRoutineAttachment = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id }: { id: string }) => {
            const { error } = await supabase
                .from('routine_attachments' as any)
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['routine-attachments'] });
            toast.success('Anexo removido');
        },
        onError: (error) => {
            toast.error('Erro ao remover anexo: ' + error.message);
        },
    });
};

export const useRoutineHistory = (routineId: string) => {
    return useQuery({
        queryKey: ['routine-history', routineId],
        queryFn: async () => {
            // Fetch history
            const { data: historyData, error: historyError } = await supabase
                .from('routine_history' as any)
                .select('*')
                .eq('routine_id', routineId)
                .order('created_at', { ascending: false });

            if (historyError) throw historyError;

            if (!historyData || historyData.length === 0) return [];

            // Fetch profiles
            const userIds = [...new Set(historyData.map((h: any) => h.user_id).filter(Boolean))];

            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, email')
                .in('id', userIds);

            if (profilesError) {
                console.error('Error fetching profiles for history', profilesError);
                // Return history without user details if profiles fail
                return historyData.map((h: any) => ({ ...h, user: null }));
            }

            // Map profiles to history
            const profilesMap = new Map(profiles?.map(p => [p.id, p]));

            return historyData.map((h: any) => ({
                ...h,
                user: profilesMap.get(h.user_id) || null
            }));
        },
        enabled: !!routineId,
    });
};

export const useRoutineComments = (routineId: string) => {
    return useQuery({
        queryKey: ['routine-comments', routineId],
        queryFn: async () => {
            // Fetch comments
            const { data: commentsData, error: commentsError } = await supabase
                .from('routine_comments' as any)
                .select('*')
                .eq('routine_id', routineId)
                .order('created_at', { ascending: false });

            if (commentsError) throw commentsError;

            if (!commentsData || commentsData.length === 0) return [];

            // Fetch profiles
            const userIds = [...new Set(commentsData.map((c: any) => c.user_id).filter(Boolean))];

            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, email')
                .in('id', userIds);

            if (profilesError) {
                console.error('Error fetching profiles for comments', profilesError);
                return commentsData.map((c: any) => ({ ...c, user: null }));
            }

            const profilesMap = new Map(profiles?.map(p => [p.id, p]));

            return commentsData.map((c: any) => ({
                ...c,
                user: profilesMap.get(c.user_id) || null
            }));
        },
        enabled: !!routineId,
    });
};

export const useAddRoutineComment = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ routineId, content }: { routineId: string; content: string }) => {
            if (!user) throw new Error('User not authenticated');

            const { error } = await supabase
                .from('routine_comments' as any)
                .insert({
                    routine_id: routineId,
                    user_id: user.id,
                    content,
                });

            if (error) throw error;

            // Add to history as well
            await supabase.from('routine_history' as any).insert({
                routine_id: routineId,
                user_id: user.id,
                action_type: 'comment',
                details: { snippet: content.substring(0, 50) }
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['routine-comments', variables.routineId] });
            queryClient.invalidateQueries({ queryKey: ['routine-history', variables.routineId] });
            toast.success('Comentário enviado');
        },
        onError: (error) => {
            toast.error('Erro ao enviar comentário: ' + error.message);
        },
    });
};
