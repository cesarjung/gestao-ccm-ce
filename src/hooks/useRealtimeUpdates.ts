import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useRealtimeUpdates = () => {
    const queryClient = useQueryClient();

    useEffect(() => {
        const setupRealtime = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                console.log('🔕 Sem sessão ativa. Realtime pausado.');
                return;
            }

            console.log('🔄 Iniciando conexão Realtime...');

            // Ref timeout
            let debounceTimer: ReturnType<typeof setTimeout> | null = null;
            let pendingTables = new Set<string>();

            // Canal único ouvindo TUDO no schema public
            const channel = supabase
                .channel('global-db-changes')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public' },
                    (payload) => {
                        console.log('📡 Realtime Event:', payload);

                        // Coleciona tabelas afetadas nessa rajada (burst)
                        if (payload.table) {
                            pendingTables.add(payload.table);
                        }

                        // Debounce mechanism: Wait 1.5 seconds after the LAST event to trigger refetches
                        if (debounceTimer) {
                            clearTimeout(debounceTimer);
                        }

                        debounceTimer = setTimeout(() => {
                            const tablesToUpdate = Array.from(pendingTables);
                            pendingTables.clear();

                            console.log('🔄 Executing debounced query invalidations for:', tablesToUpdate);

                            // Atualiazação dos Dashboards (Keys corretas)
                            queryClient.invalidateQueries({ queryKey: ['unit-routine-status'] });
                            queryClient.invalidateQueries({ queryKey: ['responsible-routine-status'] });
                            queryClient.invalidateQueries({ queryKey: ['units-summary'] });
                            queryClient.invalidateQueries({ queryKey: ['overall-stats'] });

                            // Invalidaqueries baseado na tabela alterada
                            tablesToUpdate.forEach(table => {
                                queryClient.invalidateQueries({ queryKey: [table] });

                                // Mapeamentos específicos (ex: checkins afetam rotinas)
                                if (table === 'routine_checkins') {
                                    queryClient.invalidateQueries({ queryKey: ['routines'] });
                                    queryClient.invalidateQueries({ queryKey: ['tasks'] });
                                }
                                if (table === 'subtasks') {
                                    queryClient.invalidateQueries({ queryKey: ['tasks'] });
                                }
                            });

                            // Atualização de View de Tarefas e Rotinas
                            queryClient.invalidateQueries({ queryKey: ['tasks'] });
                            queryClient.invalidateQueries({ queryKey: ['routines'] });
                            queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
                            queryClient.invalidateQueries({ queryKey: ['routine-tasks'] });
                            queryClient.invalidateQueries({ queryKey: ['custom-panel-data'] });
                        }, 1500);
                    }
                )
                .subscribe((status) => {
                    console.log('📡 Status da Conexão:', status);
                    if (status === 'SUBSCRIBED') {
                        // toast({
                        //   title: "Conexão Realtime: Ativa",
                        //   description: "Escutando alterações no banco de dados.",
                        //   duration: 3000,
                        // });
                    } else if (status === 'CHANNEL_ERROR') {
                        console.error('❌ Erro no canal Realtime.');
                        // Suppress toast for now or make it less intrusive
                    }
                });

            return () => {
                supabase.removeChannel(channel);
            };
        };

        const cleanupPromise = setupRealtime();

        return () => {
            cleanupPromise.then(cleanup => cleanup && cleanup());
        };
    }, [queryClient]);
};
