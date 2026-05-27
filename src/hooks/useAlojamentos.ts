import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Alojamento {
  id: string;
  unidadeId: string;
  unidadeNome: string; // Keep name for display
  nome: string;
  latitude: number;
  longitude: number;
  capacidade: number;
}

const GLOBAL_UNIDADE_ID = 'GLOBAL_ALOJAMENTOS';

export function useAlojamentos() {
  const [alojamentos, setAlojamentos] = useState<Alojamento[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar do Supabase
  useEffect(() => {
    const fetchAlojamentos = async () => {
      try {
        const { data, error } = await supabase
          .from('planejamento_cache')
          .select('principal')
          .eq('unidade_id', GLOBAL_UNIDADE_ID)
          .maybeSingle();

        if (error) {
          console.error('Failed to load alojamentos from Supabase:', error);
          return;
        }

        if (data && data.principal) {
          // Parse JSON safely
          let parsed: Alojamento[] = [];
          if (typeof data.principal === 'string') {
             parsed = JSON.parse(data.principal);
          } else {
             parsed = data.principal as any;
          }
          setAlojamentos(parsed || []);
        }
      } catch (e) {
        console.error('Exception loading alojamentos:', e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAlojamentos();
  }, []);

  // Função interna para salvar qualquer alteração de volta no Supabase
  const saveToSupabase = async (newAlojamentos: Alojamento[]) => {
    try {
      const { error } = await supabase
        .from('planejamento_cache')
        .upsert({
           unidade_id: GLOBAL_UNIDADE_ID,
           principal: newAlojamentos as any
        }, { onConflict: 'unidade_id' });
        
      if (error) {
         console.error('Error saving alojamentos:', error);
      }
    } catch (e) {
       console.error('Exception saving alojamentos:', e);
    }
  };

  const addAlojamento = (alojamento: Omit<Alojamento, 'id'>) => {
    const newAlojamento: Alojamento = {
      ...alojamento,
      id: crypto.randomUUID()
    };
    const updated = [...alojamentos, newAlojamento];
    setAlojamentos(updated);
    saveToSupabase(updated);
  };

  const updateAlojamento = (id: string, updates: Partial<Omit<Alojamento, 'id'>>) => {
    const updated = alojamentos.map(a => a.id === id ? { ...a, ...updates } : a);
    setAlojamentos(updated);
    saveToSupabase(updated);
  };

  const removeAlojamento = (id: string) => {
    const updated = alojamentos.filter(a => a.id !== id);
    setAlojamentos(updated);
    saveToSupabase(updated);
  };

  return {
    alojamentos,
    loading,
    addAlojamento,
    updateAlojamento,
    removeAlojamento
  };
}
