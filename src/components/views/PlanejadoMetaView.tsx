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
import { usePlanejadoMetaData } from '@/hooks/usePlanejadoMetaData';
import { usePlanejamentoRaw, useSyncPlanejamento } from '@/hooks/usePlanejamentoRaw';
import { useBdMetasData } from '@/hooks/useBdMetasData';
import { useSessionState } from '@/hooks/useSessionState';
import { useReprogramadasData } from '@/hooks/useReprogramadasData';
import { parse, startOfDay, endOfDay, isWithinInterval, addDays, subDays, differenceInDays } from 'date-fns';
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
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export const PlanejadoMetaView = () => {
  const [selectedUnidadesIds, setSelectedUnidadesIds] = useSessionState<string[]>('filter_unidades_planejadometa', []);
  const [zoomLevel, setZoomLevel] = useSessionState<number>('filter_zoom_planejadometa', 1);
  const [unidadesDropdownOpen, setUnidadesDropdownOpen] = useState(false);
  const [draftUnidadesIds, setDraftUnidadesIds] = useState<string[]>(selectedUnidadesIds);
  const { mutate: syncPlanejamento, isPending: isSyncing } = useSyncPlanejamento();

  const { data, isLoading, isError, lastUpdated } = usePlanejadoMetaData(selectedUnidadesIds);
  const { data: bdMetasData = [], isLoading: isBdMetasLoading } = useBdMetasData(selectedUnidadesIds);
  const { data: reprogData = [], isLoading: isReprogLoading } = useReprogramadasData(selectedUnidadesIds);

  // Filtros locais (persistidos em sessão)
  const [selectedMeses, setSelectedMeses] = useSessionState<string[]>('filter_meses_planejadometa', []);
    
  const [filterStart, setFilterStart] = useSessionState<string>('filter_start_planejadometa', '');
  const [filterEnd, setFilterEnd] = useSessionState<string>('filter_end_planejadometa', '');
  
  const [selectedSupervisores, setSelectedSupervisores] = useSessionState<string[]>('filter_supervisores_planejadometa', []);
  const [supervisoresDropdownOpen, setSupervisoresDropdownOpen] = useState(false);
  
  const [selectedEquipes, setSelectedEquipes] = useSessionState<string[]>('filter_equipes_planejadometa', []);
  const [equipesDropdownOpen, setEquipesDropdownOpen] = useState(false);
  
  const [selectedProjetos, setSelectedProjetos] = useSessionState<string[]>('filter_projetos_planejadometa', []);
  
  // Toggle "Somente Disponíveis" (Coluna BB == 1)
  const [somenteDisponiveis, setSomenteDisponiveis] = useState(false);

  // Toggle "Apenas dias com meta" (Coluna AM > 0)
  const [somenteDiasComMeta, setSomenteDiasComMeta] = useState(false);

  // Toggle "Base Metas"
  const [isBaseMetas, setIsBaseMetas] = useState(false);

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

  // Extrair opções únicas dos dados (Plan_Principal)
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

  // Cálculo da Meta global via BD_Metas quando Base Metas ativo
  const metaPorUnidadeBdMetas = useMemo(() => {
    const map = new Map<string, { total: number, porMes: Record<string, number> }>();
    
    if (!isBaseMetas) return map;

    bdMetasData.forEach(row => {
      if (selectedTiposEquipe.length > 0 && !selectedTiposEquipe.includes(row.tipoEquipe)) return;
      if (selectedMeses.length > 0 && !selectedMeses.includes(row.mesCurto)) return;
      if (filterStart) {
        const start = startOfDay(parse(filterStart, 'yyyy-MM-dd', new Date()));
        if (row.dataParsed < start) return;
      }
      if (filterEnd) {
        const end = endOfDay(parse(filterEnd, 'yyyy-MM-dd', new Date()));
        if (row.dataParsed > end) return;
      }

      const uNome = row.unidadeNome.replace('UNIDADE ', '').trim().toUpperCase();
      if (!map.has(uNome)) {
        map.set(uNome, { total: 0, porMes: {} });
      }
      const g = map.get(uNome)!;
      g.total += row.valorMeta;
      
      if (!g.porMes[row.mesCurto]) g.porMes[row.mesCurto] = 0;
      g.porMes[row.mesCurto] += row.valorMeta;
    });

    return map;
  }, [bdMetasData, isBaseMetas, selectedTiposEquipe, selectedMeses, filterStart, filterEnd]);

  // Cálculos de Agrupamento
  const chartData = useMemo(() => {
    const agrupado: Record<string, any> = {};

    filteredData.forEach(row => {
      if (somenteDiasComMeta && row.valProdTurno <= 0) return;

      // Se "Somente Disponíveis" estiver ativo, exclui tudo que NÃO FOR 1 (100%) na coluna BB
      if (somenteDisponiveis && row.valDisponivel !== 1) return;

      const uNome = row.unidadeNome.replace('UNIDADE ', '');
      if (!agrupado[uNome]) {
        agrupado[uNome] = {
          name: uNome,
          // Totais globais da unidade para média geral e prod%
          sumU: 0, countU: 0, countAM: 0,
          sumAQ: 0, sumAMGlob: 0,
          sumUMisto: 0,
          meses: {} as Record<string, { sumU: number, countU: number, countAM: number, sumAQ: number, sumAM: number, sumUMisto: number }>
        };
      }

      const g = agrupado[uNome];
      
      // Global
      g.sumU += row.valPlanejado;
      g.sumUMisto += row.valPlanejadoMisto;
      if (row.valPlanejado > 0) g.countU += 1;
      if (row.valProdTurno > 0) g.countAM += 1;
      
      g.sumAQ += row.valProgTurno;
      g.sumAMGlob += row.valProdTurno;

      // Por Mês
      if (!g.meses[row.mesCurto]) {
        g.meses[row.mesCurto] = { sumU: 0, countU: 0, countAM: 0, sumAQ: 0, sumAM: 0, sumUMisto: 0 };
      }
      const gm = g.meses[row.mesCurto];
      gm.sumU += row.valPlanejado;
      gm.sumUMisto += row.valPlanejadoMisto;
      if (row.valPlanejado > 0) gm.countU += 1;
      if (row.valProdTurno > 0) gm.countAM += 1;
      gm.sumAQ += row.valProgTurno;
      if (!isBaseMetas) gm.sumAM += row.valProdTurno;
    });

    // Sobrescrever a meta (AM) se Base Metas estiver ativado
    if (isBaseMetas) {
      Object.keys(agrupado).forEach(uNome => {
        const base = metaPorUnidadeBdMetas.get(uNome.trim().toUpperCase());
        if (base) {
          agrupado[uNome].sumAMGlob = base.total;
          Object.keys(agrupado[uNome].meses).forEach(m => {
             agrupado[uNome].meses[m].sumAM = base.porMes[m] || 0;
          });
        } else {
          agrupado[uNome].sumAMGlob = 0;
          Object.keys(agrupado[uNome].meses).forEach(m => {
             agrupado[uNome].meses[m].sumAM = 0;
          });
        }
      });
    }

    const resultadoFinal = Object.values(agrupado).map(u => {
      const item: any = { 
        name: u.name,
        _producaoPerc: u.sumAMGlob > 0 ? (u.sumAQ / u.sumAMGlob) * 100 : 0,
        vlrPlanejado: u.sumU,
        vlrProduzido: u.sumAQ,
        vlrMeta: u.sumAMGlob,
        vlrPlanejadoMisto: u.sumUMisto
      };

      // Média Geral da Unidade
      item._mediaGeral = u.sumAMGlob > 0 ? (u.sumU / u.sumAMGlob) * 100 : 0;
      item._mediaMista = u.sumAMGlob > 0 ? (u.sumUMisto / u.sumAMGlob) * 100 : 0;
      item._producaoPerc = u.sumAMGlob > 0 ? (Object.values(u.meses).reduce((acc, curr) => acc + curr.sumAQ, 0) / u.sumAMGlob) * 100 : 0;

      // Médias por mês (para o chart e tabela)
      mesesExibidos.forEach(m => {
        if (u.meses[m] && u.meses[m].sumAM > 0) {
          item[m] = Number(((u.meses[m].sumU / u.meses[m].sumAM) * 100).toFixed(1));
          item[`${m}_prod`] = Number(((u.meses[m].sumAQ / u.meses[m].sumAM) * 100).toFixed(1));
          item[`${m}_mista`] = Number(((u.meses[m].sumUMisto / u.meses[m].sumAM) * 100).toFixed(1));
        } else {
          item[m] = null;
          item[`${m}_prod`] = null;
          item[`${m}_mista`] = null;
        }
      });

      return item;
    });

    // Ordenar do maior pro menor pela Produção
    resultadoFinal.sort((a, b) => b._producaoPerc - a._producaoPerc);

    return resultadoFinal;
  }, [filteredData, mesesExibidos, isBaseMetas, metaPorUnidadeBdMetas]);

  // Totais Globais para o Painel de Resumo
  const totals = useMemo(() => {
    let totalMeta = 0;
    let totalPlanejado = 0;
    let totalProduzido = 0;

    filteredData.forEach(row => {
      if (somenteDiasComMeta && row.valProdTurno <= 0) return;
      if (somenteDisponiveis && row.valDisponivel !== 1) return;

      totalPlanejado += row.valPlanejado;
      totalProduzido += row.valProgTurno;
      if (!isBaseMetas) totalMeta += row.valProdTurno;
    });

    if (isBaseMetas) {
      metaPorUnidadeBdMetas.forEach(val => totalMeta += val.total);
    }

    const percPlanejadoMeta = totalMeta > 0 ? (totalPlanejado / totalMeta) * 100 : 0;

    return { totalMeta, totalPlanejado, totalProduzido, desvio: totalPlanejado - totalMeta, percPlanejadoMeta };
  }, [filteredData, somenteDiasComMeta, somenteDisponiveis, isBaseMetas, metaPorUnidadeBdMetas]);

  // Cálculos do Gráfico de Pareto de Reprogramadas
  const paretoData = useMemo(() => {
    const filteredReprog = reprogData.filter(row => {
      if (bdMetasData.length > 0 && selectedTiposEquipe.length > 0) {
        const tipoEquipe = equipeToTipo.get(row.equipe.trim().toUpperCase());
        if (!tipoEquipe || !selectedTiposEquipe.includes(tipoEquipe)) {
          return false;
        }
      }
      if (selectedMeses.length > 0 && !selectedMeses.includes(row.mesCurto)) return false;
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
      if (selectedEquipes.length > 0 && !selectedEquipes.includes(row.equipe)) return false;
      if (selectedProjetos.length > 0 && !selectedProjetos.includes(row.projeto)) return false;

      return true;
    });

    const prodMap = new Map<string, number>();
    filteredData.forEach(r => {
      if (r.valProgTurno > 0) {
        const k = `${r.dataParsed.getTime()}|${r.equipe.trim().toUpperCase()}`;
        prodMap.set(k, (prodMap.get(k) || 0) + r.valProgTurno);
      }
    });

    const map = new Map<string, { motivo: string; count: number; planejado: number; produzido: number; seenProdKeys: Set<string> }>();

    filteredReprog.forEach(r => {
      const mRaw = r.motivo ? r.motivo.toUpperCase() : 'NÃO INFORMADO';
      const m = mRaw.includes('|') ? mRaw.split('|')[0].trim() : mRaw.trim();
      if (!map.has(m)) {
        map.set(m, { motivo: m, count: 0, planejado: 0, produzido: 0, seenProdKeys: new Set() });
      }

      const g = map.get(m)!;
      g.count += 1;
      g.planejado += r.valPlanejado;

      const prodKey = `${r.dataParsed.getTime()}|${r.equipe.trim().toUpperCase()}`;
      if (!g.seenProdKeys.has(prodKey)) {
        g.seenProdKeys.add(prodKey);
        g.produzido += (prodMap.get(prodKey) || 0);
      }
    });

    const arr = Array.from(map.values()).map(x => ({
      motivo: x.motivo,
      count: x.count,
      planejado: x.planejado,
      produzido: x.produzido
    }));

    arr.sort((a, b) => b.planejado - a.planejado);

    return arr;
  }, [reprogData, filteredData, selectedTiposEquipe, selectedMeses, filterStart, filterEnd, selectedEquipes, selectedProjetos, equipeToTipo, bdMetasData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-lg">
          <p className="font-bold mb-2">{label}</p>
          
          <div className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
              <span className="text-sm">Produção: <strong>{data._producaoPerc.toFixed(0)}%</strong></span>
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
              <span className="text-sm">Planejado: <strong>{data._mediaGeral.toFixed(0)}%</strong></span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mt-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#000000]" />
              <span className="text-sm">Plan. Original: <strong>{data._mediaMista.toFixed(0)}%</strong></span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const COLORS = [
    'hsl(25, 95%, 50%)',
    'hsl(0, 0%, 10%)',
    'hsl(0, 72%, 51%)',
    'hsl(38, 92%, 50%)',
    'hsl(30, 20%, 60%)',
    'hsl(25, 95%, 35%)',
    'hsl(38, 92%, 35%)',
    'hsl(0, 0%, 45%)',
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

  if (isLoading || isBdMetasLoading) {
    return (
      <div className="flex-1 flex flex-col h-full w-full items-center justify-center bg-background">
        <div className="animate-spin text-primary mb-4"><RefreshCw className="w-8 h-8" /></div>
        <p>Carregando dados de Planejado x Meta...</p>
        {isBdMetasLoading && <p className="text-xs text-muted-foreground mt-2">Sincronizando Base Metas...</p>}
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
      
      <div className="flex flex-col gap-3 p-4 shrink-0 border-b border-border sticky top-0 z-10 bg-background w-full min-w-0">
        <div className="flex flex-row flex-nowrap items-end gap-4 overflow-x-auto custom-scrollbar w-full pb-2">
          <div className="shrink-0 mb-1">
            <h1 className="text-xl font-bold text-foreground mb-0.5 leading-none">Percentual Planejado x Meta</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Módulo Planejado x Meta</p>
          </div>
          
          <div className="w-px h-10 bg-border shrink-0"></div>

          <div className="flex flex-nowrap items-end gap-2 shrink-0">
            
            <div className="flex flex-col justify-center gap-1.5 mr-2">
              <Toggle 
                pressed={somenteDiasComMeta} 
                onPressedChange={setSomenteDiasComMeta}
                variant="outline"
                size="sm"
                className={cn(
                  "h-7 px-2 text-[10px] border transition-colors", 
                  somenteDiasComMeta ? "border-primary bg-primary/10 text-primary" : ""
                )}
                title="Desconsiderar linhas onde a coluna AM (Meta) estiver zerada"
              >
                <Hash className="w-3 h-3 mr-1.5" />
                Apenas dias c/ meta
              </Toggle>

              <Toggle 
                pressed={somenteDisponiveis} 
                onPressedChange={setSomenteDisponiveis}
                variant="outline"
                size="sm"
                className={cn(
                  "h-7 px-2 text-[10px] border transition-colors", 
                  somenteDisponiveis ? "border-primary bg-primary/10 text-primary" : ""
                )}
                title="Considerar apenas linhas onde a coluna BB (Disponível) é igual a 1"
              >
                <Hash className="w-3 h-3 mr-1.5" />
                Somente Disponíveis
              </Toggle>
            </div>

            <div className="flex flex-col justify-center mr-2">
              <Toggle 
                pressed={isBaseMetas} 
                onPressedChange={setIsBaseMetas}
                variant="outline"
                className={cn(
                  "h-8 px-3 border transition-colors text-[11px]", 
                  isBaseMetas ? "border-primary bg-primary/10 text-primary" : ""
                )}
                title="Usar meta mensal acumulada da Base Metas"
              >
                <BarChart2 className="w-4 h-4 mr-2" />
                Base Metas
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
                  <Button variant="outline" className="w-full justify-between text-left font-normal text-[11px] h-8">
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
                  <Button variant="outline" className="w-full justify-between text-left font-normal text-[11px] h-8">
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
              <div className="flex items-center gap-1 border border-input bg-background rounded-md h-8 px-2 focus-within:ring-1 focus-within:ring-ring">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="bg-transparent text-[11px] outline-none w-[90px] text-foreground" title="Data Inicial" />
                <span className="text-muted-foreground text-[11px] shrink-0">-</span>
                <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="bg-transparent text-[11px] outline-none w-[90px] text-foreground" title="Data Final" />
              </div>
            </div>

            <div className="flex flex-col justify-center min-w-[100px]">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Supervisor</span>
              <DropdownMenu open={supervisoresDropdownOpen} onOpenChange={setSupervisoresDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-left font-normal text-[11px] h-8">
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
                  <Button variant="outline" className="w-full justify-between text-left font-normal text-[11px] h-8">
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

            <div className="flex items-center gap-1 bg-secondary/30 rounded-md border border-border px-1 h-8 ml-2 shrink-0">
               <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))} title="Diminuir Zoom">
                 <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
               </Button>
               <span className="text-[10px] font-bold w-8 text-center text-muted-foreground" title="Nível de Zoom">{(zoomLevel * 100).toFixed(0)}%</span>
               <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoomLevel(z => Math.min(2.0, z + 0.1))} title="Aumentar Zoom">
                 <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
               </Button>
            </div>

            <div className="flex items-center ml-2">
              <SyncIndicator />
            </div>
          </div>
        </div>
      </div>

      <div style={{ zoom: zoomLevel } as React.CSSProperties} className="flex flex-col gap-6 p-4 pb-8">
        
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
                  <Bar key={m} dataKey={m} name={m} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={25}>
                    <LabelList dataKey={m} position="top" fill="currentColor" fontSize={10} formatter={(v: any) => v || ''} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

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
                    <th key={`${m}_prod`} className="px-1 py-2 w-[80px] font-bold text-muted-foreground border-b border-border bg-muted/10 text-center text-[10px]">Plan {m}</th>
                  ])}
                  <th className="px-2 py-2 w-[100px] font-bold text-muted-foreground border-b border-border bg-muted/10 text-center rounded-tr-lg">Média</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.name}</td>
                    
                    <td className="px-3 py-2.5 text-center relative min-w-[100px]">
                      <div className="absolute inset-y-1.5 left-2 right-2 bg-muted/50 rounded-sm overflow-hidden border border-border/50">
                        <div 
                          className="h-full transition-all" 
                          style={{ width: `${Math.min(row._producaoPerc, 100)}%`, backgroundColor: getGradualColor(row._producaoPerc) }}
                        ></div>
                      </div>
                      <span className="relative z-10 text-xs font-bold text-white">{row._producaoPerc.toFixed(1)}%</span>
                    </td>

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

        {/* GRÁFICO PLANEJADO X META e RESUMO */}
        <div className="w-full shrink-0 flex flex-col md:flex-row gap-4 mb-4">
          
          {/* Gráfico */}
          <div className="flex-1 border border-border rounded-xl bg-card shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <h2 className="text-lg font-bold text-foreground">Visão Global Planejado x Meta</h2>
              <p className="text-xs text-muted-foreground">Desempenho por Unidade (Produção e Planejado sobre a Meta)</p>
            </div>
            
            <div className="p-6 h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 30, right: 30, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 'bold' }} 
                    interval={0}
                    tickFormatter={(v) => v === 'VITORIA DA CONQUISTA' ? 'V. DA CONQUISTA' : v === 'BOM JESUS DA LAPA' ? 'B. J. DA LAPA' : v}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11 }} 
                    domain={[0, 120]} 
                    ticks={[0, 20, 40, 60, 80, 100, 120]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '20px' }} />
                  
                  <Bar 
                    dataKey="_producaoPerc" 
                    name="Produção (%)" 
                    fill="#ef4444" 
                    radius={[4, 4, 0, 0]} 
                    barSize={50}
                    background={{ fill: 'hsl(var(--muted))', radius: [4, 4, 0, 0] }}
                  >
                    <LabelList 
                      dataKey="_producaoPerc" 
                      position="center" 
                      fill="#ffffff" 
                      fontSize={12} 
                      fontWeight="bold" 
                      formatter={(val: number) => val > 0 ? `${val.toFixed(0)}%` : ''} 
                    />
                  </Bar>
                  
                  <Line 
                    type="monotone" 
                    dataKey="_mediaGeral" 
                    name="Planejado (%)" 
                    stroke="#f59e0b" 
                    strokeWidth={3} 
                    dot={{ r: 5, fill: '#f59e0b', strokeWidth: 2 }} 
                    activeDot={{ r: 7 }} 
                  >
                    <LabelList 
                      dataKey="_mediaGeral" 
                      position="top" 
                      offset={10}
                      fill="#d97706" 
                      fontSize={12} 
                      fontWeight="bold" 
                      formatter={(val: number) => val > 0 ? `${val.toFixed(0)}%` : ''} 
                      style={{ backgroundColor: 'rgba(255,255,255,0.8)', padding: '2px 4px', borderRadius: '4px' }}
                    />
                  </Line>

                  <Line 
                    type="monotone" 
                    dataKey="_mediaMista" 
                    name="Planejado Original (%)" 
                    stroke="#000000" 
                    strokeWidth={3} 
                    dot={{ r: 5, fill: '#000000', strokeWidth: 2 }} 
                    activeDot={{ r: 7 }} 
                  >
                    <LabelList 
                      dataKey="_mediaMista" 
                      position="bottom" 
                      offset={10}
                      fill="#000000" 
                      fontSize={12} 
                      fontWeight="bold" 
                      formatter={(val: number) => val > 0 ? `${val.toFixed(0)}%` : ''} 
                      style={{ backgroundColor: 'rgba(255,255,255,0.8)', padding: '2px 4px', borderRadius: '4px' }}
                    />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* KPI Dashboard */}
          <div className="w-full md:w-[280px] shrink-0 bg-[#dc2626] rounded-xl shadow-sm flex flex-col p-6 text-white justify-center">
            
            {/* Velocímetro (Gauge) */}
            <div className="mb-6 flex flex-col items-center">
              <div className="h-[100px] w-[200px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { value: Math.min(totals.percPlanejadoMeta, 100) },
                        { value: Math.max(100 - totals.percPlanejadoMeta, 0) }
                      ]}
                      cx="50%"
                      cy="100%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={65}
                      outerRadius={90}
                      dataKey="value"
                      stroke="none"
                      isAnimationActive={true}
                    >
                      <Cell fill="#ffffff" />
                      <Cell fill="rgba(255,255,255,0.2)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-end pb-1">
                  <span className="text-3xl font-black drop-shadow-md">{totals.percPlanejadoMeta.toFixed(1)}%</span>
                </div>
              </div>
              <p className="text-xs font-bold opacity-90 mt-2 uppercase tracking-widest text-center">Plan. / Meta</p>
            </div>

            <div className="w-full border-t border-white/20 pt-5 space-y-4">
              <div>
                <h3 className="text-xl font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.totalMeta)}</h3>
                <p className="text-xs font-semibold opacity-80 uppercase tracking-wider">Vlr Meta</p>
              </div>
              
              <div>
                <h3 className="text-lg font-bold opacity-90">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.totalPlanejado)}</h3>
                <p className="text-xs font-semibold opacity-70 uppercase tracking-wider">Vlr Planejado</p>
              </div>

              <div>
                <h3 className="text-lg font-bold opacity-90">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.desvio)}</h3>
                <p className="text-xs font-semibold opacity-70 uppercase tracking-wider">Desvio</p>
              </div>
            </div>
          </div>

        </div>

        {/* Gráfico de Pareto de Reprogramadas */}
        {paretoData.length > 0 && (
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 mb-8 mt-8">
            <div className="mb-6 border-b border-border pb-4">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <BarChart2 className="w-5 h-5" />
                Motivos de Reprogramação (Pareto)
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Impacto planejado vs produção realizada por motivo</p>
            </div>

            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={paretoData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="motivo" 
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                  />
                  <YAxis 
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(val)}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                    content={({ active, payload, label }: any) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-card border border-border p-3 rounded-lg shadow-lg">
                            <p className="font-bold mb-2">{label}</p>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                              <span className="text-sm">Planejado Original: <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload[0]?.value || 0)}</strong></span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                              <span className="text-sm">Produção Realizada: <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload[1]?.value || 0)}</strong></span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-4">
                              <span className="text-sm text-muted-foreground">Qtd Obras (linhas):</span>
                              <span className="text-sm font-bold">{payload[2]?.value || 0}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  
                  <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '20px' }} />
                  
                  <Bar yAxisId="left" dataKey="planejado" name="Planejado Original (R$)" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={40} />
                  <Bar yAxisId="left" dataKey="produzido" name="Produção Efetiva (R$)" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
                  
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="count" 
                    name="Quantidade de Obras" 
                    stroke="#000000" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#000000' }} 
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
