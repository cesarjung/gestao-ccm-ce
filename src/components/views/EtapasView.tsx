import React, { useState, useMemo } from 'react';
import { Filter, Calendar, RefreshCw, Hash, ZoomIn, ZoomOut } from 'lucide-react';
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
import { useEtapasData } from '@/hooks/useEtapasData';
import { usePlanejamentoRaw, useSyncPlanejamento } from '@/hooks/usePlanejamentoRaw';
import { useSessionState } from '@/hooks/useSessionState';
import { parse, startOfDay, endOfDay, isWithinInterval, addDays, subDays, differenceInDays, isValid, format } from 'date-fns';
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
  LabelList
} from 'recharts';

export const EtapasView = () => {
  const [selectedUnidadesIds, setSelectedUnidadesIds] = useSessionState<string[]>('filter_unidades_etapas', []);
  const [zoomLevel, setZoomLevel] = useSessionState<number>('filter_zoom_etapas', 1);
  const [unidadesDropdownOpen, setUnidadesDropdownOpen] = useState(false);
  const [draftUnidadesIds, setDraftUnidadesIds] = useState<string[]>(selectedUnidadesIds);
  const { mutate: syncPlanejamento, isPending: isSyncing } = useSyncPlanejamento();

  const { data, isLoading, isError, lastUpdated } = useEtapasData(selectedUnidadesIds);

  // Filtros locais (persistidos em sessão)
  const [selectedMeses, setSelectedMeses] = useSessionState<string[]>('filter_meses_etapas', []);
    
  const [filterStart, setFilterStart] = useSessionState<string>('filter_start_etapas', '');
  const [filterEnd, setFilterEnd] = useSessionState<string>('filter_end_etapas', '');

  const [selectedSupervisores, setSelectedSupervisores] = useSessionState<string[]>('filter_supervisores_etapas', []);
  const [supervisoresDropdownOpen, setSupervisoresDropdownOpen] = useState(false);

  const [selectedEquipes, setSelectedEquipes] = useSessionState<string[]>('filter_equipes_etapas', []);
  const [equipesDropdownOpen, setEquipesDropdownOpen] = useState(false);

  const [selectedProjetos, setSelectedProjetos] = useSessionState<string[]>('filter_projetos_etapas', []);
  
  // Regra vital
  const [somenteDisponiveis, setSomenteDisponiveis] = useState(false);

  // Extrair opções únicas para os dropdowns
  const {
    mesesUnicos,
    supervisoresUnicos,
    equipesUnicas,
    projetosUnicos
  } = useMemo(() => {
    const mSet = new Set<string>();
    const sSet = new Set<string>();
    const eSet = new Set<string>();
    const pSet = new Set<string>();

    data.forEach(r => {
      if (r.mesCurto) mSet.add(r.mesCurto);
      if (r.supervisor) sSet.add(r.supervisor);
      if (r.equipe) eSet.add(r.equipe);
      if (r.projeto) pSet.add(r.projeto);
    });

    const mArr = Array.from(mSet);
    // Ordenar meses cronologicamente
    const mesesOrder = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    mArr.sort((a, b) => mesesOrder.indexOf(b) - mesesOrder.indexOf(a));

    return {
      mesesUnicos: mArr,
      supervisoresUnicos: Array.from(sSet).sort(),
      equipesUnicas: Array.from(eSet).sort(),
      projetosUnicos: Array.from(pSet).sort()
    };
  }, [data]);

  // Aplicar filtros
  const filteredData = useMemo(() => {
    let dtStart: Date | null = null;
    let dtEnd: Date | null = null;

    if (filterStart) {
      const parsedStart = parse(filterStart, 'yyyy-MM-dd', new Date());
      if (isValid(parsedStart)) dtStart = startOfDay(parsedStart);
    }
    if (filterEnd) {
      const parsedEnd = parse(filterEnd, 'yyyy-MM-dd', new Date());
      if (isValid(parsedEnd)) dtEnd = endOfDay(parsedEnd);
    }

    return data.filter(row => {
      if (selectedMeses.length > 0 && !selectedMeses.includes(row.mesCurto)) return false;
      if (selectedSupervisores.length > 0 && !selectedSupervisores.includes(row.supervisor)) return false;
      if (selectedEquipes.length > 0 && !selectedEquipes.includes(row.equipe)) return false;
      if (selectedProjetos.length > 0 && !selectedProjetos.includes(row.projeto)) return false;

      if (dtStart && row.dataParsed < dtStart) return false;
      if (dtEnd && row.dataParsed > dtEnd) return false;

      return true;
    });
  }, [data, selectedMeses, filterStart, filterEnd, selectedSupervisores, selectedEquipes, selectedProjetos]);

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

  // Construir dados para o Grid
  const gridData = useMemo(() => {
    const agrupado: Record<string, any> = {};

    filteredData.forEach(row => {
      // Regra: Desconsiderar quando não tiver meta na coluna AM
      if (row.valProdTurno <= 0) return;

      // Se "Somente Disponíveis" estiver ativo, exclui tudo que NÃO FOR 1 (100%) na coluna BB
      if (somenteDisponiveis && row.valDisponivel !== 1) return;

      const uNome = row.unidadeNome.replace('UNIDADE ', '');
      if (!agrupado[uNome]) {
        agrupado[uNome] = {
          name: uNome,
          mesesObj: {} as Record<string, { totalRows: number, grupos: Record<string, number> }>
        };
      }

      const g = agrupado[uNome].mesesObj;
      if (!g[row.mesCurto]) {
        g[row.mesCurto] = { 
          totalRows: 0, 
          grupos: { 'Conclusão': 0, 'Esc/Imp': 0, 'Esc/Im/Lç': 0, 'Implant.': 0, 'Lançamento': 0 } 
        };
      }
      
      g[row.mesCurto].totalRows += 1;
      
      if (g[row.mesCurto].grupos[row.etapaGrupo] !== undefined) {
        g[row.mesCurto].grupos[row.etapaGrupo] += 1;
      }
    });

    const categories = ['Conclusão', 'Esc/Imp', 'Esc/Im/Lç', 'Implant.', 'Lançamento'];

    const resultadoFinal = Object.values(agrupado).map(u => {
      const unitChartData = categories.map(cat => {
        const point: any = { category: cat };
        mesesExibidos.forEach(m => {
          const mData = u.mesesObj[m];
          if (mData && mData.totalRows > 0) {
            point[m] = Number(((mData.grupos[cat] / mData.totalRows) * 100).toFixed(1));
          } else {
            point[m] = 0;
          }
        });
        return point;
      });

      return {
        name: u.name,
        data: unitChartData
      };
    });

    resultadoFinal.sort((a, b) => a.name.localeCompare(b.name));
    return resultadoFinal;
  }, [filteredData, somenteDisponiveis, mesesExibidos]);

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

  const handleQuickDateFilter = (days: number) => {
    if (days === 0) {
      setFilterStart('');
      setFilterEnd('');
      return;
    }
    const end = new Date();
    const start = subDays(end, days);
    setFilterStart(format(start, 'yyyy-MM-dd'));
    setFilterEnd(format(end, 'yyyy-MM-dd'));
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col h-full w-full items-center justify-center bg-background">
        <div className="animate-spin text-primary mb-4"><RefreshCw className="w-8 h-8" /></div>
        <p>Carregando dados de Etapas...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col h-full w-full items-center justify-center text-red-500 bg-background">
        <p>Ocorreu um erro ao carregar os dados.</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">Tentar Novamente</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-y-auto overflow-x-hidden custom-scrollbar relative">
      
      {/* HEADER COMPACTO */}
      <div className="flex flex-col gap-3 p-4 shrink-0 border-b border-border sticky top-0 z-10 bg-background w-full min-w-0">
        <div className="flex flex-row flex-nowrap items-end gap-4 overflow-x-auto custom-scrollbar w-full pb-2">
          <div className="shrink-0 mb-1">
            <h1 className="text-xl font-bold text-foreground mb-0.5 leading-none">Percentual Etapas</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Módulo Etapas</p>
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

      {/* CONTEÚDO PRINCIPAL */}
      <div style={{ zoom: zoomLevel } as React.CSSProperties} className="flex flex-col gap-6 p-4 pb-8">
        
        {/* Grid de Evolução (Small Multiples) */}
        <div className="w-full shrink-0 flex flex-col gap-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold text-foreground">Etapas Programadas</h2>
              <p className="text-xs text-muted-foreground">Evolução percentual por grupo</p>
            </div>
            
            {/* Legend for Months */}
            <div className="flex gap-4 text-xs font-medium bg-muted/30 px-3 py-1.5 rounded-md border border-border">
              <span className="text-muted-foreground mr-1">Cores = meses:</span>
              {mesesExibidos.map((m, i) => (
                <div key={m} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                  {m}
                </div>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gridData.map(unidade => (
              <div key={unidade.name} className="border border-border rounded-lg bg-card shadow-sm overflow-hidden flex flex-col">
                <div className="bg-[#c92a2a] text-white px-3 py-1.5 font-bold text-sm tracking-wide">
                  {unidade.name}
                </div>
                <div className="p-4 h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={unidade.data} margin={{ top: 15, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis 
                        dataKey="category" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} 
                        angle={0}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} 
                        domain={[0, 50]} 
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ fontWeight: 'bold' }}
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                      />
                      {mesesExibidos.map((m, i) => (
                        <Bar key={m} dataKey={m} name={m} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} maxBarSize={20}>
                          <LabelList 
                            dataKey={m} 
                            position="top" 
                            fill={COLORS[i % COLORS.length]} 
                            fontSize={9} 
                            fontWeight="bold" 
                            offset={5} 
                            formatter={(v: any) => v > 0 ? v : ''} 
                          />
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
