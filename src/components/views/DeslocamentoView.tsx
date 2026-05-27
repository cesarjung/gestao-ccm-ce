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
import { useDeslocamentoData } from '@/hooks/useDeslocamentoData';
import { usePlanejamentoRaw, useSyncPlanejamento } from '@/hooks/usePlanejamentoRaw';
import { useSessionState } from '@/hooks/useSessionState';
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
  LabelList
} from 'recharts';

export const DeslocamentoView = () => {
  const [selectedUnidadesIds, setSelectedUnidadesIds] = useSessionState<string[]>('filter_unidades_deslocamento', []);
  const [zoomLevel, setZoomLevel] = useSessionState<number>('filter_zoom_deslocamento', 1);
  const [unidadesDropdownOpen, setUnidadesDropdownOpen] = useState(false);
  const [draftUnidadesIds, setDraftUnidadesIds] = useState<string[]>(selectedUnidadesIds);
  const { mutate: syncPlanejamento, isPending: isSyncing } = useSyncPlanejamento();

  const { data, isLoading, isError, lastUpdated } = useDeslocamentoData(selectedUnidadesIds);

  // Filtros locais (persistidos em sessão)
  const [selectedMeses, setSelectedMeses] = useSessionState<string[]>('filter_meses_deslocamento', []);
    
  const [filterStart, setFilterStart] = useSessionState<string>('filter_start_deslocamento', '');
  const [filterEnd, setFilterEnd] = useSessionState<string>('filter_end_deslocamento', '');
  
  const [selectedSupervisores, setSelectedSupervisores] = useSessionState<string[]>('filter_supervisores_deslocamento', []);
  const [supervisoresDropdownOpen, setSupervisoresDropdownOpen] = useState(false);
  
  const [selectedEquipes, setSelectedEquipes] = useSessionState<string[]>('filter_equipes_deslocamento', []);
  const [equipesDropdownOpen, setEquipesDropdownOpen] = useState(false);
  
  const [selectedProjetos, setSelectedProjetos] = useSessionState<string[]>('filter_projetos_deslocamento', []);
  
  // Toggle "Média Todos Turnos"
  const [mediaTodosTurnos, setMediaTodosTurnos] = useState(false);

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

  // Cálculos de Agrupamento
  const chartData = useMemo(() => {
    const agrupado: Record<string, any> = {};

    filteredData.forEach(row => {
      const uNome = row.unidadeNome.replace('UNIDADE ', '');
      if (!agrupado[uNome]) {
        agrupado[uNome] = {
          name: uNome,
          // Totais globais da unidade para média geral e prod%
          sumU: 0, countU: 0, countAM: 0,
          sumAQ: 0, sumAMGlob: 0,
          meses: {} as Record<string, { sumU: number, countU: number, countAM: number, sumAQ: number, sumAM: number }>
        };
      }

      const g = agrupado[uNome];
      
      // Global
      g.sumU += row.valDeslocamento;
      if (row.valDeslocamento > 0) g.countU += 1;
      if (row.valProdTurno > 0) g.countAM += 1;
      
      g.sumAQ += row.valProgTurno;
      g.sumAMGlob += row.valProdTurno;

      // Por Mês
      if (!g.meses[row.mesCurto]) {
        g.meses[row.mesCurto] = { sumU: 0, countU: 0, countAM: 0, sumAQ: 0, sumAM: 0 };
      }
      const gm = g.meses[row.mesCurto];
      gm.sumU += row.valDeslocamento;
      if (row.valDeslocamento > 0) gm.countU += 1;
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
      const denomGeral = mediaTodosTurnos ? u.countAM : u.countU;
      item._mediaGeral = denomGeral > 0 ? u.sumU / denomGeral : null;

      // Médias por mês (para o chart e tabela)
      mesesExibidos.forEach(m => {
        if (u.meses[m]) {
          const denomMes = mediaTodosTurnos ? u.meses[m].countAM : u.meses[m].countU;
          item[m] = denomMes > 0 ? Number((u.meses[m].sumU / denomMes).toFixed(1)) : null;
          item[`${m}_prod`] = u.meses[m].sumAM > 0 ? (u.meses[m].sumAQ / u.meses[m].sumAM) * 100 : 0;
        } else {
          item[m] = null;
          item[`${m}_prod`] = null;
        }
      });

      return item;
    });

    // Ordenar alfabeticamente pela unidade
    resultadoFinal.sort((a, b) => a.name.localeCompare(b.name));

    return resultadoFinal;
  }, [filteredData, mediaTodosTurnos, mesesExibidos]);

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

  const getCellColor = (val: number | null) => {
    if (val === null || val === undefined) return 'bg-muted/30 text-muted-foreground';
    if (val <= 1.0) return 'bg-[#43a047] text-white font-bold'; // Verde escuro
    if (val <= 1.2) return 'bg-[#7cb342] text-white font-bold'; // Verde claro
    if (val <= 1.5) return 'bg-[#fb8c00] text-white font-bold'; // Laranja
    return 'bg-[#e53935] text-white font-bold'; // Vermelho
  };

  const getProdColor = (perc: number) => {
    if (perc >= 110) return 'bg-blue-500';
    if (perc >= 90) return 'bg-green-500';
    if (perc >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col h-full w-full items-center justify-center bg-background">
        <div className="animate-spin text-primary mb-4"><RefreshCw className="w-8 h-8" /></div>
        <p>Carregando dados de Deslocamento...</p>
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
            <h1 className="text-xl font-bold text-foreground mb-0.5 leading-none">Média de Tempo de Deslocamento</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Módulo Deslocamento</p>
          </div>
          
          <div className="w-px h-10 bg-border shrink-0"></div>

          {/* FILTROS */}
          <div className="flex flex-nowrap items-end gap-2 shrink-0">
            
            {/* Toggle Button */}
            <div className="flex flex-col justify-center mr-2">
              <Toggle 
                pressed={mediaTodosTurnos} 
                onPressedChange={setMediaTodosTurnos}
                variant="outline"
                className={cn(
                  "h-10 px-3 border transition-colors", 
                  mediaTodosTurnos ? "border-primary bg-primary/10 text-primary" : ""
                )}
                title="Alternar entre contagem (Val > 0) ou (Val_Prod > 0)"
              >
                <Hash className="w-4 h-4 mr-2" />
                Média Todos Turnos
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
                  <Bar key={m} dataKey={m} name={m} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={25}>
                    <LabelList dataKey={m} position="top" fill="currentColor" fontSize={10} formatter={(v: any) => v || ''} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabela */}
        <div className="w-full border border-border rounded-xl bg-card shadow-sm flex flex-col mb-4 overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <h2 className="text-lg font-bold text-foreground">Indicadores de Produção</h2>
            <p className="text-xs text-muted-foreground">Detalhamento por Unidade</p>
          </div>
          
          <div className="w-full p-4">
            <table className="w-full text-sm text-left border-collapse">
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
                          className={cn("h-full transition-all", getProdColor(row._producaoPerc))} 
                          style={{ width: `${Math.min(row._producaoPerc, 100)}%` }}
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
                          <div className={cn("w-full max-w-[64px] mx-auto h-full min-h-[32px] flex items-center justify-center text-xs rounded-sm", getCellColor(val))}>
                            {val !== null && val !== undefined ? val.toFixed(1) : '-'}
                          </div>
                        </td>,
                        <td key={`${m}_prod`} className="px-1 py-2 text-center relative min-w-[70px]">
                          {prodVal !== null && prodVal !== undefined ? (
                            <>
                              <div className="absolute inset-y-1.5 left-1 right-1 bg-muted/50 rounded-sm overflow-hidden border border-border/50">
                                <div 
                                  className={cn("h-full transition-all", getProdColor(prodVal))} 
                                  style={{ width: `${Math.min(prodVal, 100)}%` }}
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

                    {/* Média Geral */}
                    <td className="p-0 border border-background">
                      <div className={cn("w-full max-w-[64px] mx-auto h-full min-h-[32px] flex items-center justify-center text-xs rounded-sm", getCellColor(row._mediaGeral))}>
                        {row._mediaGeral !== null ? row._mediaGeral.toFixed(1) : '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Legenda de Cores */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-[#43a047]"></div>
                <span>≤ 1.0 h</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-[#7cb342]"></div>
                <span>1.1 - 1.2 h</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-[#fb8c00]"></div>
                <span>1.3 - 1.5 h</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-[#e53935]"></div>
                <span>&gt; 1.5 h</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
