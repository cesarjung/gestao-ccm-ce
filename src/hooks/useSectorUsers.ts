import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SectorUser {
  id: string;
  sector_id: string;
  user_id: string;
  created_at: string;
  created_by: string | null;
  user?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

export const useSectorUsers = (sectorId?: string) => {
  return useQuery({
    queryKey: ['sector-users', sectorId],
    queryFn: async () => {
      if (!sectorId) return [];

      const { data, error } = await supabase
        .from('sector_users')
        .select(`
          id,
          sector_id,
          user_id,
          created_at,
          created_by
        `)
        .eq('sector_id', sectorId);

      if (error) throw error;

      // Fetch user details for each sector_user
      const userIds = data.map(su => su.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(su => ({
        ...su,
        user: profileMap.get(su.user_id),
      })) as SectorUser[];
    },
    enabled: !!sectorId,
  });
};

export const useAllSectorUsers = () => {
  return useQuery({
    queryKey: ['all-sector-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sector_users')
        .select(`
          id,
          sector_id,
          user_id,
          created_at,
          created_by
        `);

      if (error) throw error;
      return data;
    },
  });
};

export const useSectorUserMutations = () => {
  const queryClient = useQueryClient();

  const addUserToSector = useMutation({
    mutationFn: async ({ sectorId, userId }: { sectorId: string; userId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('sector_users')
        .insert({
          sector_id: sectorId,
          user_id: userId,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sector-users', variables.sectorId] });
      queryClient.invalidateQueries({ queryKey: ['all-sector-users'] });
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      toast.success('Usuário adicionado ao setor');
    },
    onError: (error: any) => {
      console.error('Error adding user to sector:', error);
      if (error.code === '23505') {
        toast.error('Usuário já está neste setor');
      } else {
        toast.error('Erro ao adicionar usuário ao setor');
      }
    },
  });

  const removeUserFromSector = useMutation({
    mutationFn: async ({ id, sectorId }: { id: string; sectorId: string }) => {
      const { error } = await supabase
        .from('sector_users')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sector-users', variables.sectorId] });
      queryClient.invalidateQueries({ queryKey: ['all-sector-users'] });
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      toast.success('Usuário removido do setor');
    },
    onError: (error) => {
      console.error('Error removing user from sector:', error);
      toast.error('Erro ao remover usuário do setor');
    },
  });

  return { addUserToSector, removeUserFromSector };
};
