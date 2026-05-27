import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type Profile = Tables<'profiles'>;

export const useProfiles = (unitId?: string) => {
  return useQuery({
    queryKey: ['profiles', unitId],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (unitId) {
        query = query.eq('unit_id', unitId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Profile[];
    },
  });
};
