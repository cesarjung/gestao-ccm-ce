import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UpdatePasswordParams {
  userId: string;
  newPassword: string;
}

export const useAdminUpdatePassword = () => {
  return useMutation({
    mutationFn: async ({ userId, newPassword }: UpdatePasswordParams) => {
      const { error } = await supabase.rpc('admin_update_password', {
        target_user_id: userId,
        new_password: newPassword,
      });

      if (error) {
        console.error('RPC Error:', error);
        throw new Error(error.message || 'Erro ao atualizar senha');
      }

      return { success: true };
    },
    onSuccess: () => {
      toast.success('Senha atualizada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar senha');
    },
  });
};
