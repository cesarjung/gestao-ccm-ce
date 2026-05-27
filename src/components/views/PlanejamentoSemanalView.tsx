import React, { useState, useMemo } from 'react';
import { usePlanejamentoSemanalData } from '@/hooks/usePlanejamentoSemanalData';
import { useSessionState } from '@/hooks/useSessionState';
import { useSyncPlanejamento } from '@/hooks/usePlanejamentoRaw';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RefreshCw, Filter, Calendar, Settings, AlertTriangle, Target, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncIndicator } from '@/components/SyncIndicator';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Input } from '@/components/ui/input';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Agrupador auxiliar
type DailyStats = {
  equipe: string;
  data: string;
  valPlanejado: number;
  metaEquipe: number;
  tempoDeslocamento: number;
  tempoPlanejado: number;
  unidadeNome: string;
  supervisor: string;
};

type WeeklyStats = {
  equipe: string;
  unidadeNome: string;
  valPlanejado: number;
  metaEquipe: number;
  diasDeficit: number; // dias em que planejado < meta
};

export const PlanejamentoSemanalView = () => {
  // Estado de Filtros
  const [selectedUnidades, setSelectedUnidades] = useSessionState<string[]>('filter_unidades_planejamentosemanal', []);
  const [zoomLevel, setZoomLevel] = useSessionState<number>('filter_zoom_planejamentosemanal', 1);

  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  const [limiteDeslocamento, setLimiteDeslocamento] = useState<number>(2.0);

  const [selectedEquipes, setSelectedEquipes] = useState<string[]>([]);
  const [selectedSupervisores, setSelectedSupervisores] = useState<string[]>([]);

  const { data: rawData, isLoading, refetch, isRefetching, lastBotUpdate, lastSystemUpdate } = usePlanejamentoSemanalData(
    selectedUnidades, 
    dateRange.from, 
    dateRange.to
  );

  const { mutate: syncPlanejamento, isPending: isSyncing } = useSyncPlanejamento();

  // Processamento de Dados (Agrupamento por Dia/Equipe e Semana/Equipe)
  const { dailyStats, weeklyStats, equipesUnicas, supervisoresUnicos } = useMemo(() => {
    const dailyMap = new Map<string, DailyStats>();
    const weeklyMap = new Map<string, WeeklyStats>();
    
    const equipesSet = new Set<string>();
    const supervisoresSet = new Set<string>();

    rawData.forEach(row => {
      equipesSet.add(row.equipe);
      supervisoresSet.add(row.supervisor);
      
      // Chave diária: Equipe + Data
      const dailyKey = `${row.equipe}|${row.dataString}`;
      if (!dailyMap.has(dailyKey)) {
        dailyMap.set(dailyKey, {
          equipe: row.equipe,
          data: row.dataString,
          valPlanejado: 0,
          metaEquipe: 0,
          tempoDeslocamento: 0,
          tempoPlanejado: 0,
          unidadeNome: row.unidadeNome,
          supervisor: row.supervisor
        });
      }
      const day = dailyMap.get(dailyKey)!;
      day.valPlanejado += row.valPlanejado;
      day.metaEquipe += row.metaEquipe;
      day.tempoDeslocamento += row.tempoDeslocamento;
      day.tempoPlanejado += row.tempoPlanejado;

      // Chave semanal: Equipe
      const weeklyKey = row.equipe;
      if (!weeklyMap.has(weeklyKey)) {
        weeklyMap.set(weeklyKey, {
          equipe: row.equipe,
          unidadeNome: row.unidadeNome,
          valPlanejado: 0,
          metaEquipe: 0,
          diasDeficit: 0
        });
      }
      const week = weeklyMap.get(weeklyKey)!;
      week.valPlanejado += row.valPlanejado;
      week.metaEquipe += row.metaEquipe; // Assumindo que a meta é diluída ou somada ao longo dos dias? Se a meta é a mesma todos os dias (repetida), talvez devamos pegar a MAX?
      // O usuário diz: "A meta das Equipes ativas considera só quem está disponível na semana."
      // Para segurança, vamos somar as metas diárias para ter a meta da semana, assumindo que a planilha já dilui.
    });

    // Calcula dias de déficit na semana
    const dailyArr = Array.from(dailyMap.values());
    dailyArr.forEach(day => {
      if (day.valPlanejado < day.metaEquipe && day.metaEquipe > 0) {
        const week = weeklyMap.get(day.equipe);
        if (week) week.diasDeficit += 1;
      }
    });

    const weeklyArr = Array.from(weeklyMap.values());
    
    return {
      dailyStats: dailyArr,
      weeklyStats: weeklyArr,
      equipesUnicas: Array.from(equipesSet).sort(),
      supervisoresUnicos: Array.from(supervisoresSet).sort()
    };
  }, [rawData]);

  // Aplicação dos filtros de Equipe e Supervisor
  const filteredDailyStats = useMemo(() => {
    return dailyStats.filter(d => {
      if (selectedEquipes.length > 0 && !selectedEquipes.includes(d.equipe)) return false;
      if (selectedSupervisores.length > 0 && !selectedSupervisores.includes(d.supervisor)) return false;
      return true;
    });
  }, [dailyStats, selectedEquipes, selectedSupervisores]);

  // Cálculos dinâmicos com base nos dados filtrados
  const { filteredWeeklyStats, totals } = useMemo(() => {
    const weeklyMap = new Map<string, { equipe: string, valPlanejado: number, metaEquipe: number }>();
    
    let totalPlanejado = 0;
    let totalMetaGeral = 0;
    let totalMetaAtiva = 0;
    
    let totalDeslocamento = 0;
    let countDeslocamento = 0;
    let totalTempoServico = 0;
    let countServico = 0;

    filteredDailyStats.forEach(d => {
      if (!weeklyMap.has(d.equipe)) {
        weeklyMap.set(d.equipe, { equipe: d.equipe, valPlanejado: 0, metaEquipe: 0 });
      }
      const week = weeklyMap.get(d.equipe)!;
      week.valPlanejado += d.valPlanejado;
      week.metaEquipe += d.metaEquipe;

      // Card 02 and 03
      if (d.tempoDeslocamento > 0) {
        totalDeslocamento += d.tempoDeslocamento;
        countDeslocamento++;
      }
      if (d.tempoPlanejado > 0) {
        totalTempoServico += d.tempoPlanejado;
        countServico++;
      }
    });

    const weeklyArr = Array.from(weeklyMap.values());
    
    weeklyArr.forEach(w => {
      totalPlanejado += w.valPlanejado;
      totalMetaGeral += w.metaEquipe;
      if (w.valPlanejado > 0) {
        totalMetaAtiva += w.metaEquipe;
      }
    });

    return {
      filteredWeeklyStats: weeklyArr,
      totals: {
        totalPlanejado,
        totalMetaAtiva,
        totalMetaGeral,
        percentMetaAtiva: totalMetaAtiva > 0 ? (totalPlanejado / totalMetaAtiva) * 100 : 0,
        percentMetaGeral: totalMetaGeral > 0 ? (totalPlanejado / totalMetaGeral) * 100 : 0,
        avgDeslocamento: countDeslocamento > 0 ? totalDeslocamento / countDeslocamento : 0,
        avgTempoServico: countServico > 0 ? totalTempoServico / countServico : 0
      }
    };
  }, [filteredDailyStats]);

  // Filtros de Escalação (Tabelas)
  const deficitMetaEquipes = useMemo(() => {
    return filteredWeeklyStats
      .filter(w => w.metaEquipe > 0 && w.valPlanejado > 0)
      .sort((a, b) => {
        const aDeficit = a.valPlanejado < a.metaEquipe;
        const bDeficit = b.valPlanejado < b.metaEquipe;

        // Grupo vermelho (déficit) primeiro, verde depois
        if (aDeficit && !bDeficit) return -1;
        if (!aDeficit && bDeficit) return 1;

        // Dentro de cada grupo, ordena em ordem decrescente de % atingido
        const percentA = a.valPlanejado / a.metaEquipe;
        const percentB = b.valPlanejado / b.metaEquipe;
        
        return percentB - percentA;
      });
  }, [filteredWeeklyStats]);

  const todasEquipesComMeta = useMemo(() => {
    return filteredWeeklyStats
      .filter(w => w.metaEquipe > 0)
      .sort((a, b) => {
        const aDeficit = a.valPlanejado < a.metaEquipe;
        const bDeficit = b.valPlanejado < b.metaEquipe;

        if (aDeficit && !bDeficit) return -1;
        if (!aDeficit && bDeficit) return 1;

        const percentA = a.valPlanejado / a.metaEquipe;
        const percentB = b.valPlanejado / b.metaEquipe;
        
        return percentB - percentA;
      });
  }, [filteredWeeklyStats]);

  const hasDeficit = deficitMetaEquipes.some(w => w.valPlanejado < w.metaEquipe);

  const deslocamentoEquipes = useMemo(() => {
    return filteredDailyStats
      .filter(d => d.tempoDeslocamento > 0)
      .sort((a, b) => {
        const aBad = a.tempoDeslocamento > limiteDeslocamento;
        const bBad = b.tempoDeslocamento > limiteDeslocamento;
        if (aBad && !bBad) return -1;
        if (!aBad && bBad) return 1;
        return b.tempoDeslocamento - a.tempoDeslocamento;
      });
  }, [filteredDailyStats, limiteDeslocamento]);

  const hasExcessoDeslocamento = deslocamentoEquipes.some(d => d.tempoDeslocamento > limiteDeslocamento);

  const tempoPlanejadoEquipes = useMemo(() => {
    return filteredDailyStats
      .filter(d => d.tempoPlanejado > 0)
      .sort((a, b) => {
        const aBad = a.tempoPlanejado < 8.0 || a.tempoPlanejado > 10.0;
        const bBad = b.tempoPlanejado < 8.0 || b.tempoPlanejado > 10.0;
        if (aBad && !bBad) return -1;
        if (!aBad && bBad) return 1;
        return b.tempoPlanejado - a.tempoPlanejado;
      });
  }, [filteredDailyStats]);

  const subutilizadasCount = tempoPlanejadoEquipes.filter(d => d.tempoPlanejado < 8.0).length;
  const sobrecarregadasCount = tempoPlanejadoEquipes.filter(d => d.tempoPlanejado > 10.0).length;
  const hasEscalacaoTempoPlanejado = subutilizadasCount > 0 || sobrecarregadasCount > 0;


  // Handlers
  const handleRefresh = () => {
    syncPlanejamento(selectedUnidades.length > 0 ? selectedUnidades : UNIDADES_PLANEJAMENTO.map(u => u.id));
  };

  const renderMultiSelect = (
    label: string, 
    options: { value: string | number; label: string }[], 
    selectedValues: any[], 
    onChange: (val: any[]) => void
  ) => {
    return (
      <div className="flex flex-col justify-center min-w-[120px]">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{label}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between text-left font-normal text-[11px] h-8 bg-background">
              <span className="truncate">{selectedValues.length === 0 ? 'Todos' : `${selectedValues.length} selec.`}</span>
              <Filter className="w-3 h-3 ml-2 opacity-50 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 max-h-[500px] overflow-y-auto z-[9999]" align="start">
            <div className="p-2 border-b border-border flex gap-2 sticky top-0 bg-popover z-10">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7" onClick={() => onChange(options.map(o => o.value))}>Selecionar todos</Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => onChange([])}>Limpar</Button>
            </div>
            {options.map((opt) => (
              <DropdownMenuCheckboxItem
                key={opt.value}
                checked={selectedValues.includes(opt.value)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange([...selectedValues, opt.value]);
                  } else {
                    onChange(selectedValues.filter((v) => v !== opt.value));
                  }
                }}
                onSelect={(e) => e.preventDefault()}
              >
                {opt.label}
              </DropdownMenuCheckboxItem>
            ))}
            {options.length === 0 && (
               <div className="px-2 py-2 text-sm text-muted-foreground text-center">Nenhuma opção</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* HEADER / FILTROS BÁSICOS (Sticky) */}
      <div className="sticky top-0 z-[100] bg-background border-b border-border space-y-3 pt-4 px-6 pb-4 -mx-6 mb-6">
        <div className="flex flex-row flex-nowrap items-end gap-4 overflow-x-auto custom-scrollbar w-full pb-2">
          {/* Header Title */}
          <div className="shrink-0 mb-1">
            <h1 className="text-[17px] font-bold text-foreground tracking-tight flex items-center gap-2">
              Planejamento Semanal
            </h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Monitoramento de Aderência</p>
          </div>
          
          <div className="w-px h-10 bg-border shrink-0"></div>

          {/* Filters Row */}
          <div className="flex flex-nowrap items-end gap-2 shrink-0 pb-1">
            {renderMultiSelect("Unidade", UNIDADES_PLANEJAMENTO.map(u => ({ value: u.id, label: u.nome })), selectedUnidades, setSelectedUnidades)}
            {renderMultiSelect("Supervisor", supervisoresUnicos.map(s => ({ value: s, label: s })), selectedSupervisores, setSelectedSupervisores)}
            {renderMultiSelect("Equipe", equipesUnicas.map(e => ({ value: e, label: e })), selectedEquipes, setSelectedEquipes)}

            <div className="flex flex-col justify-center min-w-[200px]">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Período</span>
              <DatePickerWithRange 
                date={dateRange} 
                setDate={(r) => setDateRange(r || {})} 
                className="h-8 w-full"
              />
            </div>

            <div className="flex flex-col justify-center">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Limite Deslocamento</span>
              <div className="flex items-center gap-2 border border-input rounded-md px-2 h-8 bg-background focus-within:ring-1 focus-within:ring-ring">
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                <Input 
                  type="number" 
                  step="0.5" 
                  min="0"
                  value={limiteDeslocamento} 
                  onChange={(e) => setLimiteDeslocamento(Number(e.target.value) || 0)}
                  className="w-16 h-6 px-1 py-0 text-center text-[11px] font-bold border-none shadow-none focus-visible:ring-0"
                />
                <span className="text-[11px] font-medium text-muted-foreground">h</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1"></div>
          
          <div className="flex items-center gap-1 bg-secondary/30 rounded-md border border-border px-1 h-8 mr-1 shrink-0 mb-1">
             <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))} title="Diminuir Zoom">
               <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
             </Button>
             <span className="text-[10px] font-bold w-8 text-center text-muted-foreground" title="Nível de Zoom">{(zoomLevel * 100).toFixed(0)}%</span>
             <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoomLevel(z => Math.min(2.0, z + 0.1))} title="Aumentar Zoom">
               <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
             </Button>
          </div>

          <div className="flex items-center ml-2 mb-1">
            <SyncIndicator />
          </div>
        </div>
      </div>

      <div style={{ zoom: zoomLevel } as React.CSSProperties} className="space-y-6">
      {/* 2. CARDS DE RESUMO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Meta vs Planejado (Ativas) */}
        <div className="bg-card border border-border p-5 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-2">01. Meta vs Plan. (Ativas)</h3>
            <p className="text-xs text-muted-foreground mb-4">Aderência da carteira em relação à meta (considera apenas equipes com planejamento).</p>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className={`text-4xl font-bold ${totals.percentMetaAtiva < 100 ? 'text-red-500' : 'text-green-500'}`}>
                {totals.percentMetaAtiva.toFixed(1)}%
              </p>
              <p className="text-[10px] font-semibold mt-1 text-muted-foreground">
                Plan: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totals.totalPlanejado)} / 
                Meta: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totals.totalMetaAtiva)}
              </p>
            </div>
            {totals.percentMetaAtiva < 100 && (
              <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-md animate-pulse">
                ABAIXO DA META
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Tempo Médio de Deslocamento */}
        <div className="bg-card border border-border p-5 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-2">02. Deslocamento Médio</h3>
            <p className="text-xs text-muted-foreground mb-4">Mostra se a equipe vai gastar tempo demais na estrada antes de produzir.</p>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className={`text-4xl font-bold ${totals.avgDeslocamento > limiteDeslocamento ? 'text-orange-500' : 'text-green-500'}`}>
                {totals.avgDeslocamento.toFixed(1)}h
              </p>
              <p className="text-xs font-semibold mt-1 text-muted-foreground">média por dia/equipe</p>
            </div>
            {hasExcessoDeslocamento && (
              <div className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-md animate-pulse">
                DISPARA ESCALAÇÃO
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Tempo Planejado por Equipe */}
        <div className="bg-card border border-border p-5 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-2">03. Tempo Planejado</h3>
            <p className="text-xs text-muted-foreground mb-4">Mostra se a equipe foi planejada para uma jornada cheia de trabalho.</p>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className={`text-4xl font-bold ${(totals.avgTempoServico < 8 || totals.avgTempoServico > 10) ? 'text-red-500' : 'text-green-500'}`}>
                {totals.avgTempoServico.toFixed(1)}h
              </p>
              <p className="text-xs font-semibold mt-1 text-muted-foreground">média por dia/equipe</p>
              <div className="flex gap-3 mt-2">
                <span className="text-[10px] font-semibold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded" title="Equipes/Dias planejados com menos de 8h">
                  {subutilizadasCount} &lt; 8h
                </span>
                <span className="text-[10px] font-semibold text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded" title="Equipes/Dias planejados com mais de 10h">
                  {sobrecarregadasCount} &gt; 10h
                </span>
              </div>
            </div>
            {hasEscalacaoTempoPlanejado && (
              <div className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-md animate-pulse">
                DISPARA ESCALAÇÃO
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. TABELAS DE DETALHAMENTO / ESCALAÇÃO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="flex flex-col gap-6">
          {/* Tabela 1: Equipes Fora da Meta */}
          <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden h-[200px] min-h-[150px] max-h-[800px] resize-y">
            <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm text-foreground">Aderência (Equipes Ativas)</h3>
              </div>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Equipe</th>
                    <th className="px-3 py-2 font-semibold text-right">Plan.</th>
                    <th className="px-3 py-2 font-semibold text-right">Meta</th>
                    <th className="px-3 py-2 font-semibold text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {deficitMetaEquipes.map((d, i) => {
                    const isDeficit = d.valPlanejado < d.metaEquipe;
                    const valColor = isDeficit ? "text-red-500" : "text-green-500";
                    const percent = d.metaEquipe > 0 ? (d.valPlanejado / d.metaEquipe) * 100 : 0;
                    
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 font-bold truncate max-w-[120px]" title={d.equipe}>
                          {d.equipe}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${valColor}`}>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(d.valPlanejado)}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(d.metaEquipe)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${valColor}`}>
                          {percent.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                  {deficitMetaEquipes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma equipe ativa com meta</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabela 1B: Equipes */}
          <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden h-[200px] min-h-[150px] max-h-[800px] resize-y">
            <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-bold text-sm text-foreground">Aderência (Todas com Meta)</h3>
              </div>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Equipe</th>
                    <th className="px-3 py-2 font-semibold text-right">Plan.</th>
                    <th className="px-3 py-2 font-semibold text-right">Meta</th>
                    <th className="px-3 py-2 font-semibold text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {todasEquipesComMeta.map((d, i) => {
                    const isDeficit = d.valPlanejado < d.metaEquipe;
                    const valColor = isDeficit ? "text-red-500" : "text-green-500";
                    const percent = d.metaEquipe > 0 ? (d.valPlanejado / d.metaEquipe) * 100 : 0;
                    
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 font-bold truncate max-w-[120px]" title={d.equipe}>
                          {d.equipe}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${valColor}`}>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(d.valPlanejado)}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(d.metaEquipe)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${valColor}`}>
                          {percent.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                  {todasEquipesComMeta.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma equipe com meta</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card 1B: Meta (Todas) */}
          <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-2">Aderência Geral (Todas)</h3>
              <p className="text-[10px] text-muted-foreground mb-3">Diagnóstico considerando todas as equipes da carteira que possuem meta.</p>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className={`text-3xl font-bold ${totals.percentMetaGeral < 100 ? 'text-red-500' : 'text-green-500'}`}>
                  {totals.percentMetaGeral.toFixed(1)}%
                </p>
                <p className="text-[10px] font-semibold mt-1 text-muted-foreground">
                  Plan: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totals.totalPlanejado)} / 
                  Meta: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totals.totalMetaGeral)}
                </p>
              </div>
              {totals.percentMetaGeral < 100 && (
                <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-md animate-pulse">
                  ABAIXO DA META
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabela 2: Deslocamento */}
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden h-[500px] min-h-[150px] max-h-[1200px] resize-y">
          <div className="p-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <h3 className="font-bold text-sm text-foreground">Deslocamento (Meta &le; {limiteDeslocamento}h)</h3>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar p-0">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-3 py-2 font-semibold">Equipe / Dia</th>
                  <th className="px-3 py-2 font-semibold text-right">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {deslocamentoEquipes.map((d, i) => {
                  const isBad = d.tempoDeslocamento > limiteDeslocamento;
                  const colorClass = isBad ? "text-red-500" : "text-green-500";
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-bold truncate max-w-[150px]" title={d.equipe}>{d.equipe}</div>
                        <div className="text-[10px] text-muted-foreground">{d.data}</div>
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${colorClass}`}>
                        {d.tempoDeslocamento.toFixed(1)}h
                      </td>
                    </tr>
                  );
                })}
                {deslocamentoEquipes.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">Nenhuma escalação</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabela 3: Tempo Planejado */}
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden h-[500px] min-h-[150px] max-h-[1200px] resize-y">
          <div className="p-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="font-bold text-sm text-foreground">Plan. Fora do Ideal (&lt; 8h ou &gt; 10h)</h3>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar p-0">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-3 py-2 font-semibold">Equipe / Dia</th>
                  <th className="px-3 py-2 font-semibold text-right">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {tempoPlanejadoEquipes.map((d, i) => {
                  const isBad = d.tempoPlanejado < 8.0 || d.tempoPlanejado > 10.0;
                  const colorClass = isBad ? "text-red-500" : "text-green-500";
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-bold truncate max-w-[150px]" title={d.equipe}>{d.equipe}</div>
                        <div className="text-[10px] text-muted-foreground">{d.data}</div>
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${colorClass}`}>
                        {d.tempoPlanejado.toFixed(1)}h
                      </td>
                    </tr>
                  );
                })}
                {tempoPlanejadoEquipes.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">Nenhuma escalação</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
      </div>
    </div>
  );
};
