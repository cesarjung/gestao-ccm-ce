import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const useCompleteSubtask = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ subtaskId, isCompleted }: { subtaskId: string; isCompleted: boolean }) => {
      // Primeiro, verificar se o usuário é o responsável da subtarefa
      const { data: subtask, error: fetchError } = await supabase
        .from('subtasks')
        .select('assigned_to')
        .eq('id', subtaskId)
        .single();

      if (fetchError) throw fetchError;

      if (subtask.assigned_to !== user?.id) {
        throw new Error('Você não tem permissão para marcar esta subtarefa');
      }

      const { error } = await supabase
        .from('subtasks')
        .update({
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .eq('id', subtaskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-subtasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Subtarefa atualizada');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar subtarefa');
    },
  });
};

export const useAddSubtaskComment = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ subtaskId, content }: { subtaskId: string; content: string }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('subtask_comments')
        .insert({
          subtask_id: subtaskId,
          user_id: user.id,
          content,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtask-comments'] });
      toast.success('Comentário adicionado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao adicionar comentário');
    },
  });
};

export const useUploadSubtaskAttachment = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ subtaskId, file }: { subtaskId: string; file: File }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const fileName = `${subtaskId}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('subtask-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('subtask-attachments')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('subtask_attachments')
        .insert({
          subtask_id: subtaskId,
          user_id: user.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtask-attachments'] });
      toast.success('Anexo enviado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao enviar anexo');
    },
  });
};
