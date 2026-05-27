import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const API_URL = 'https://script.google.com/macros/s/AKfycbxn-YpuZZsNsdGT_FxQdhUwLE5KUIuXvo7Ffad03x80LByig3qneNe7-hy9PUZYS8-bDg/exec';
const SECRET_TOKEN = 'sirtec_vista_2026_seguro';

export interface RawUnidadeData {
  unidadeId: string;
  carteira: string[][];
  principal: string[][];
  bdMetas: string[][] | { bd_metas: string[][]; base_curva: string[][]; bd_config: string[][] };
  reprogramadas: string[][];
  lastUpdated?: string | null;
}

export const usePlanejamentoRaw = (selectedUnidadesIds: string[]) => {
  return useQuery({
    queryKey: ['planejamento_raw_v3'], // Cache unico global
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planejamento_cache')
        .select('*');

      if (error) {
        console.error('Erro ao ler cache do Supabase:', error);
        throw error;
      }
      return data;
    },
    select: (data) => {
      // Se não tem unidades selecionadas (array vazio), significa "todas as unidades"
      // Então extraímos todos os IDs disponíveis no cache
      const idsToFetch = (!selectedUnidadesIds || selectedUnidadesIds.length === 0) 
        ? data?.map(d => d.unidade_id) || []
        : selectedUnidadesIds;
      
      return idsToFetch.map(unidadeId => {
        const row = data?.find(d => d.unidade_id === unidadeId);
        if (!row) {
          // Retorna vazio caso a unidade ainda não tenha sido sincronizada
          return {
            unidadeId,
            carteira: [],
            principal: [],
            bdMetas: [],
            reprogramadas: [],
            lastUpdated: null,
          } as RawUnidadeData;
        }

        const safeParse = (val: any) => {
          if (!val) return [];
          if (typeof val === 'string') {
            try {
              return JSON.parse(val);
            } catch (e) {
              console.error('Falha ao parsear JSON no frontend:', e);
              return [];
            }
          }
          return val;
        };

        return {
          unidadeId: row.unidade_id,
          carteira: safeParse(row.carteira),
          principal: safeParse(row.principal),
          bdMetas: safeParse(row.bd_metas),
          reprogramadas: safeParse(row.reprogramadas),
          lastUpdated: row.updated_at
        } as RawUnidadeData;
      });
    },
    // Cache de 5 minutos ainda é útil para evitar chamadas seguidas manuais ao Supabase
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // Recarrega do Supabase a cada 2 minutos automaticamente para manter as telas abertas atualizadas
    refetchInterval: 2 * 60 * 1000,
  });
};

export const useSyncPlanejamento = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // O bot Python (sync_bot.py) é responsável por atualizar o Supabase.
      // Este botão apenas força o React Query a buscar os dados mais recentes do Supabase.
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planejamento_raw_v3'] });
      toast.success('Painel atualizado com os dados mais recentes do banco!');
    }
  });
};
