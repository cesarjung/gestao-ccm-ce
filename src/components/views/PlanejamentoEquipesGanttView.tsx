import { useMemo, useState } from 'react';
import { usePlanejamentoEquipesData, PlanejamentoEquipeRow } from '@/hooks/usePlanejamentoEquipesData';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';
import { getEtapaColorClass } from '@/hooks/usePlanejamentoData';
import { usePlanejamentoRaw, useSyncPlanejamento } from '@/hooks/usePlanejamentoRaw';
import { useSessionState } from '@/hooks/useSessionState';
import { cn } from '@/lib/utils';
import { Loader2, ChevronLeft, ChevronRight, Filter, Calendar, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { format, differenceInDays, startOfDay, addDays, subDays, parseISO, parse, isValid, startOfMonth, getDaysInMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FilterSelect } from '@/components/ui/filter-select';
import { SyncIndicator } from '@/components/SyncIndicator';
import { PlanejamentoEquipesMap } from './PlanejamentoEquipesMap';

export const PlanejamentoEquipesGanttView = () => {
  const [selectedUnidadesIds, setSelectedUnidadesIds] = useSessionState<string[]>('filter_unidades_planejamentoequipesgantt', []);
  const [zoomLevel, setZoomLevel] = useSessionState<number>('filter_zoom_planejamentoequipesgantt', 1);
  const [draftUnidadesIds, setDraftUnidadesIds] = useState<string[]>(selectedUnidadesIds);
  const [unidadesDropdownOpen, setUnidadesDropdownOpen] = useState(false);
  const { mutate: syncPlanejamento, isPending: isSyncing } = useSyncPlanejamento();

  const { data, isLoading, isError, error, lastUpdated } = usePlanejamentoEquipesData(selectedUnidadesIds);
  const [selectedMeses, setSelectedMeses] = useSessionState<string[]>('filter_meses_planejamentoequipesgantt', []);
  const [filterStart, setFilterStart] = useSessionState<string>('filter_start_planejamentoequipesgantt', '');
  const [filterEnd, setFilterEnd] = useSessionState<string>('filter_end_planejamentoequipesgantt', '');
  const [selectedSupervisores, setSelectedSupervisores] = useSessionState<string[]>('filter_supervisores_planejamentoequipesgantt', []);
  const [selectedEquipes, setSelectedEquipes] = useSessionState<string[]>('filter_equipes_planejamentoequipesgantt', []);
  const [selectedProjetos, setSelectedProjetos] = useSessionState<string[]>('filter_projetos_planejamentoequipesgantt', []);
  
  const [viewStartManual, setViewStartManual] = useState(() => startOfMonth(new Date()));
  
  const dayWidth = 48;

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
      row.atividadesDiarias.forEach(ativ => {
        const mesAno = format(ativ.dataParsed, 'MMM/yy', { locale: ptBR }).toUpperCase();
        meses.add(mesAno);
      });
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

  const dataFilteredByDate = useMemo(() => {
    if (!data) return [];
    return data.filter(row => {
      let passMes = selectedMeses.length === 0;
      if (!passMes) {
        passMes = row.atividadesDiarias.some(ativ => selectedMeses.includes(format(ativ.dataParsed, 'MMM/yy', { locale: ptBR }).toUpperCase()));
      }

      let passDateStart = true;
      let passDateEnd = true;

      if (filterStart) {
        if (!row.maxDate) passDateStart = false;
        else {
          const fs = startOfDay(parseISO(filterStart));
          if (startOfDay(row.maxDate) < fs) passDateStart = false;
        }
      }

      if (filterEnd) {
        if (!row.minDate) passDateEnd = false;
        else {
          const fe = startOfDay(parseISO(filterEnd));
          if (startOfDay(row.minDate) > fe) passDateEnd = false;
        }
      }

      return passMes && passDateStart && passDateEnd;
    });
  }, [data, selectedMeses, filterStart, filterEnd]);

  const supervisoresDisponiveis = useMemo(() => {
    const supSet = new Set<string>();
    dataFilteredByDate.forEach(row => {
      const s = row.supervisor ? row.supervisor.trim() : 'N/A';
      if (s) supSet.add(s);
    });
    return Array.from(supSet).sort();
  }, [dataFilteredByDate]);

  const equipesDisponiveis = useMemo(() => {
    const eqSet = new Set<string>();
    dataFilteredByDate.forEach(row => {
      const s = row.supervisor ? row.supervisor.trim() : 'N/A';
      if (selectedSupervisores.length === 0 || selectedSupervisores.includes(s)) {
        eqSet.add(row.equipe);
      }
    });
    return Array.from(eqSet).sort();
  }, [dataFilteredByDate, selectedSupervisores]);

  const toggleSupervisor = (s: string) => {
    setSelectedSupervisores(prev => 
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };
  
  const toggleEquipe = (e: string) => {
    setSelectedEquipes(prev => 
      prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]
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

  const baseFilteredData = useMemo(() => {
    return dataFilteredByDate.filter(row => {
      const passSupervisor = selectedSupervisores.length === 0 || selectedSupervisores.includes(row.supervisor ? row.supervisor.trim() : 'N/A');
      const passEquipe = selectedEquipes.length === 0 || selectedEquipes.includes(row.equipe);
      return passSupervisor && passEquipe;
    });
  }, [dataFilteredByDate, selectedSupervisores, selectedEquipes]);

  const projetosDisponiveis = useMemo(() => {
    const projSet = new Set<string>();
    baseFilteredData.forEach(row => {
      row.atividadesDiarias.forEach(ativ => {
        ativ.atividades.forEach(a => {
          if (a.projeto) projSet.add(a.projeto);
        });
      });
    });
    return Array.from(projSet).sort();
  }, [baseFilteredData]);

  const filteredData = useMemo(() => {
    if (selectedProjetos.length === 0) return baseFilteredData;
    
    return baseFilteredData.map(row => {
      return {
        ...row,
        atividadesDiarias: row.atividadesDiarias.map(ativ => ({
          ...ativ,
          atividades: ativ.atividades.filter(a => selectedProjetos.includes(a.projeto))
        })).filter(ativ => ativ.atividades.length > 0)
      };
    }).filter(row => row.atividadesDiarias.length > 0);
  }, [baseFilteredData, selectedProjetos]);

  const dashboardStats = useMemo(() => {
    let valorPlanejadoTotal = 0;
    let valorMetaTotal = 0;
    let realizadoPlanejadoTotal = 0;
    let totalProduzidoTotal = 0;
    let tempoDeslocamentoTotal = 0;

    filteredData.forEach(row => {
      row.atividadesDiarias.forEach(ativ => {
        let isValidDate = true;
        
        if (selectedMeses.length > 0) {
          const mesAno = format(ativ.dataParsed, 'MMM/yy', { locale: ptBR }).toUpperCase();
          if (!selectedMeses.includes(mesAno)) isValidDate = false;
        }

        if (filterStart) {
          const fs = startOfDay(parseISO(filterStart));
          if (startOfDay(ativ.dataParsed) < fs) isValidDate = false;
        }

        if (filterEnd) {
          const fe = startOfDay(parseISO(filterEnd));
          if (startOfDay(ativ.dataParsed) > fe) isValidDate = false;
        }

        if (isValidDate) {
          ativ.atividades.forEach(a => {
            valorPlanejadoTotal += a.valorPlanejado || 0;
            valorMetaTotal += a.valorMeta || 0;
            realizadoPlanejadoTotal += a.realizadoPlanejado || 0;
            totalProduzidoTotal += a.totalProduzido || 0;
            tempoDeslocamentoTotal += a.tempoDeslocamento || 0;
          });
        }
      });
    });

    const percPlanejadoMeta = valorMetaTotal > 0 ? (valorPlanejadoTotal / valorMetaTotal) * 100 : 0;
    const percProducaoMeta = valorMetaTotal > 0 ? (totalProduzidoTotal / valorMetaTotal) * 100 : 0;
    const percCumprimentoPlan = valorPlanejadoTotal > 0 ? (realizadoPlanejadoTotal / valorPlanejadoTotal) * 100 : 0;
    const percProduzidoPlanejado = valorPlanejadoTotal > 0 ? (totalProduzidoTotal / valorPlanejadoTotal) * 100 : 0;

    return {
      valorPlanejadoTotal,
      valorMetaTotal,
      realizadoPlanejadoTotal,
      totalProduzidoTotal,
      tempoDeslocamentoTotal,
      percPlanejadoMeta,
      percProducaoMeta,
      percCumprimentoPlan,
      percProduzidoPlanejado
    };
  }, [filteredData, selectedMeses, filterStart, filterEnd]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-muted-foreground gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p>Analisando alocações de equipes...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-destructive gap-2">
        <p>Falha ao carregar os dados de Equipes.</p>
        <p className="text-sm opacity-70">{(error as Error).message}</p>
      </div>
    );
  }

  const getPercentageColorClass = (val: number) => {
    if (val === 0) return "bg-red-500/10 text-red-500";
    if (val <= 40) return "bg-red-500/10 text-red-500";
    if (val <= 80) return "bg-orange-500/10 text-orange-500";
    if (val < 100) return "bg-yellow-500/10 text-yellow-600";
    if (val === 100) return "bg-green-500/10 text-green-500";
    if (val <= 120) return "bg-sky-500/10 text-sky-500";
    return "bg-blue-600/10 text-blue-600";
  };

  const today = startOfDay(new Date());
  const todayPosition = differenceInDays(today, viewStartEfetivo) * dayWidth;

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-6 py-2 shrink-0 border-b border-border">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            Planejamento de Equipes
            <span className="text-muted-foreground text-xs font-normal hidden sm:inline-block">
              - Visualize e filtre o dia a dia de cada equipe
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-4 text-[10px] bg-secondary/20 px-2 py-1 rounded-md border border-border">
           <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-blue-500 rounded-[2px]"></div> <span className="text-muted-foreground font-medium uppercase tracking-wider">1 Obra</span></div>
           <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-orange-500 rounded-[2px]"></div> <span className="text-muted-foreground font-medium uppercase tracking-wider">Múltiplas Obras</span></div>
        </div>
      </div>

      <div className="px-6 py-3 bg-background border-b border-border flex flex-row flex-nowrap gap-4 items-end overflow-x-auto custom-scrollbar pb-2">
        
        <div className="flex flex-nowrap items-end gap-2 shrink-0">
          {/* Valor Planejado + Cumprimento Planejamento */}
          <div className="flex flex-col justify-center border border-border bg-card p-2 rounded-lg shadow-sm min-w-[120px]">
            <div className="flex items-center gap-2 mb-0.5 justify-between">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Valor Planejado</span>
              <span className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded-sm",
                getPercentageColorClass(dashboardStats.percCumprimentoPlan)
              )} title="Cumprimento Planejamento (Realizado Planejado / Valor Planejado)">
                {dashboardStats.percCumprimentoPlan.toFixed(1)}%
              </span>
            </div>
            <span className="text-base font-bold text-foreground tracking-tight truncate" title={formatCurrency(dashboardStats.valorPlanejadoTotal)}>
               {formatCurrency(dashboardStats.valorPlanejadoTotal)}
            </span>
          </div>

          {/* Valor Produzido + Produção x Meta */}
          <div className="flex flex-col justify-center border border-border bg-card p-2 rounded-lg shadow-sm min-w-[120px]">
            <div className="flex items-center gap-2 mb-0.5 justify-between">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Valor Produzido</span>
              <span className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded-sm",
                getPercentageColorClass(dashboardStats.percProduzidoPlanejado)
              )} title="% Produzido / Planejado (Total Produzido / Valor Planejado)">
                {dashboardStats.percProduzidoPlanejado.toFixed(1)}%
              </span>
            </div>
            <span className="text-base font-bold text-foreground tracking-tight truncate" title={formatCurrency(dashboardStats.totalProduzidoTotal)}>
               {formatCurrency(dashboardStats.totalProduzidoTotal)}
            </span>
          </div>

          {/* Valor Meta + Planejado x Meta */}
          <div className="flex flex-col justify-center border border-border bg-card p-2 rounded-lg shadow-sm min-w-[120px]">
            <div className="flex items-center gap-2 mb-0.5 justify-between">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Valor Meta</span>
              <span className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded-sm",
                getPercentageColorClass(dashboardStats.percPlanejadoMeta)
              )} title="% Planejado / Meta (Valor Planejado / Valor Meta)">
                {dashboardStats.percPlanejadoMeta.toFixed(1)}%
              </span>
            </div>
            <span className="text-base font-bold text-foreground tracking-tight truncate" title={formatCurrency(dashboardStats.valorMetaTotal)}>
               {formatCurrency(dashboardStats.valorMetaTotal)}
            </span>
          </div>

          {/* Tempo de Deslocamento */}
          <div className="flex flex-col justify-center border border-border bg-orange-500/10 p-2 rounded-lg shadow-sm min-w-[100px]">
            <div className="flex items-center gap-2 mb-0.5 justify-between">
              <span className="text-[9px] font-bold text-orange-600 uppercase tracking-wider">Deslocamento</span>
            </div>
            <span className="text-base font-bold text-orange-700 tracking-tight truncate">
               {dashboardStats.tempoDeslocamentoTotal.toFixed(1)}h
            </span>
          </div>
          {/* Divider */}
          <div className="w-px h-10 bg-border mx-1"></div>

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
                <Button variant="outline" className="w-full justify-between text-left font-normal text-xs h-8">
                  <span className="truncate">
                    {draftUnidadesIds.length === 0 
                      ? 'Unidades' 
                      : draftUnidadesIds.length === 1
                        ? UNIDADES_PLANEJAMENTO.find(u => u.id === draftUnidadesIds[0])?.nome
                        : `${draftUnidadesIds.length} unid.`}
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

          <div className="flex flex-col justify-center w-[110px]">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Supervisor</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between text-left font-normal text-xs h-8">
                  <span className="truncate">
                    {selectedSupervisores.length === 0 
                      ? 'Supervisores' 
                      : `${selectedSupervisores.length} supervisor(es)`}
                  </span>
                  <Filter className="w-3 h-3 ml-2 opacity-50 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 max-h-72 overflow-y-auto">
            <div className="p-2 border-b border-border flex gap-2 sticky top-0 bg-popover z-10">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedSupervisores(supervisoresDisponiveis)}>Selecionar todos</Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedSupervisores([])}>Limpar</Button>
            </div>
                {supervisoresDisponiveis.map(sup => (
                  <DropdownMenuCheckboxItem
                    key={sup}
                    checked={selectedSupervisores.includes(sup)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggleSupervisor(sup)}
                  >
                    {sup}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col justify-center w-[110px]">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Equipe</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between text-left font-normal text-xs h-8">
                  <span className="truncate">
                    {selectedEquipes.length === 0 
                      ? 'Equipes' 
                      : `${selectedEquipes.length} equipe(s)`}
                  </span>
                  <Filter className="w-3 h-3 ml-2 opacity-50 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 max-h-72 overflow-y-auto">
            <div className="p-2 border-b border-border flex gap-2 sticky top-0 bg-popover z-10">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedEquipes(equipesDisponiveis)}>Selecionar todos</Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedEquipes([])}>Limpar</Button>
            </div>
                {equipesDisponiveis.map(eq => (
                  <DropdownMenuCheckboxItem
                    key={eq}
                    checked={selectedEquipes.includes(eq)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggleEquipe(eq)}
                  >
                    {eq}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col justify-center w-[110px]">
             <FilterSelect label="Projeto" options={projetosDisponiveis.map(p => ({ value: p, label: p }))} selectedValues={selectedProjetos} onChange={setSelectedProjetos} searchable={true} />
          </div>

          <FilterSelect label="Mês" options={mesesDisponiveis.map(m => ({ value: m, label: m }))} selectedValues={selectedMeses} onChange={setSelectedMeses} searchable={true} />
          
          <div className="flex flex-col justify-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Período</span>
            <div className="flex items-center gap-1.5 bg-secondary/30 rounded-md border border-border px-2 h-8">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="date"
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
                className="h-full bg-transparent text-[10px] text-foreground focus-visible:outline-none w-[80px]"
                title="A partir de"
              />
              <span className="text-muted-foreground text-[10px]">até</span>
              <input
                type="date"
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
                className="h-full bg-transparent text-[10px] text-foreground focus-visible:outline-none w-[80px]"
                title="Até"
              />
              {(filterStart || filterEnd) && (
                <button onClick={() => { setFilterStart(''); setFilterEnd(''); }} className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1">
                  Limpar
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <SyncIndicator />
            <div className="w-px h-5 bg-border mr-1 ml-2"></div>
            
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-secondary/30 rounded-md border border-border px-1 h-8 mr-1">
               <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))} title="Diminuir Zoom">
                 <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
               </Button>
               <span className="text-[10px] font-bold w-8 text-center text-muted-foreground" title="Nível de Zoom">{(zoomLevel * 100).toFixed(0)}%</span>
               <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoomLevel(z => Math.min(2.0, z + 0.1))} title="Aumentar Zoom">
                 <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
               </Button>
            </div>

            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewStartManual(subDays(viewStartManual, 7))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => setViewStartManual(startOfDay(subDays(new Date(), 3)))}>
              Hoje
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewStartManual(addDays(viewStartManual, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col bg-card relative">
        <div className="flex-1 overflow-auto relative flex custom-scrollbar">
          <div className="flex min-w-max h-max" style={{ zoom: zoomLevel } as React.CSSProperties}>
            
            <div className="w-[280px] flex-shrink-0 sticky left-0 z-30 bg-card border-r border-border flex flex-col shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
              <div className="h-12 bg-secondary/95 backdrop-blur border-b border-border p-3 flex flex-col justify-center sticky top-0 z-40">
                <span className="font-semibold text-xs text-foreground">Equipe</span>
                <span className="text-[10px] text-muted-foreground">Supervisor</span>
              </div>
              
              <div className="flex flex-col bg-background/50">
                {filteredData.map((row, i) => (
                  <div
                    key={i}
                    className="h-[88px] border-b border-border px-3 flex flex-col justify-center group hover:bg-secondary/30 transition-colors"
                  >
                    <p className="text-xs font-semibold text-foreground truncate" title={row.equipe}>
                      {row.equipe}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate" title={row.supervisor}>
                      {row.supervisor || 'Sem supervisor'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-shrink-0 flex flex-col relative" style={{ width: daysToShowEfetivo * dayWidth }}>
              <div className="h-12 bg-secondary/95 backdrop-blur border-b border-border flex sticky top-0 z-20">
                {dates.map((date, i) => {
                  const isCurrentDay = differenceInDays(date, today) === 0;
                  const isSaturday = date.getDay() === 6;
                  const isSunday = date.getDay() === 0;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex-shrink-0 border-r border-border flex flex-col items-center justify-center text-[10px]',
                        isSaturday && 'bg-slate-100 dark:bg-slate-800/40',
                        isSunday && 'bg-slate-200 dark:bg-slate-800/80',
                        isCurrentDay && 'bg-primary/10 text-primary font-bold',
                        !isCurrentDay && 'text-muted-foreground'
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

              <div className="flex flex-col relative bg-background/30">
                <div className="absolute inset-0 flex pointer-events-none z-0">
                  {dates.map((date, i) => {
                    const isSaturday = date.getDay() === 6;
                    const isSunday = date.getDay() === 0;
                    return (
                      <div 
                        key={i} 
                        className={cn(
                          "flex-shrink-0 border-r border-border/50",
                          isSaturday && "bg-slate-100/50 dark:bg-slate-800/30",
                          isSunday && "bg-slate-200/50 dark:bg-slate-800/60"
                        )}
                        style={{ width: dayWidth }}
                      />
                    );
                  })}
                </div>

                {todayPosition >= 0 && todayPosition < daysToShowEfetivo * dayWidth && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none"
                    style={{ left: todayPosition + dayWidth / 2 }}
                  />
                )}

                {filteredData.map((row, i) => (
                  <div
                    key={i}
                    className="h-[88px] border-b border-border/40 relative flex items-center"
                  >
                    {row.atividadesDiarias?.map((ativ, idx) => {
                      const daysDiff = differenceInDays(ativ.dataParsed, viewStartEfetivo);
                      if (daysDiff < 0 || daysDiff >= daysToShowEfetivo) return null;
                      
                      const hasMultiple = ativ.atividades.length > 1;

                      const combinedEtapas = Array.from(new Set(ativ.atividades.map(a => a.etapa).filter(e => e))).join(' | ');
                      const combinedMun = Array.from(new Set(ativ.atividades.map(a => a.municipio).filter(e => e))).join(' | ');
                      const tempoDeslocDia = ativ.atividades.reduce((sum, a) => sum + (a.tempoDeslocamento || 0), 0);
                      
                      const nextAtiv = row.atividadesDiarias[idx + 1];
                      let distanceKm = null;
                      let bracketWidth = 0;
                      let nextTempoDesloc = 0;
                      
                      if (nextAtiv) {
                         const nextMun = Array.from(new Set(nextAtiv.atividades.map(a => a.municipio).filter(e => e))).join(' | ');
                         if (combinedMun && nextMun && combinedMun !== nextMun) {
                            nextTempoDesloc = nextAtiv.atividades[0]?.tempoDeslocamento || 0;
                            const lat1 = ativ.atividades[0]?.lat;
                            const lon1 = ativ.atividades[0]?.lng;
                            const lat2 = nextAtiv.atividades[0]?.lat;
                            const lon2 = nextAtiv.atividades[0]?.lng;
                            
                            if (lat1 && lon1 && lat2 && lon2) {
                               const R = 6371;
                               const dLat = (lat2 - lat1) * Math.PI / 180;
                               const dLon = (lon2 - lon1) * Math.PI / 180;
                               const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                                 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                                 Math.sin(dLon/2) * Math.sin(dLon/2);
                               const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                               distanceKm = R * c;
                               
                               const daysDiffNext = differenceInDays(nextAtiv.dataParsed, viewStartEfetivo);
                               bracketWidth = (daysDiffNext - daysDiff) * dayWidth;
                            }
                         }
                      }

                      const isFolga = combinedEtapas.toLowerCase().includes('folga');
                      const isSemProjeto = ativ.atividades.every(a => a.projeto === 'Sem Projeto');
                      const isFolgaSemProjeto = isFolga && isSemProjeto;

                      const etapaColorClass = isFolgaSemProjeto 
                        ? "bg-slate-500 border-slate-600 hover:bg-slate-400 text-white" 
                        : getEtapaColorClass(combinedEtapas);

                      return (
                        <div key={idx} className="absolute h-[88px] w-full" style={{ left: daysDiff * dayWidth, width: dayWidth }}>
                          {/* Etapa Block (Top) */}
                          <div
                            className={cn(
                              "absolute top-[2px] h-3.5 rounded-[2px] border shadow-sm flex items-center justify-center z-10 cursor-pointer transition-colors",
                              etapaColorClass
                            )}
                            style={{ left: 1, width: dayWidth - 2 }}
                            title={`Data: ${format(ativ.dataParsed, 'dd/MM/yyyy')}\nEtapas: ${combinedEtapas || 'Sem etapa'}`}
                          >
                            <span className="text-[8px] text-zinc-100 font-bold uppercase tracking-tighter truncate px-0.5 pointer-events-none">
                              {combinedEtapas ? combinedEtapas.substring(0, 3) : '-'}
                            </span>
                          </div>

                          {/* Projeto Block (Middle) */}
                          <div
                            className={cn(
                              "absolute top-[17px] h-5 rounded-[3px] shadow-sm flex flex-col items-center justify-center z-10 cursor-pointer transition-all hover:scale-105 border px-0.5 overflow-hidden",
                              isFolgaSemProjeto 
                                ? "bg-slate-500 border-slate-600 hover:bg-slate-400" 
                                : (hasMultiple ? "bg-orange-500 border-orange-600 hover:bg-orange-400" : "bg-blue-500 border-blue-600 hover:bg-blue-400")
                            )}
                            style={{ left: 1, width: dayWidth - 2 }}
                            title={`Data: ${format(ativ.dataParsed, 'dd/MM/yyyy')}\nProjetos: \n${ativ.atividades.map(a => '- ' + a.projeto).join('\n')}`}
                          >
                            {ativ.atividades.map((a, pIdx) => (
                               <span key={pIdx} className={cn(
                                 "text-white font-bold leading-tight tracking-tighter truncate w-full text-center",
                                 hasMultiple ? "text-[8px]" : "text-[9px]"
                               )}>
                                 {a.projeto.split('-').pop()?.trim() || a.projeto}
                               </span>
                            ))}
                          </div>
                          
                          {/* Tempo Deslocamento Block (Full width) */}
                          {tempoDeslocDia > 0 && (
                            <div 
                              className="absolute top-[38px] h-[12px] rounded-[2px] bg-orange-500 border-orange-600 shadow-sm flex items-center justify-center z-10 px-[1px] pointer-events-none"
                              style={{ left: 1, width: dayWidth - 2 }}
                              title="Tempo de Deslocamento do Dia"
                            >
                              <span className="text-[7px] text-white font-bold tracking-tighter truncate">
                                {tempoDeslocDia.toFixed(1)}h
                              </span>
                            </div>
                          )}

                          {/* Municipio Block */}
                          <div
                            className="absolute top-[51px] h-3 w-full flex items-center justify-center pointer-events-none"
                            style={{ left: 0 }}
                          >
                             <span className="text-[7px] text-muted-foreground font-medium uppercase tracking-tighter truncate px-0.5" title={combinedMun}>
                               {combinedMun.split('-').shift()?.trim() || combinedMun || '-'}
                             </span>
                          </div>

                          {/* Distance Bracket */}
                          {distanceKm !== null && bracketWidth > 0 && (
                            <div 
                               className="absolute z-20 border-b border-l border-r border-primary/40"
                               style={{
                                  top: 64,
                                  left: dayWidth / 2,
                                  width: bracketWidth,
                                  height: 6
                               }}
                            >
                               <div className="absolute top-[2px] w-full flex flex-col items-center pointer-events-none gap-[1px]">
                                 <span className="text-[8px] text-primary/80 font-bold bg-background px-0.5 leading-none z-10 relative">
                                   {distanceKm.toFixed(0)}km
                                 </span>
                                 {nextTempoDesloc > 0 && (
                                   <span className="text-[7px] text-orange-500 font-bold bg-background px-0.5 leading-none rounded-[2px] z-10 relative" title="Tempo previsto de deslocamento (Plan_Principal)">
                                     {nextTempoDesloc.toFixed(1)}h
                                   </span>
                                 )}
                               </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* NOVO CONTEINER: Totais do Período */}
            <div className="w-[360px] flex-shrink-0 flex flex-col relative bg-card border-l border-border shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">
              <div className="h-12 bg-secondary/95 backdrop-blur border-b border-border flex flex-col sticky top-0 z-20">
                <div className="h-5 flex items-center justify-center border-b border-border bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Totais do Período
                </div>
                <div className="flex-1 flex text-[9px] font-bold tracking-tighter divide-x divide-border">
                  <div className="flex-1 flex items-center justify-center">Planejado R$</div>
                  <div className="flex-1 flex items-center justify-center">Meta R$</div>
                  <div className="w-[45px] flex items-center justify-center">% Plan</div>
                  <div className="w-[55px] flex items-center justify-center text-center leading-none">Média<br/>Desloc.</div>
                  <div className="w-[85px] flex items-center justify-center text-center leading-none">Média<br/>Serviço</div>
                </div>
              </div>
              
              <div className="flex flex-col bg-background/50">
                {filteredData.map((row, i) => {
                  let planejado = 0;
                  let meta = 0;
                  let sumDesloc = 0;
                  let sumServico = 0;
                  let countDias = 0;
                  let countAbaixo8 = 0;
                  let countAcima10 = 0;
                  
                  if (dates.length > 0) {
                    const startD = dates[0];
                    const endD = dates[dates.length - 1];
                    row.atividadesDiarias.forEach(ativ => {
                      const ativDate = startOfDay(ativ.dataParsed);
                      if (ativDate >= startOfDay(startD) && ativDate <= startOfDay(endD)) {
                        let diaPlanejado = 0;
                        let diaMeta = 0;
                        let diaDesloc = 0;
                        let diaServico = 0;

                        ativ.atividades.forEach(a => {
                          diaPlanejado += a.valorPlanejado || 0;
                          diaMeta += a.valorMeta || 0;
                          diaDesloc = Math.max(diaDesloc, a.tempoDeslocamento || 0);
                          diaServico = Math.max(diaServico, a.tempoServico || 0);
                        });

                        planejado += diaPlanejado;
                        meta += diaMeta;
                        
                        // Considera apenas dias que tiveram alguma atividade para as médias
                        if (ativ.atividades.length > 0) {
                          sumDesloc += diaDesloc;
                          sumServico += diaServico;
                          countDias++;

                          if (diaServico > 0 && diaServico < 8) {
                            countAbaixo8++;
                          } else if (diaServico > 10) {
                            countAcima10++;
                          }
                        }
                      }
                    });
                  }
                  
                  const percPlanejado = meta > 0 ? (planejado / meta) * 100 : 0;
                  const mediaDesloc = countDias > 0 ? sumDesloc / countDias : 0;
                  const percDesloc = (mediaDesloc / 2) * 100;
                  const mediaServico = countDias > 0 ? sumServico / countDias : 0;
                  
                  let percColor = "bg-background text-foreground";
                  if (percPlanejado === 0) percColor = "bg-red-500/20 text-red-700 dark:text-red-400";
                  else if (percPlanejado <= 50) percColor = "bg-red-500/20 text-red-700 dark:text-red-400";
                  else if (percPlanejado <= 80) percColor = "bg-orange-500/20 text-orange-700 dark:text-orange-400";
                  else if (percPlanejado < 100) percColor = "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
                  else if (percPlanejado === 100) percColor = "bg-green-500/20 text-green-700 dark:text-green-400";
                  else percColor = "bg-blue-500/20 text-blue-700 dark:text-blue-400";

                  return (
                    <div key={i} className="h-[88px] border-b border-border flex divide-x divide-border hover:bg-secondary/30 transition-colors">
                      <div className="flex-1 flex items-center justify-center text-[10px] font-medium" title={formatCurrency(planejado)}>
                        {formatCurrency(planejado).replace('R$', '').trim()}
                      </div>
                      <div className="flex-1 flex items-center justify-center text-[10px] font-medium" title={formatCurrency(meta)}>
                        {formatCurrency(meta).replace('R$', '').trim()}
                      </div>
                      <div className={cn("w-[45px] flex items-center justify-center text-[10px] font-bold", percColor)} title={`% Planejado: ${percPlanejado.toFixed(1)}%`}>
                        {percPlanejado.toFixed(0)}%
                      </div>
                      <div className="w-[55px] flex flex-col items-center justify-center text-[10px] bg-orange-50/50 dark:bg-orange-950/20" title={`Média de Deslocamento\n% baseado no máximo de 2h`}>
                        <span className="font-bold text-orange-700 dark:text-orange-400">{mediaDesloc.toFixed(1)}h</span>
                        <span className={cn("text-[8px] font-medium mt-0.5 px-1 rounded-sm", percDesloc > 100 ? "bg-red-500/20 text-red-700" : "text-muted-foreground")}>
                          {percDesloc.toFixed(0)}%
                        </span>
                      </div>
                      <div className="w-[85px] flex flex-col items-center justify-center text-[10px] px-1 bg-blue-50/50 dark:bg-blue-950/20">
                        <span className={cn("font-bold", mediaServico < 8 || mediaServico > 10 ? "text-red-600" : "text-blue-700 dark:text-blue-400")} title="Média de Tempo de Serviço (Mín: 8h, Máx: 10h)">
                          {mediaServico.toFixed(1)}h
                        </span>
                        {(countAbaixo8 > 0 || countAcima10 > 0) && (
                          <div className="mt-1 flex flex-col items-center w-full" title={`Dias com menos de 8h: ${countAbaixo8}\nDias com mais de 10h: ${countAcima10}`}>
                            {countAbaixo8 > 0 && <span className="text-[8px] text-red-500 font-medium leading-none text-center truncate w-full">{countAbaixo8} dias &lt; 8h</span>}
                            {countAcima10 > 0 && <span className="text-[8px] text-orange-500 font-medium leading-none mt-[2px] text-center truncate w-full">{countAcima10} dias &gt; 10h</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <PlanejamentoEquipesMap data={filteredData} dates={dates} />

          </div>
        </div>
      </div>
    </div>
  );
};
