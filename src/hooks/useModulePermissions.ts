import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface UserModulePermission {
  id: string;
  user_id: string;
  module: string;
  permissions: string[];
}

// Hook to fetch permissions
export const useModulePermissions = (moduleName: string, targetUserId?: string) => {
  const { user } = useAuth();
  
  // Se não passar targetUserId, assume o usuário logado
  const queryUserId = targetUserId || user?.id;

  return useQuery({
    queryKey: ['module_permissions', queryUserId, moduleName],
    queryFn: async () => {
      if (!queryUserId) return null;

      const { data, error } = await supabase
        .from('user_module_permissions')
        .select('*')
        .eq('user_id', queryUserId)
        .eq('module', moduleName)
        .maybeSingle();

      if (error) {
        console.error('Error fetching module permissions:', error);
        // Retorna null silenciosamente se falhar (ex: tabela não criada ainda)
        return null; 
      }

      return data as UserModulePermission | null;
    },
    enabled: !!queryUserId && !!moduleName,
  });
};

// Hook to update permissions
export const useUpdateModulePermissions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, moduleName, permissions }: { userId: string, moduleName: string, permissions: string[] }) => {
      // Usando upsert para criar se não existir ou atualizar se existir
      // Note: A constraint UNIQUE(user_id, module) é necessária na tabela
      const { data, error } = await supabase
        .from('user_module_permissions')
        .upsert(
          { 
            user_id: userId, 
            module: moduleName, 
            permissions: permissions 
          },
          { onConflict: 'user_id,module' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['module_permissions', variables.userId, variables.moduleName] });
      toast({
        title: 'Permissões atualizadas',
        description: 'As permissões do usuário foram salvas com sucesso.',
      });
    },
    onError: (error: any) => {
      console.error('Error updating permissions:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message || 'Houve um erro ao tentar salvar as permissões.',
        variant: 'destructive',
      });
    }
  });
};
