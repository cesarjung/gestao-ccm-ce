import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TrackerSettings {
    id?: string;
    sector_id: string | null;
    filters: { routines: string[]; frequencies: string[]; sectors?: string[] };
    layouts: Record<string, { x: number; y: number; width: number; height: number }>;
}

export function useTrackerSettings(sectorId?: string | null) {
    const queryClient = useQueryClient();

    // Buscar configurações globais (para o setor selecionado ou globais)
    const {
        data: settings,
        isLoading,
        error,
        refetch,
    } = useQuery({
        queryKey: ['tracker_settings', sectorId || 'global'],
        queryFn: async () => {
            let query = supabase.from('tracker_settings').select('*');

            if (sectorId) {
                query = query.eq('sector_id', sectorId);
            } else {
                query = query.is('sector_id', null);
            }

            const { data, error } = await query.maybeSingle();

            if (error) {
                console.error('Error fetching tracker settings:', error);
                throw error;
            }

            // Se não existir, retornamos a estrutura vazia default, mas validada.
            if (!data) return null;

            // Conversão segura do JSONB.
            return {
                id: data.id,
                sector_id: data.sector_id,
                filters: typeof data.filters === 'string' ? JSON.parse(data.filters) : data.filters || { routines: [], frequencies: [], sectors: [] },
                layouts: typeof data.layouts === 'string' ? JSON.parse(data.layouts) : data.layouts || {},
            } as TrackerSettings;
        },
        enabled: true,
        staleTime: 1000 * 60 * 5, // Cache de 5min
    });

    // Mutação para Salvar configurações (Somente autorizados: admin, gestor ou se o RLS permitir)
    const saveSettings = useMutation({
        mutationFn: async (newSettings: TrackerSettings) => {

            if (!newSettings.sector_id) {
                // Modo global: upsert manual para contornar limitação de onConflict em campos NULL
                const { data: existing } = await supabase.from('tracker_settings').select('id').is('sector_id', null).maybeSingle();

                if (existing) {
                    const { data, error } = await supabase.from('tracker_settings').update({
                        filters: newSettings.filters as any,
                        layouts: newSettings.layouts as any
                    }).eq('id', existing.id).select().single();
                    if (error) throw error;
                    return data;
                } else {
                    const { data, error } = await supabase.from('tracker_settings').insert({
                        filters: newSettings.filters as any,
                        layouts: newSettings.layouts as any
                        // sector_id é nulo por default se n omitirmos (ou enviarmos null explicitamente se a row permitir)
                    }).select().single();
                    if (error) throw error;
                    return data;
                }
            } else {
                // Modo Setorial
                const { data, error } = await supabase
                    .from('tracker_settings')
                    .upsert(
                        {
                            sector_id: newSettings.sector_id,
                            filters: newSettings.filters as any,
                            layouts: newSettings.layouts as any,
                        },
                        { onConflict: 'sector_id' }
                    )
                    .select()
                    .single();

                if (error) throw error;
                return data;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tracker_settings', sectorId || 'global'] });
            toast.success('Configuração da Vista salva com sucesso.');
        },
        onError: (e: any) => {
            console.error(e);
            toast.error(`Erro ao salvar Vista: ${e.message || String(e)}`);
        },
    });

    return {
        settings,
        isLoading,
        error,
        saveSettings,
        refetch,
    };
}
