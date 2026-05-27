import { useMemo, useState } from 'react';
import { usePlanejamentoData, PlanejamentoRow, getEtapaColorClass } from '@/hooks/usePlanejamentoData';
import { usePlanejamentoRaw, useSyncPlanejamento } from '@/hooks/usePlanejamentoRaw';
import { useSessionState } from '@/hooks/useSessionState';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';
import { cn } from '@/lib/utils';
import { Loader2, ChevronLeft, ChevronRight, Filter, Calendar, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { format, differenceInDays, startOfDay, addDays, subDays, parseISO, parse, isValid, startOfMonth, getDaysInMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SyncIndicator } from '@/components/SyncIndicator';

const statusColors: Record<string, string> = {
  'Cancelada': 'bg-red-500 text-white',
  'Concluída/Unitizada': 'bg-green-500 text-white',
  'CONCLUÍDA/UNITIZADA': 'bg-green-500 text-white',
  'CONCLU?DA/UNITIZADA': 'bg-green-500 text-white',
  'Em execução': 'bg-purple-500 text-white',
  'Interrompida/Atualizar NEOEX': 'bg-red-800 text-white',
  'Paralisada': 'bg-yellow-500 text-white',
  'Programada': 'bg-blue-500 text-white',
  'Reprogramar': 'bg-orange-800 text-white',
  'default': 'bg-gray-400 text-white'
};

const getStatusColorClass = (status: string) => {
  if (!status) return statusColors['default'];
  const foundKey = Object.keys(statusColors).find(k => k.toLowerCase() === status.toLowerCase());
  if (foundKey) return statusColors[foundKey];
  if (status.includes('CONCLU')) return statusColors['Concluída/Unitizada'];
  return statusColors['default'];
};

export const PlanejamentoGanttView = () => {
  const [selectedUnidadesIds, setSelectedUnidadesIds] = useSessionState<string[]>('filter_unidades_planejamentogantt', []);
  const [zoomLevel, setZoomLevel] = useSessionState<number>('filter_zoom_planejamentogantt', 1);
  const [draftUnidadesIds, setDraftUnidadesIds] = useState<string[]>(selectedUnidadesIds);
  const [unidadesDropdownOpen, setUnidadesDropdownOpen] = useState(false);
  const { mutate: syncPlanejamento, isPending: isSyncing } = useSyncPlanejamento();

  const { data, isLoading, isError, error, lastUpdated } = usePlanejamentoData(selectedUnidadesIds);
  const [selectedMeses, setSelectedMeses] = useSessionState<string[]>('filter_meses_planejamentogantt', []);
  const [filterStart, setFilterStart] = useSessionState<string>('filter_start_planejamentogantt', '');
  const [filterEnd, setFilterEnd] = useSessionState<string>('filter_end_planejamentogantt', '');
  const [selectedStatuses, setSelectedStatuses] = useSessionState<string[]>('filter_status_planejamentogantt', []);
  const [selectedProjetos, setSelectedProjetos] = useSessionState<string[]>('filter_projetos_planejamentogantt', []);
  
  const [viewStartManual, setViewStartManual] = useState(() => startOfMonth(new Date()));
  
  const dayWidth = 32;

  const { viewStartEfetivo, daysToShowEfetivo } = useMemo(() => {
    if (filterStart && filterEnd) {
      const start = startOfDay(parseISO(filterStart));
      const end = startOfDay(parseISO(filterEnd));
      return {
        viewStartEfetivo: start,
        daysToShowEfetivo: Math.max(1, differenceInDays(end, start) + 1)
      };
    }
    
    if (filterStart && !filterEnd) {
      return {
        viewStartEfetivo: startOfDay(parseISO(filterStart)),
        daysToShowEfetivo: 60
      };
    }

    if (selectedMeses.length === 1) {
      const parsedMes = parse(selectedMeses[0], 'MMM/yy', new Date(), { locale: ptBR });
      if (isValid(parsedMes)) {
         return {
            viewStartEfetivo: startOfMonth(parsedMes),
            daysToShowEfetivo: getDaysInMonth(parsedMes)
         };
      }
    }
    
    return {
       viewStartEfetivo: viewStartManual,
       daysToShowEfetivo: 60
    };
  }, [selectedMeses, filterStart, filterEnd, viewStartManual]);

  const dates = useMemo(() => {
    return Array.from({ length: daysToShowEfetivo }, (_, i) => addDays(viewStartEfetivo, i));
  }, [viewStartEfetivo, daysToShowEfetivo]);

  const mesesDisponiveis = useMemo(() => {
    if (!data) return [];
    const meses = new Set<string>();
    data.forEach(row => {
      if (row.mesFiltro && row.mesFiltro !== '-') {
        const parts = row.mesFiltro.split(',').map(m => m.trim());
        parts.forEach(p => meses.add(p));
      }
    });
    
    const parseMesToDate = (m: string) => {
      try {
        const cleanStr = m.replace('/', ' ');
        return parse(cleanStr, 'MMM yy', new Date(), { locale: ptBR }).getTime();
      } catch (e) {
        return 0;
      }
    };

    return Array.from(meses).sort((a, b) => parseMesToDate(b) - parseMesToDate(a));
  }, [data]);

  const statusDisponiveis = useMemo(() => {
    if (!data) return [];
    const statusSet = new Set<string>();
    data.forEach(row => {
      const s = row.statusExecucao ? row.statusExecucao.trim() : 'N/A';
      if (s) statusSet.add(s);
    });
    return Array.from(statusSet).sort();
  }, [data]);

  const baseFilteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(row => {
      const passMes = selectedMeses.length === 0 || selectedMeses.some(m => row.mesFiltro && row.mesFiltro.includes(m));
      const statusNormalizado = row.statusExecucao ? row.statusExecucao.trim() : 'N/A';
      const passStatus = selectedStatuses.length === 0 || selectedStatuses.includes(statusNormalizado);
      
      let passDateStart = true;
      let passDateEnd = true;

      if (filterStart) {
        if (!row.parsedStartDate) passDateStart = false;
        else {
          const fs = startOfDay(parseISO(filterStart));
          if (startOfDay(row.parsedStartDate) < fs) passDateStart = false;
        }
      }

      if (filterEnd) {
        if (!row.parsedEndDate) passDateEnd = false;
        else {
          const fe = startOfDay(parseISO(filterEnd));
          if (startOfDay(row.parsedEndDate) > fe) passDateEnd = false;
        }
      }
      
      return passMes && passStatus && passDateStart && passDateEnd;
    });
  }, [data, selectedMeses, selectedStatuses, filterStart, filterEnd]);

  const projetosDisponiveis = useMemo(() => {
    const projSet = new Set<string>();
    baseFilteredData.forEach(row => {
      if (row.projeto) projSet.add(row.projeto);
    });
    return Array.from(projSet).sort();
  }, [baseFilteredData]);

  const filteredData = useMemo(() => {
    if (selectedProjetos.length === 0) return baseFilteredData;
    return baseFilteredData.filter(row => selectedProjetos.includes(row.projeto));
  }, [baseFilteredData, selectedProjetos]);

  const getPosition = (row: PlanejamentoRow) => {
    if (!row.parsedStartDate || !row.parsedEndDate) return null;
    const start = startOfDay(row.parsedStartDate);
    const end = startOfDay(row.parsedEndDate);
    const daysDiff = differenceInDays(start, viewStartEfetivo);
    const duration = Math.max(1, differenceInDays(end, start) + 1);

    return {
      left: Math.max(0, daysDiff) * dayWidth,
      width: Math.max(duration, 1) * dayWidth,
      isVisible: daysDiff + duration > 0 && daysDiff < daysToShowEfetivo,
      startsBeforeView: daysDiff < 0,
      endsAfterView: daysDiff + duration > daysToShowEfetivo
    };
  };

  const toggleStatus = (s: string) => {
    setSelectedStatuses(prev => 
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  const toggleProjeto = (p: string) => {
    setSelectedProjetos(prev => 
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const toggleMes = (m: string) => {
    setSelectedMeses(prev => 
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Carteira de Planejamento</h1>
          <p className="text-muted-foreground">Carregando dados da planilha...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Erro</h1>
          <p className="text-red-500">Não foi possível carregar a planilha. Certifique-se de que o link está configurado para "Qualquer pessoa com o link pode Ler".</p>
          <pre className="mt-4 p-4 bg-secondary rounded text-xs overflow-auto">
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  const today = startOfDay(new Date());
  const todayPosition = differenceInDays(today, viewStartEfetivo) * dayWidth;

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <div className="flex flex-col gap-3 p-4 shrink-0 border-b border-border">
        <div className="flex flex-row flex-nowrap items-end gap-6 overflow-x-auto custom-scrollbar pb-2">
          <div className="shrink-0 mb-1">
            <h1 className="text-xl font-bold text-foreground mb-0.5 leading-none">Carteira de Planejamento</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Filtros e Visualização</p>
          </div>
          
          {/* Divisor */}
          <div className="w-px h-10 bg-border shrink-0"></div>

          <div className="flex flex-nowrap items-end gap-2 shrink-0">
          <div className="flex flex-col justify-center min-w-[100px]">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Unidade</span>
            <DropdownMenu 
              open={unidadesDropdownOpen} 
              onOpenChange={(open) => {
                setUnidadesDropdownOpen(open);
                if (!open) {
                  // Aplica os filtros apenas ao fechar o dropdown
                  setSelectedUnidadesIds(draftUnidadesIds);
                } else {
                  // Sincroniza ao abrir
                  setDraftUnidadesIds(selectedUnidadesIds);
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between text-left font-normal text-xs h-10">
                  <span className="truncate">
                    {draftUnidadesIds.length === 0 
                      ? 'Unidades' 
                      : draftUnidadesIds.length === 1
                        ? UNIDADES_PLANEJAMENTO.find(u => u.id === draftUnidadesIds[0])?.nome
                        : `${draftUnidadesIds.length} unidades`}
                  </span>
                  <Filter className="w-3 h-3 ml-2 opacity-50 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 max-h-72 overflow-y-auto">
            <div className="p-2 border-b border-border flex gap-2 sticky top-0 bg-popover z-10">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7" onClick={() => setDraftUnidadesIds(UNIDADES_PLANEJAMENTO.map(u => u.id))}>Selecionar todos</Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setDraftUnidadesIds([])}>Limpar</Button>
            </div>
                {UNIDADES_PLANEJAMENTO.map(uni => (
                  <DropdownMenuCheckboxItem
                    key={uni.id}
                    checked={draftUnidadesIds.includes(uni.id)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => {
                      setDraftUnidadesIds(prev => 
                        prev.includes(uni.id) ? prev.filter(x => x !== uni.id) : [...prev, uni.id]
                      );
                    }}
                  >
                    {uni.nome}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <FilterSelect label="Mês" options={mesesDisponiveis.map(m => ({ value: m, label: m }))} selectedValues={selectedMeses} onChange={setSelectedMeses} searchable={true} />
          <div className="flex flex-col justify-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Período</span>
            <div className="flex items-center gap-1.5 bg-secondary/30 rounded-md border border-border px-2 h-10">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
                className="h-full bg-transparent text-sm text-foreground focus-visible:outline-none placeholder:text-muted-foreground"
                title="Data de Início (projetos a partir de)"
              />
              <span className="text-muted-foreground text-xs">até</span>
              <input
                type="date"
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
                className="h-full bg-transparent text-sm text-foreground focus-visible:outline-none placeholder:text-muted-foreground"
                title="Data de Fim (projetos até)"
              />
              {(filterStart || filterEnd) && (
                <button onClick={() => { setFilterStart(''); setFilterEnd(''); }} className="text-xs text-muted-foreground hover:text-foreground underline ml-2">
                  Limpar
                </button>
              )}
            </div>
          </div>
          
          <FilterSelect label="Projeto" options={projetosDisponiveis.map(p => ({ value: p, label: p }))} selectedValues={selectedProjetos} onChange={setSelectedProjetos} searchable={true} />
          
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-secondary/30 rounded-md border border-border px-1 h-10 ml-2 shrink-0">
             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))} title="Diminuir Zoom">
               <ZoomOut className="w-4 h-4 text-muted-foreground" />
             </Button>
             <span className="text-xs font-bold w-10 text-center text-muted-foreground" title="Nível de Zoom">{(zoomLevel * 100).toFixed(0)}%</span>
             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoomLevel(z => Math.min(2.0, z + 0.1))} title="Aumentar Zoom">
               <ZoomIn className="w-4 h-4 text-muted-foreground" />
             </Button>
          </div>
          
          <div className="flex items-center gap-2 ml-auto">
            <SyncIndicator />
            <div className="w-px h-6 bg-border mr-1 ml-2"></div>
            
            <Button variant="outline" size="sm" onClick={() => setViewStartManual(subDays(viewStartManual, 7))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setViewStartManual(startOfDay(subDays(new Date(), 3)))}>
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={() => setViewStartManual(addDays(viewStartManual, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

        {/* Filtros de Status em Botões Coloridos */}
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          <span className="text-sm font-semibold text-foreground mr-2">Status:</span>
          {statusDisponiveis.map(s => {
            const isSelected = selectedStatuses.length === 0 || selectedStatuses.includes(s);
            const colorClass = getStatusColorClass(s);
            
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-semibold transition-all border shrink-0",
                  isSelected 
                    ? cn(colorClass, "border-transparent shadow-sm") 
                    : "bg-transparent text-muted-foreground border-border hover:bg-secondary/50 opacity-60 hover:opacity-100"
                )}
              >
                {s}
              </button>
            );
          })}
          {selectedStatuses.length > 0 && (
            <button
              onClick={() => setSelectedStatuses([])}
              className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground underline ml-2 shrink-0"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col bg-card relative">
        {/* Contêiner de Scroll Único para X e Y */}
        <div className="flex-1 overflow-auto relative flex custom-scrollbar">
          <div className="flex min-w-max h-max" style={{ zoom: zoomLevel } as React.CSSProperties}>
            
            {/* Left Column (Sticky Left) */}
            <div className="w-[240px] flex-shrink-0 sticky left-0 z-30 bg-card border-r border-border flex flex-col shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
              {/* Header (Sticky Top) */}
              <div className="h-12 bg-secondary/95 backdrop-blur border-b border-border p-3 flex flex-col justify-center sticky top-0 z-40">
                <span className="font-semibold text-xs text-foreground">Projeto</span>
                <span className="text-[10px] text-muted-foreground">Supervisor</span>
              </div>
              
              {/* Rows Left */}
              <div className="flex flex-col bg-background/50">
                {filteredData.map((row) => (
                  <div
                    key={row.id}
                    className="h-10 border-b border-border px-3 flex flex-col justify-center group hover:bg-secondary/30 transition-colors"
                  >
                    <p className="text-xs font-semibold text-foreground truncate" title={`${row.projeto}${row.nomeProjeto ? ` - ${row.nomeProjeto}` : ''}`}>
                      {row.projeto}
                      {row.nomeProjeto && <span className="text-[10px] font-normal text-muted-foreground ml-1">- {row.nomeProjeto}</span>}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground truncate" title={row.supervisor}>
                        {row.supervisor || 'Sem supervisor'}
                      </p>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider truncate max-w-[80px] text-right" title={row.statusExecucao}>
                        {row.statusExecucao || 'N/A'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column (Timeline) */}
            <div className="flex-shrink-0 flex flex-col relative" style={{ width: daysToShowEfetivo * dayWidth }}>
              {/* Timeline Header (Sticky Top) */}
              <div className="h-12 bg-secondary/95 backdrop-blur border-b border-border flex sticky top-0 z-20">
                {dates.map((date) => {
                  const isCurrentDay = differenceInDays(date, today) === 0;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  
                  return (
                    <div
                      key={date.toISOString()}
                      className={cn(
                        'flex-shrink-0 border-r border-border flex flex-col items-center justify-center text-[10px]',
                        isWeekend && 'bg-secondary/30',
                        isCurrentDay && 'bg-primary/10'
                      )}
                      style={{ width: dayWidth }}
                    >
                      <span className="text-[8px] text-muted-foreground uppercase tracking-tighter">
                        {format(date, 'EEE', { locale: ptBR })}
                      </span>
                      <span className={cn(
                        'text-[10px] font-bold tracking-tighter',
                        isCurrentDay ? 'text-primary' : 'text-foreground'
                      )}>
                        {format(date, 'dd/MM')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Task Bars Area */}
              <div className="relative flex flex-col">
                {/* Background grid */}
                <div className="absolute inset-0 flex pointer-events-none z-0">
                  {dates.map((date) => {
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    return (
                      <div
                        key={date.toISOString()}
                        className={cn(
                          'flex-shrink-0 border-r border-border/50 h-full',
                          isWeekend && 'bg-secondary/20'
                        )}
                        style={{ width: dayWidth }}
                      />
                    );
                  })}
                </div>

                {/* Today Line */}
                {todayPosition >= 0 && todayPosition < daysToShowEfetivo * dayWidth && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none"
                    style={{ left: todayPosition + dayWidth / 2 }}
                  />
                )}

                {/* Bars */}
                {filteredData.map((row) => {
                  const position = getPosition(row);
                  
                  return (
                    <div
                      key={row.id}
                      className="h-10 border-b border-border/40 relative flex items-center"
                    >
                      {/* Sub-barras (Etapas) */}
                      {row.etapasDiarias?.map((etapa, idx) => {
                        if (!etapa.dataParsed) return null;
                        const daysDiff = differenceInDays(etapa.dataParsed, viewStartEfetivo);
                        if (daysDiff < 0 || daysDiff >= daysToShowEfetivo) return null; // Fora da visão atual
                        
                        const etapaColorClass = getEtapaColorClass(etapa.etapa);
                        
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "absolute top-[6px] h-3 rounded-[2px] border shadow-sm flex items-center justify-center z-20 cursor-pointer transition-colors",
                              etapaColorClass
                            )}
                            style={{
                              left: daysDiff * dayWidth,
                              width: dayWidth - 1,
                            }}
                            title={`Data: ${etapa.dataString}\nEtapa: ${etapa.etapa}`}
                          >
                            <span className="text-[7px] text-zinc-100 font-bold uppercase tracking-tighter truncate px-0.5 pointer-events-none">
                              {etapa.etapa.substring(0, 3)}
                            </span>
                          </div>
                        );
                      })}

                      {/* Barra Principal (Start/End) */}
                      {position?.isVisible ? (
                        <div
                          className={cn(
                            'absolute top-[18px] h-4 rounded shadow-sm flex items-center px-1.5 text-[10px] font-semibold truncate animate-fade-in z-10 transition-all hover:brightness-110 hover:shadow-md cursor-pointer',
                            getStatusColorClass(row.statusExecucao),
                            position.startsBeforeView && 'rounded-l-none border-l-2 border-dashed border-white/50',
                            position.endsAfterView && 'rounded-r-none border-r-2 border-dashed border-white/50'
                          )}
                          style={{
                            left: position.left,
                            width: position.width - 2,
                          }}
                          title={`Início: ${row.dataInicio} \nFim: ${row.dataFim} \nStatus: ${row.statusExecucao}`}
                        >
                          {position.width > 60 && row.projeto}
                        </div>
                      ) : !row.parsedStartDate ? (
                        <div className="w-full h-full flex items-center justify-center pointer-events-none z-10">
                          <span className="text-[9px] text-muted-foreground/30 italic">S/ Data</span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
