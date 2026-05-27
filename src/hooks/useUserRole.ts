import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';

type AppRole = 'admin' | 'gestor' | 'usuario';

export const useUserRole = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      return data?.role as AppRole;
    },
    enabled: !!user?.id,
  });
};

export const useIsAdmin = () => {
  const { data: role, isLoading } = useUserRole();
  return { isAdmin: role === 'admin', isLoading };
};

export const useIsGestorOrAdmin = () => {
  const { data: role, isLoading } = useUserRole();
  return {
    isGestorOrAdmin: role === 'admin' || role === 'gestor',
    isLoading
  };
};

export const useCanManageUsers = () => {
  const { data: role, isLoading } = useUserRole();
  return {
    canManageUsers: role === 'admin' || role === 'gestor',
    isLoading
  };
};
