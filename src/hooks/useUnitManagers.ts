import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UnitManagerWithProfile {
  id: string;
  unit_id: string;
  user_id: string;
  created_at: string;
  profile?: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export const useUnitManagers = () => {
  return useQuery({
    queryKey: ['unit-managers'],
    queryFn: async () => {
      // Get unit managers
      const { data: managers, error: managersError } = await supabase
        .from('unit_managers')
        .select('*');

      if (managersError) throw managersError;

      // Get profiles for each manager
      const userIds = [...new Set(managers.map(m => m.user_id))];
      
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Combine data
      const result: UnitManagerWithProfile[] = managers.map(manager => ({
        ...manager,
        profile: profiles?.find(p => p.id === manager.user_id),
      }));

      return result;
    },
  });
};
