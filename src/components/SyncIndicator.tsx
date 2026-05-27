import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSyncPlanejamento } from '@/hooks/usePlanejamentoRaw';

export const SyncIndicator: React.FC = () => {
  const queryClient = useQueryClient();
  const { mutate: syncPlanejamento, isPending: isSyncing } = useSyncPlanejamento();

  // Busca todos os registros do banco para checar se alguma unidade falhou
  const { data: cacheRecords, dataUpdatedAt, isRefetching } = useQuery({
    queryKey: ['planejamento_sync_status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planejamento_cache')
        .select('unidade_id, updated_at');
      
      if (error) throw error;
      
      // Filtra apenas as unidades reais (ignorando GLOBAL_ALOJAMENTOS ou outros caches internos)
      return (data || []).filter(d => d.unidade_id !== 'GLOBAL_ALOJAMENTOS');
    },
    // Recarrega do Supabase a cada 2 minutos automaticamente para manter as telas abertas atualizadas
    refetchInterval: 2 * 60 * 1000,
  });

  // Calcula a data mais recente (sucesso) e a mais antiga (falha)
  const timestamps = (cacheRecords || []).map(r => new Date(r.updated_at).getTime());
  const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const minTime = timestamps.length > 0 ? Math.min(...timestamps) : null;
  
  const lastBotUpdate = maxTime ? new Date(maxTime) : null;
  const lastSystemUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const isSpinning = isRefetching || isSyncing;

  // Se a diferença entre a unidade mais recente e a mais antiga for maior que 30 minutos, 
  // significa que alguma unidade falhou no último ciclo de atualização
  const hasDesyncWarning = maxTime && minTime && (maxTime - minTime) > (30 * 60 * 1000);

  const handleRefresh = () => {
    syncPlanejamento();
    // Força a recarregar todas as tabelas e gráficos da tela atual
    queryClient.invalidateQueries(); 
  };

  return (
    <div className="flex items-center gap-4">
      {lastBotUpdate && (
        <div className="text-right flex flex-col justify-center border-r border-border pr-3">
          <div className="flex items-center justify-end gap-1" title={hasDesyncWarning ? "Atenção: Alguma(s) unidade(s) falharam em sincronizar no último ciclo!" : "Última vez que o robô do servidor baixou do Google"}>
            {hasDesyncWarning && <span className="text-[10px]">⚠️</span>}
            <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider leading-none">Base Central</span>
          </div>
          <span className={`text-xs font-medium ${hasDesyncWarning ? 'text-yellow-500' : 'text-foreground'}`}>
            {format(lastBotUpdate, "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </span>
        </div>
      )}
      {lastSystemUpdate && (
        <div className="text-right flex flex-col justify-center">
          <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider leading-none" title="Última vez que sua tela puxou do banco de dados">Base Sistema</span>
          <span className="text-xs text-foreground font-medium">
            {format(lastSystemUpdate, "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </span>
        </div>
      )}
      <Button 
        variant="outline" 
        size="icon" 
        onClick={handleRefresh} 
        disabled={isSpinning} 
        className="h-8 w-8 shrink-0 ml-1"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? 'animate-spin text-primary' : ''}`} />
      </Button>
    </div>
  );
};
