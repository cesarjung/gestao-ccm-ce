import { useState, useMemo } from 'react';
import { Filter, Calendar, RefreshCw, BarChart2, Hash, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { Toggle } from '@/components/ui/toggle';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';
import { useCumprimentoData } from '@/hooks/useCumprimentoData';
import { usePlanejamentoRaw, useSyncPlanejamento } from '@/hooks/usePlanejamentoRaw';
import { useBdMetasData } from '@/hooks/useBdMetasData';
import { useSessionState } from '@/hooks/useSessionState';
import { parse, startOfDay, endOfDay, isWithinInterval, differenceInDays, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SyncIndicator } from '@/components/SyncIndicator';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  LineChart,
  Line
} from 'recharts';

export const CumprimentoView = () => {
  const [selectedUnidadesIds, setSelectedUnidadesIds] = useSessionState<string[]>('filter_unidades_cumprimento', []);
  const [zoomLevel, setZoomLevel] = useSessionState<number>('filter_zoom_cumprimento', 1);
  const [unidadesDropdownOpen, setUnidadesDropdownOpen] = useState(false);
  const [draftUnidadesIds, setDraftUnidadesIds] = useState<string[]>(selectedUnidadesIds);
  const { mutate: syncPlanejamento, isPending: isSyncing } = useSyncPlanejamento();

  const { data, isLoading, isError, lastUpdated } = useCumprimentoData(selectedUnidadesIds);
  const { data: bdMetasData = [], isLoading: isBdMetasLoading } = useBdMetasData(selectedUnidadesIds);

  // Filtros locais (persistidos em sessão)
  const [selectedMeses, setSelectedMeses] = useSessionState<string[]>('filter_meses_cumprimento', []);
    
  const [filterStart, setFilterStart] = useSessionState<string>('filter_start_cumprimento', '');
  const [filterEnd, setFilterEnd] = useSessionState<string>('filter_end_cumprimento', '');
  
  const [selectedSupervisores, setSelectedSupervisores] = useSessionState<string[]>('filter_supervisores_cumprimento', []);
  const [supervisoresDropdownOpen, setSupervisoresDropdownOpen] = useState(false);
  
  const [selectedEquipes, setSelectedEquipes] = useSessionState<string[]>('filter_equipes_cumprimento', []);
  const [equipesDropdownOpen, setEquipesDropdownOpen] = useState(false);
  
  const [selectedProjetos, setSelectedProjetos] = useSessionState<string[]>('filter_projetos_cumprimento', []);
  
  // Toggle "Somente Disponíveis" (Coluna BB == 1)
  const [somenteDisponiveis, setSomenteDisponiveis] = useState(false);

  // Filtro "Tipo de Equipe"
  const [selectedTiposEquipe, setSelectedTiposEquipe] = useState<string[]>(['CONSTRUÇÃO', 'LINHA VIVA']);
  const [tiposEquipeDropdownOpen, setTiposEquipeDropdownOpen] = useState(false);

  // Mapear Equipe para TipoEquipe e Extrair Tipos Únicos da BD_Metas
  const { equipeToTipo, tiposEquipeUnicos } = useMemo(() => {
    const map = new Map<string, string>();
    const tipos = new Set<string>();
    
    bdMetasData.forEach(row => {
      map.set(row.equipe, row.tipoEquipe);
      tipos.add(row.tipoEquipe);
    });
    
    return {
      equipeToTipo: map,
      tiposEquipeUnicos: Array.from(tipos).sort()
    };
  }, [bdMetasData]);

  // Extrair opções únicas dos dados
  const { mesesUnicos, supervisoresUnicos, equipesUnicas, projetosUnicos } = useMemo(() => {
    const meses = new Set<string>();
    const supervisores = new Set<string>();
    const equipes = new Set<string>();
    const projetos = new Set<string>();

    data.forEach(row => {
      if (row.mesCurto) meses.add(row.mesCurto);
      if (row.supervisor) supervisores.add(row.supervisor);
      if (row.equipe) equipes.add(row.equipe);
      if (row.projeto) projetos.add(row.projeto);
    });

    const ORDER = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    return {
      mesesUnicos: Array.from(meses).sort((a, b) => {
        let iA = ORDER.indexOf(a);
        let iB = ORDER.indexOf(b);
        if (iA === -1) iA = 99;
        if (iB === -1) iB = 99;
        return iB - iA;
      }),
      supervisoresUnicos: Array.from(supervisores).sort(),
      equipesUnicas: Array.from(equipes).sort(),
      projetosUnicos: Array.from(projetos).sort(),
    };
  }, [data]);

  // Aplicar Filtros Locais
  const filteredData = useMemo(() => {
    return data.filter(row => {
      // Filtrar pelo Tipo de Equipe
      if (bdMetasData.length > 0 && selectedTiposEquipe.length > 0) {
        const tipoEquipe = equipeToTipo.get(row.equipe.trim().toUpperCase());
        if (!tipoEquipe || !selectedTiposEquipe.includes(tipoEquipe)) {
          return false;
        }
      }

      // Mês
      if (selectedMeses.length > 0 && !selectedMeses.includes(row.mesCurto)) return false;
      // Período
      if (filterStart || filterEnd) {
        let isWithin = true;
        if (filterStart) {
          const start = startOfDay(parse(filterStart, 'yyyy-MM-dd', new Date()));
          if (row.dataParsed < start) isWithin = false;
        }
        if (filterEnd) {
          const end = endOfDay(parse(filterEnd, 'yyyy-MM-dd', new Date()));
          if (row.dataParsed > end) isWithin = false;
        }
        if (!isWithin) return false;
      }
      // Supervisor
      if (selectedSupervisores.length > 0 && !selectedSupervisores.includes(row.supervisor)) return false;
      // Equipe
      if (selectedEquipes.length > 0 && !selectedEquipes.includes(row.equipe)) return false;
      // Projeto
      if (selectedProjetos.length > 0 && !selectedProjetos.includes(row.projeto)) return false;

      return true;
    });
  }, [data, selectedMeses, filterStart, filterEnd, selectedSupervisores, selectedEquipes, selectedProjetos, selectedTiposEquipe, equipeToTipo]);

  // Meses a serem exibidos nas tabelas e gráficos
  const mesesExibidos = useMemo(() => {
    const ORDER = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    if (selectedMeses.length > 0) {
      return [...selectedMeses].sort((a, b) => {
        let iA = ORDER.indexOf(a);
        let iB = ORDER.indexOf(b);
        if (iA === -1) iA = 99;
        if (iB === -1) iB = 99;
        return iB - iA;
      });
    } else {
      const meses = new Set<string>();
      filteredData.forEach(row => {
        if (row.mesCurto) meses.add(row.mesCurto);
      });
      return Array.from(meses).sort((a, b) => {
        let iA = ORDER.indexOf(a);
        let iB = ORDER.indexOf(b);
        if (iA === -1) iA = 99;
        if (iB === -1) iB = 99;
        return iB - iA;
      });
    }
  }, [selectedMeses, filteredData]);

  // Cálculos de Agrupamento
  const chartData = useMemo(() => {
    const agrupado: Record<string, any> = {};

    filteredData.forEach(row => {
      // Somente considera as linhas em que a coluna AM (Meta) seja maior que zero
      // Critério AM (valProdTurno > 0) removido conforme solicitado

      // Se "Somente Disponíveis" estiver ativo, exclui tudo que NÃO FOR 1 (100%) na coluna BB
      if (somenteDisponiveis && row.valDisponivel !== 1) return;

      const uNome = row.unidadeNome.replace('UNIDADE ', '');
      if (!agrupado[uNome]) {
        agrupado[uNome] = {
          name: uNome,
          // Totais globais da unidade para média geral e prod%
          sumAL: 0, sumAO: 0, countAL: 0, countAM: 0,
          sumAQ: 0, sumAMGlob: 0,
          meses: {} as Record<string, { sumAL: number, countAL: number, countAM: number, sumAQ: number, sumAM: number }>
        };
      }

      const g = agrupado[uNome];
      
      // Global
      if (row.valPlanejado !== 0) {
        g.sumAL += row.valPlanejado;
        g.sumAO += row.valRealizado;
      }
      if (row.valPlanejado > 0) g.countAL += 1;
      if (row.valProdTurno > 0) g.countAM += 1;
      
      g.sumAQ += row.valProgTurno;
      g.sumAMGlob += row.valProdTurno;

      // Por Mês
      if (!g.meses[row.mesCurto]) {
        g.meses[row.mesCurto] = { sumAL: 0, sumAO: 0, countAL: 0, countAM: 0, sumAQ: 0, sumAM: 0 };
      }
      const gm = g.meses[row.mesCurto];
      if (row.valPlanejado !== 0) {
        gm.sumAL += row.valPlanejado;
        gm.sumAO += row.valRealizado;
      }
      if (row.valPlanejado > 0) gm.countAL += 1;
      if (row.valProdTurno > 0) gm.countAM += 1;
      gm.sumAQ += row.valProgTurno;
      gm.sumAM += row.valProdTurno;
    });

    const resultadoFinal = Object.values(agrupado).map(u => {
      const item: any = { 
        name: u.name,
        _producaoPerc: u.sumAMGlob > 0 ? (u.sumAQ / u.sumAMGlob) * 100 : 0
      };

      // Média Geral da Unidade
      item._mediaGeral = u.sumAL > 0 ? (u.sumAO / u.sumAL) * 100 : 0;

      // Médias por mês (para o chart e tabela)
      mesesExibidos.forEach(m => {
        if (u.meses[m]) {
          item[m] = u.meses[m].sumAL > 0 ? Number(((u.meses[m].sumAO / u.meses[m].sumAL) * 100).toFixed(1)) : null;
          item[`${m}_prod`] = u.meses[m].sumAM > 0 ? Number(((u.meses[m].sumAQ / u.meses[m].sumAM) * 100).toFixed(1)) : 0;
        } else {
          item[m] = null;
          item[`${m}_prod`] = null;
        }
      });

      return item;
    });

    // Ordenar do maior para o menor cumprimento
    resultadoFinal.sort((a, b) => b._mediaGeral - a._mediaGeral);

    return resultadoFinal;
  }, [filteredData, somenteDisponiveis, mesesExibidos]);

  const globalChartData = useMemo(() => {
    const agrupado: Record<string, any> = {};

    data.forEach(row => {
      // Critério AM (valProdTurno > 0) removido conforme solicitado
      if (somenteDisponiveis && row.valDisponivel !== 1) return;

      const uNome = row.unidadeNome.replace('UNIDADE ', '');
      if (!agrupado[uNome]) {
        agrupado[uNome] = {
          name: uNome,
          meses: {} as Record<string, { sumAL: number, sumAO: number, sumAM: number, sumAQ: number }>
        };
      }

      const g = agrupado[uNome];
      const m = row.mesCurto;
      if (!g.meses[m]) g.meses[m] = { sumAL: 0, sumAO: 0, sumAM: 0, sumAQ: 0 };
      
      const gm = g.meses[m];
      if (row.valPlanejado !== 0) {
        gm.sumAL += row.valPlanejado;
        gm.sumAO += row.valRealizado;
      }
      gm.sumAM += row.valProdTurno;
      gm.sumAQ += row.valProgTurno;
    });

    const resultadoFinal = Object.values(agrupado).map(u => {
      let totalAO = 0;
      let totalAL = 0;
      const evolution = mesesExibidos.map(m => {
        if (u.meses[m]) {
          totalAO += u.meses[m].sumAO;
          totalAL += u.meses[m].sumAL;
          return {
            name: m,
            cumprimento: u.meses[m].sumAL > 0 ? Number(((u.meses[m].sumAO / u.meses[m].sumAL) * 100).toFixed(1)) : null,
            producao: u.meses[m].sumAM > 0 ? Number(((u.meses[m].sumAQ / u.meses[m].sumAM) * 100).toFixed(1)) : null
          };
        }
        return { name: m, cumprimento: null, producao: null };
      });
      const mediaGeral = totalAL > 0 ? (totalAO / totalAL) * 100 : 0;
      return { name: u.name, evolution, _mediaGeral: mediaGeral };
    });

    // Ordenar do maior para o menor cumprimento
    resultadoFinal.sort((a, b) => b._mediaGeral - a._mediaGeral);
    return resultadoFinal;
  }, [data, somenteDisponiveis, mesesExibidos]);

  const equipesChartData = useMemo(() => {
    const agrupado: Record<string, { name: string, sumAL: number, sumAO: number }> = {};

    filteredData.forEach(row => {
      const eNome = row.equipe?.trim();
      if (!eNome) return;
      if (!agrupado[eNome]) {
        agrupado[eNome] = { name: eNome, sumAL: 0, sumAO: 0 };
      }
      if (row.valPlanejado !== 0) {
        agrupado[eNome].sumAL += row.valPlanejado;
        agrupado[eNome].sumAO += row.valRealizado;
      }
    });

    const result = Object.values(agrupado).map(e => ({
      name: e.name,
      cumprimento: e.sumAL > 0 ? (e.sumAO / e.sumAL) * 100 : 0
    }));

    // Ordenar do maior para o menor cumprimento
    result.sort((a, b) => b.cumprimento - a.cumprimento);

    return result;
  }, [filteredData, somenteDisponiveis]);

  const totaisGlobais = useMemo(() => {
    let sumAL = 0;
    let sumAO = 0;
    
    filteredData.forEach(row => {
      if (somenteDisponiveis && row.valDisponivel !== 1) return;
      if (row.valPlanejado !== 0) {
        sumAL += row.valPlanejado;
        sumAO += row.valRealizado;
      }
    });

    const percentual = sumAL > 0 ? (sumAO / sumAL) * 100 : 0;

    return { sumAL, sumAO, percentual };
  }, [filteredData, somenteDisponiveis]);

  const inconsistencias = useMemo(() => {
    return filteredData
      .filter(row => row.valRealizado > 0 && row.valPlanejado === 0)
      .map(row => ({
        id: row.id,
        data: row.dataString || '',
        unidade: row.planilha || row.unidadeNome,
        equipe: row.equipe || '-',
        valor: row.valRealizado,
        acao: 'Corrigir valor planejado'
      }));
  }, [filteredData]);

  const COLORS = [
    'hsl(25, 95%, 50%)', // Laranja Principal (Primary)
    'hsl(0, 0%, 10%)',   // Preto (Foreground/Black)
    'hsl(0, 72%, 51%)',  // Vermelho (Destructive)
    'hsl(38, 92%, 50%)', // Amarelo/Âmbar (Warning)
    'hsl(30, 20%, 60%)', // Cinza Quente
    'hsl(25, 95%, 35%)', // Laranja Escuro
    'hsl(38, 92%, 35%)', // Âmbar Escuro
    'hsl(0, 0%, 45%)',   // Cinza Neutro
  ];

  const getGradualColor = (perc: number) => {
    let hue = 0;
    if (perc < 70) {
      hue = (perc / 70) * 35; 
    } else if (perc < 90) {
      hue = 35 + ((perc - 70) / 20) * 25; 
    } else if (perc <= 110) {
      hue = 60 + ((perc - 90) / 20) * 60;
    } else {
      hue = 210;
    }
    return `hsl(${hue}, 85%, 45%)`;
  };

  const getCellClassName = (perc: number | null) => {
    if (perc === null || perc === undefined) return 'bg-muted/30 text-muted-foreground';
    return 'text-white font-bold';
  };

  const getCellStyle = (perc: number | null): React.CSSProperties => {
    if (perc === null || perc === undefined) return {};
    return { backgroundColor: getGradualColor(perc) };
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col h-full w-full items-center justify-center bg-background">
        <div className="animate-spin text-primary mb-4"><RefreshCw className="w-8 h-8" /></div>
        <p>Carregando dados de Cumprimento Planejamento...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col h-full w-full items-center justify-center bg-background text-destructive">
        <p>Falha ao carregar os dados.</p>
        <Button onClick={() => refetch()} className="mt-4" variant="outline">Tentar Novamente</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-y-auto overflow-x-hidden custom-scrollbar relative">
      
      {/* HEADER COMPACTO */}
      <div className="flex flex-col gap-3 p-4 shrink-0 border-b border-border sticky top-0 z-10 bg-background w-full min-w-0">
        <div className="flex flex-row flex-nowrap items-end gap-4 overflow-x-auto custom-scrollbar w-full pb-2">
          <div className="shrink-0 mb-1">
            <h1 className="text-xl font-bold text-foreground mb-0.5 leading-none">Percentual Cumprimento Planejamento</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Módulo Cumprimento Planejamento</p>
          </div>
          
          <div className="w-px h-10 bg-border shrink-0"></div>

          {/* FILTROS */}
          <div className="flex flex-nowrap items-end gap-2 shrink-0">
            
            {/* Toggle Button */}
            <div className="flex flex-col justify-center mr-2">
              <Toggle 
                pressed={somenteDisponiveis} 
                onPressedChange={setSomenteDisponiveis}
                variant="outline"
                className={cn(
                  "h-10 px-3 border transition-colors", 
                  somenteDisponiveis ? "border-primary bg-primary/10 text-primary" : ""
                )}
                title="Considerar apenas linhas onde a coluna BB (Disponível) é igual a 1"
              >
                <Hash className="w-4 h-4 mr-2" />
                Somente Disponíveis
              </Toggle>
            </div>

            <div className="flex flex-col justify-center min-w-[100px]">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Unidade</span>
              <DropdownMenu 
                open={unidadesDropdownOpen} 
                onOpenChange={(open) => {
                  setUnidadesDropdownOpen(open);
                  if (!open) setSelectedUnidadesIds(draftUnidadesIds);
                  else setDraftUnidadesIds(selectedUnidadesIds);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-left font-normal text-xs h-10">
                    <span className="truncate">
                      {draftUnidadesIds.length === 0 
                        ? 'Unidades' 
                        : draftUnidadesIds.length === UNIDADES_PLANEJAMENTO.length
                          ? 'Unidades'
                          : draftUnidadesIds.length === 1 
                            ? UNIDADES_PLANEJAMENTO.find(u => u.id === draftUnidadesIds[0])?.nome 
                            : `${draftUnidadesIds.length} unid.`}
                    </span>
                    <Filter className="w-3 h-3 ml-2 opacity-50 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
            <div className="p-2 border-b border-border flex gap-2 sticky top-0 bg-popover z-10">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7" onClick={() => setDraftUnidadesIds(UNIDADES_PLANEJAMENTO.map(u => u.id))}>Selecionar todos</Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setDraftUnidadesIds([])}>Limpar</Button>
            </div>
                  {UNIDADES_PLANEJAMENTO.map(u => (
                    <DropdownMenuCheckboxItem key={u.id} checked={draftUnidadesIds.includes(u.id)} onCheckedChange={(checked) => {
                      if (checked) setDraftUnidadesIds([...draftUnidadesIds.filter(id => id !== u.id), u.id]);
                      else setDraftUnidadesIds(draftUnidadesIds.filter(id => id !== u.id));
                    }}>{u.nome}</DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-col justify-center min-w-[110px]">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Tipo Equipe</span>
              <DropdownMenu open={tiposEquipeDropdownOpen} onOpenChange={setTiposEquipeDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-left font-normal text-xs h-10">
                    <span className="truncate">{selectedTiposEquipe.length === 0 ? 'Todos' : `${selectedTiposEquipe.length} selec.`}</span>
                    <Filter className="w-3 h-3 ml-2 opacity-50 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 max-h-64 overflow-auto" align="start">
            <div className="p-2 border-b border-border flex gap-2 sticky top-0 bg-popover z-10">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedTiposEquipe(tiposEquipeUnicos)}>Selecionar todos</Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedTiposEquipe([])}>Limpar</Button>
            </div>
                  {tiposEquipeUnicos.map(t => (
                    <DropdownMenuCheckboxItem key={t} checked={selectedTiposEquipe.includes(t)} onCheckedChange={(checked) => {
                      if (checked) setSelectedTiposEquipe([...selectedTiposEquipe.filter(x => x !== t), t]);
                      else setSelectedTiposEquipe(selectedTiposEquipe.filter(x => x !== t));
                    }}>{t}</DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <FilterSelect label="Mês" options={mesesUnicos.map(m => ({ value: m, label: m }))} selectedValues={selectedMeses} onChange={setSelectedMeses} searchable={true} />

            <div className="flex flex-col justify-center min-w-[130px]">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex justify-between">Período
                {(filterStart || filterEnd) && <button onClick={() => { setFilterStart(''); setFilterEnd(''); }} className="text-foreground hover:underline ml-1">Limpar</button>}
              </span>
              <div className="flex items-center gap-1 border border-input bg-background rounded-md h-10 px-2 focus-within:ring-1 focus-within:ring-ring">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="bg-transparent text-xs outline-none w-[100px] text-foreground" title="Data Inicial" />
                <span className="text-muted-foreground text-xs shrink-0">-</span>
                <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="bg-transparent text-xs outline-none w-[100px] text-foreground" title="Data Final" />
              </div>
            </div>

            <div className="flex flex-col justify-center min-w-[100px]">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Supervisor</span>
              <DropdownMenu open={supervisoresDropdownOpen} onOpenChange={setSupervisoresDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-left font-normal text-xs h-10">
                    <span className="truncate">{selectedSupervisores.length === 0 ? 'Todos' : `${selectedSupervisores.length} selec.`}</span>
                    <Filter className="w-3 h-3 ml-2 opacity-50 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
            <div className="p-2 border-b border-border flex gap-2 sticky top-0 bg-popover z-10">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedSupervisores(supervisoresUnicos)}>Selecionar todos</Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedSupervisores([])}>Limpar</Button>
            </div>
                  {supervisoresUnicos.map(s => (
                    <DropdownMenuCheckboxItem key={s} checked={selectedSupervisores.includes(s)} onCheckedChange={(checked) => {
                      if (checked) setSelectedSupervisores([...selectedSupervisores.filter(x => x !== s), s]);
                      else setSelectedSupervisores(selectedSupervisores.filter(x => x !== s));
                    }}>{s}</DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="flex flex-col justify-center min-w-[100px]">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Equipe</span>
              <DropdownMenu open={equipesDropdownOpen} onOpenChange={setEquipesDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-left font-normal text-xs h-10">
                    <span className="truncate">{selectedEquipes.length === 0 ? 'Todas' : `${selectedEquipes.length} selec.`}</span>
                    <Filter className="w-3 h-3 ml-2 opacity-50 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 max-h-64 overflow-auto" align="start">
            <div className="p-2 border-b border-border flex gap-2 sticky top-0 bg-popover z-10">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedEquipes(equipesUnicas)}>Selecionar todos</Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedEquipes([])}>Limpar</Button>
            </div>
                  {equipesUnicas.map(e => (
                    <DropdownMenuCheckboxItem key={e} checked={selectedEquipes.includes(e)} onCheckedChange={(checked) => {
                      if (checked) setSelectedEquipes([...selectedEquipes.filter(x => x !== e), e]);
                      else setSelectedEquipes(selectedEquipes.filter(x => x !== e));
                    }}>{e}</DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <FilterSelect label="Projeto" options={projetosUnicos.map(p => ({ value: p, label: p }))} selectedValues={selectedProjetos} onChange={setSelectedProjetos} searchable={true} />

            <div className="flex items-center gap-1 bg-secondary/30 rounded-md border border-border px-1 h-10 ml-2 shrink-0">
               <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))} title="Diminuir Zoom">
                 <ZoomOut className="w-4 h-4 text-muted-foreground" />
               </Button>
               <span className="text-xs font-bold w-10 text-center text-muted-foreground" title="Nível de Zoom">{(zoomLevel * 100).toFixed(0)}%</span>
               <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoomLevel(z => Math.min(2.0, z + 0.1))} title="Aumentar Zoom">
                 <ZoomIn className="w-4 h-4 text-muted-foreground" />
               </Button>
            </div>

            <div className="flex items-center ml-2">
              <SyncIndicator />
            </div>
          </div>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL (Gráfico + Tabela) */}
      <div style={{ zoom: zoomLevel } as React.CSSProperties} className="flex flex-col gap-6 p-4 pb-8">
        
        {/* Gráfico */}
        <div className="w-full h-[320px] shrink-0 border border-border rounded-xl bg-card p-4 shadow-sm flex flex-col">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-foreground">Média por Unidade</h2>
            <p className="text-xs text-muted-foreground">Evolução mensal</p>
          </div>
          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} domain={[0, 'dataMax + 1']} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                {mesesExibidos.map((m, i) => (
                  <Bar key={m} dataKey={m} name={m} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={30}>
                    <LabelList dataKey={m} position="top" fill="currentColor" fontSize={11} formatter={(v: any) => v > 0 ? `${v}%` : ''} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabela */}
        <div className="w-full shrink-0 border border-border rounded-xl bg-card shadow-sm flex flex-col mb-4 overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <h2 className="text-lg font-bold text-foreground">Indicadores de Produção</h2>
            <p className="text-xs text-muted-foreground">Detalhamento por Unidade</p>
          </div>
          
          <div className="w-full overflow-x-auto p-4">
            <table className="w-auto text-sm text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 w-[250px] font-bold text-muted-foreground border-b border-border bg-muted/10 rounded-tl-lg">Unidade</th>
                  <th className="px-3 py-2 w-[120px] font-bold text-muted-foreground border-b border-border bg-muted/10 text-center">Prod %</th>
                  {mesesExibidos.map(m => [
                    <th key={m} className="px-2 py-2 font-bold text-muted-foreground border-b border-border bg-muted/10 text-center">{m}</th>,
                    <th key={`${m}_prod`} className="px-1 py-2 w-[80px] font-bold text-muted-foreground border-b border-border bg-muted/10 text-center text-[10px]">Prod {m}</th>
                  ])}
                  <th className="px-2 py-2 w-[100px] font-bold text-muted-foreground border-b border-border bg-muted/10 text-center rounded-tr-lg">Média</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.name}</td>
                    
                    {/* Prod % */}
                    <td className="px-3 py-2.5 text-center relative min-w-[100px]">
                      <div className="absolute inset-y-1.5 left-2 right-2 bg-muted/50 rounded-sm overflow-hidden border border-border/50">
                        <div 
                          className="h-full transition-all" 
                          style={{ width: `${Math.min(row._producaoPerc, 100)}%`, backgroundColor: getGradualColor(row._producaoPerc) }}
                        ></div>
                      </div>
                      <span className="relative z-10 text-xs font-bold text-white">{row._producaoPerc.toFixed(1)}%</span>
                    </td>

                    {/* Meses */}
                    {mesesExibidos.map(m => {
                      const val = row[m];
                      const prodVal = row[`${m}_prod`];
                      return [
                        <td key={m} className="p-0 border border-background">
                          <div 
                            className={cn("w-full max-w-[64px] mx-auto h-full min-h-[32px] flex items-center justify-center text-xs rounded-sm", getCellClassName(val))}
                            style={getCellStyle(val)}
                          >
                            {val !== null && val !== undefined ? val.toFixed(1) + '%' : '-'}
                          </div>
                        </td>,
                        <td key={`${m}_prod`} className="px-1 py-2 text-center relative min-w-[70px]">
                          {prodVal !== null && prodVal !== undefined ? (
                            <>
                              <div className="absolute inset-y-1.5 left-1 right-1 bg-muted/50 rounded-sm overflow-hidden border border-border/50">
                                <div 
                                  className="h-full transition-all" 
                                  style={{ width: `${Math.min(prodVal, 100)}%`, backgroundColor: getGradualColor(prodVal) }}
                                ></div>
                              </div>
                              <span className="relative z-10 text-[10px] font-bold text-white">{prodVal.toFixed(1)}%</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      ];
                    })}

                    <td className="p-0 border border-background">
                      <div 
                        className={cn("w-full max-w-[64px] mx-auto h-full min-h-[32px] flex items-center justify-center text-xs rounded-sm", getCellClassName(row._mediaGeral))}
                        style={getCellStyle(row._mediaGeral)}
                      >
                        {row._mediaGeral !== null ? row._mediaGeral.toFixed(1) + '%' : '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Legenda de Cores */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-blue-500"></div>
                <span>≥ 110%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-green-500"></div>
                <span>90% - 109%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-yellow-500"></div>
                <span>70% - 89%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-red-500"></div>
                <span>&lt; 70%</span>
              </div>
            </div>

          </div>
        </div>

        {/* Gráfico de Equipes, Inconsistências e Resumo */}
        <div className="w-full shrink-0 border border-border rounded-xl bg-card p-4 shadow-sm flex flex-col xl:flex-row gap-6 mb-4">
          
          <div className="flex-1 flex flex-col min-w-0">
            <div className="mb-4 text-center">
              <h2 className="text-lg font-bold text-foreground">Equipes</h2>
            </div>
            <div className="flex-1 w-full min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={equipesChartData} margin={{ top: 20, right: 10, left: -20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(val) => `${val}%`} />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(val: number) => [`${val.toFixed(1)}%`, 'Cumprimento']}
                  />
                  <Bar 
                    dataKey="cumprimento" 
                    fill="hsl(0, 0%, 10%)" 
                    radius={[2, 2, 0, 0]} 
                    background={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  >
                    <LabelList 
                      dataKey="cumprimento" 
                      position="center" 
                      content={(props: any) => {
                        const { x, y, width, height, value } = props;
                        if (!value) return null;
                        // Se a barra for muito baixa, coloca a label acima dela
                        const labelY = height < 20 ? y - 10 : y + height / 2;
                        return (
                          <g>
                            <rect x={x + width / 2 - 18} y={labelY - 8} width="36" height="16" fill="white" fillOpacity="0.4" rx="4" />
                            <text x={x + width / 2} y={labelY + 3} fill="white" fontSize="9" fontWeight="bold" textAnchor="middle">{`${value.toFixed(0)}%`}</text>
                          </g>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Resumo Lateral */}
          <div className="w-full xl:w-[220px] flex flex-col justify-center shrink-0 border-t xl:border-t-0 xl:border-l border-border pt-4 xl:pt-0 xl:pl-6">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-foreground">Cumprimento no Período</h3>
            </div>
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-10 bg-muted-foreground/30 rounded-full"></div>
                <div>
                  <p className="text-lg font-bold text-foreground leading-tight">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totaisGlobais.sumAL)}
                  </p>
                  <p className="text-xs text-muted-foreground">Valor Planejado</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-10 bg-muted-foreground/30 rounded-full"></div>
                <div>
                  <p className="text-lg font-bold text-foreground leading-tight">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totaisGlobais.sumAO)}
                  </p>
                  <p className="text-xs text-muted-foreground">Valor Realizado</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-10 bg-muted-foreground/30 rounded-full"></div>
                <div>
                  <p className="text-lg font-bold text-foreground leading-tight">
                    {totaisGlobais.percentual.toFixed(2).replace('.', ',')}%
                  </p>
                  <p className="text-xs text-muted-foreground">% Concluído</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabela de Inconsistências */}
          {inconsistencias.length > 0 && (
            <div className="w-full xl:w-[450px] flex flex-col shrink-0 border-t xl:border-t-0 xl:border-l border-border pt-4 xl:pt-0 xl:pl-6">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-destructive">Inconsistências ({inconsistencias.length})</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Realizado com Planejado zerado</p>
              </div>
              <div className="flex-1 max-h-[300px] overflow-auto border border-border rounded-md custom-scrollbar">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 sticky top-0 shadow-sm">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold text-muted-foreground">Data</th>
                      <th className="px-2 py-1.5 font-semibold text-muted-foreground">Unidade</th>
                      <th className="px-2 py-1.5 font-semibold text-muted-foreground">Equipe</th>
                      <th className="px-2 py-1.5 font-semibold text-muted-foreground">Valor</th>
                      <th className="px-2 py-1.5 font-semibold text-destructive">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inconsistencias.map(inc => (
                      <tr key={inc.id} className="border-t border-border/50 hover:bg-muted/30">
                        <td className="px-2 py-1.5 whitespace-nowrap text-[10px] font-medium text-muted-foreground">{inc.data}</td>
                        <td className="px-2 py-1.5 font-medium truncate max-w-[100px]" title={inc.unidade}>{inc.unidade}</td>
                        <td className="px-2 py-1.5 font-medium truncate max-w-[100px]" title={inc.equipe}>{inc.equipe}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-[10px] font-medium text-foreground">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(inc.valor)}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-destructive font-bold">{inc.acao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* SMALL MULTIPLES - Evolução Global */}
        <div className="w-full shrink-0 border border-border rounded-xl bg-card shadow-sm flex flex-col mb-4 overflow-hidden">
          <div className="p-4 border-b border-border bg-destructive">
            <h2 className="text-lg font-bold text-white">Evolução Global por Unidade</h2>
            <p className="text-xs text-white/80">Comparativo de Cumprimento e Produção</p>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
              {globalChartData.map((unidade) => (
                <div key={unidade.name} className="border border-border/50 rounded-lg p-3 bg-muted/10">
                  <h3 className="text-sm font-bold text-center mb-2 text-foreground">{unidade.name}</h3>
                  <div className="h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={unidade.evolution} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, 150]} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        />
                        <Line type="monotone" dataKey="cumprimento" name="Cumprimento" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                        <Line type="monotone" dataKey="producao" name="Produção" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
