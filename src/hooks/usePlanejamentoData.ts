import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parse, isValid, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';

const SECRET_TOKEN = 'sirtec_vista_2026_seguro';
export interface PlanejamentoEtapaDiaria {
  dataString: string;
  dataParsed: Date | null;
  etapa: string;
}

export interface PlanejamentoRow {
  id: string;
  mesFiltro: string;      // Coluna I (Index 8)
  dataInicio: string;     // Coluna J (Index 9)
  dataFim: string;        // Coluna K (Index 10)
  statusExecucao: string; // Coluna L (Index 11)
  projeto: string;        // Coluna M (Index 12)
  nomeProjeto: string;    // Coluna N (Index 13)
  supervisor: string;     // Coluna AG (Index 32)
  parsedStartDate: Date | null;
  parsedEndDate: Date | null;
  etapasDiarias: PlanejamentoEtapaDiaria[];
}

const CARTEIRA_URL = 'https://docs.google.com/spreadsheets/d/1OTHF2ytEOjGgfE49paARXkz9GjaklOQC_UhiXwUjC2E/gviz/tq?tqx=out:csv&sheet=Carteira_Planejador';
const PLAN_PRINCIPAL_URL = 'https://docs.google.com/spreadsheets/d/1OTHF2ytEOjGgfE49paARXkz9GjaklOQC_UhiXwUjC2E/gviz/tq?tqx=out:csv&sheet=Plan_Principal';

export const getEtapaColorClass = (etapaName: string) => {
  if (!etapaName) return "bg-zinc-900 border-black hover:bg-zinc-700 text-white";
  
  const normalized = etapaName.toUpperCase();
  
  // Condições compostas primeiro
  const isDesligamento = normalized.includes('DESLIGAMENTO') || normalized.includes('DES');
  const isConclusao = normalized.includes('CONCLUSÃO') || normalized.includes('CONCLUSAO') || normalized.includes('CON');
  
  if (isDesligamento && isConclusao) {
    return 'bg-emerald-800 border-emerald-950 hover:bg-emerald-700 text-white'; // Verde escuro
  }
  
  if (normalized.includes('PREPARAÇÃO DESLIGAMENTO') || normalized.includes('PREPARACAO DESLIGAMENTO') || normalized.includes('PREP')) {
    return 'bg-orange-500 border-orange-700 hover:bg-orange-400 text-white';
  }
  
  if (isDesligamento) {
    return 'bg-red-600 border-red-800 hover:bg-red-500 text-white';
  }
  
  if (isConclusao) {
    return 'bg-green-600 border-green-800 hover:bg-green-500 text-white'; // Verde normal
  }
  
  if (normalized.includes('ESCAVAÇÃO') || normalized.includes('ESCAVACAO') || normalized.includes('ESC')) {
    return 'bg-amber-800 border-amber-950 hover:bg-amber-700 text-white'; // Marrom
  }
  
  if (normalized.includes('LANÇAMENTO') || normalized.includes('LANCAMENTO') || normalized.includes('LAN')) {
    return 'bg-blue-600 border-blue-800 hover:bg-blue-500 text-white';
  }
  
  // Demais (inclusive IMPLANTAÇÃO) pretas
  return 'bg-zinc-900 border-black hover:bg-zinc-700 text-white';
};

export const usePlanejamentoData = (selectedUnidadesIds: string[]) => {
  const rawQuery = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedData = useMemo(() => {
    if (!rawQuery.data || !Array.isArray(rawQuery.data)) return [];
    
    try {
      const finalData: PlanejamentoRow[] = [];

      rawQuery.data.forEach(unidadeData => {
        const principalRows = unidadeData.principal;
        const carteiraRows = unidadeData.carteira;
        const unidadeId = unidadeData.unidadeId;

        // 1. Parse Plan_Principal
        const etapasPorProjeto: Record<string, PlanejamentoEtapaDiaria[]> = {};

        for (let i = 7; i < principalRows.length; i++) {
          const row = principalRows[i];
          if (!row || !Array.isArray(row)) continue;

          const dataStringFull = row[1]; // Coluna B
          const projeto = row[7];        // Coluna H
          const etapa = row[12];         // Coluna M

          if (!projeto || !projeto.trim()) continue;

          const dataApenas = dataStringFull ? dataStringFull.split(' - ')[0].trim() : '';
          let dataParsed: Date | null = null;
          
          if (dataApenas) {
            const parsed = parse(dataApenas, 'dd/MM/yyyy', new Date());
            if (isValid(parsed)) dataParsed = parsed;
          }

          if (!etapasPorProjeto[projeto]) {
            etapasPorProjeto[projeto] = [];
          }

          if (etapa && etapa.trim()) {
            etapasPorProjeto[projeto].push({
              dataString: dataStringFull,
              dataParsed,
              etapa: etapa.trim()
            });
          }
        }

        // 2. Parse Carteira_Planejador
        for (let i = 6; i < carteiraRows.length; i++) {
          const row = carteiraRows[i];
          if (!row || !Array.isArray(row)) continue;
          
          const projeto = row[12];
          if (!projeto || projeto.trim() === '') continue;

          let mesFiltroStr = row[8] ? String(row[8]).trim() : '';
          
          // Fallback robusto: se a coluna Mês (I) estiver vazia na planilha, extrair o mês da Data Início (J)
          if (!mesFiltroStr || mesFiltroStr === '-') {
            const dataInicioRaw = row[9] ? String(row[9]).trim() : '';
            if (dataInicioRaw && dataInicioRaw !== '-') {
              const matchDI = dataInicioRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
              if (matchDI) {
                // Passa para o formato que o normalizeMes entende (01/MM/YYYY)
                mesFiltroStr = `01/${matchDI[2]}/${matchDI[3]}`;
              }
            }
          }
          
          const normalizeMes = (m: string) => {
            if (!m || m === '-') return '';
            const match = m.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (match) {
              const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
              return `${format(date, "MMM", { locale: ptBR })}./${format(date, "yy")}`.toLowerCase(); 
            }
            return m.toLowerCase();
          };

          const mesFiltro = mesFiltroStr 
            ? mesFiltroStr.split(',').map(m => normalizeMes(m.trim())).filter(Boolean).join(', ')
            : '';
          
          const dataInicio = row[9] || '';
          const dataFim = row[10] || '';
          const statusExecucao = row[11] || '';
          const nomeProjeto = row[13] || '';
          const supervisor = row[32] || '';

          let parsedStartDate: Date | null = null;
          if (dataInicio && dataInicio !== '-') {
            const dt = parse(dataInicio, 'dd/MM/yyyy', new Date());
            if (isValid(dt)) parsedStartDate = dt;
          }

          let parsedEndDate: Date | null = null;
          if (dataFim && dataFim !== '-') {
            const dt = parse(dataFim, 'dd/MM/yyyy', new Date());
            if (isValid(dt)) parsedEndDate = dt;
          }

          const etapasDoProjeto = etapasPorProjeto[projeto] || [];

          finalData.push({
            id: `${projeto}-${unidadeId}-${i}`,
            mesFiltro,
            dataInicio,
            dataFim,
            statusExecucao,
            projeto,
            nomeProjeto,
            supervisor,
            parsedStartDate,
            parsedEndDate,
            etapasDiarias: etapasDoProjeto
          });
        }
      });

      return finalData;
    } catch (err) {
      console.error('Erro ao processar dados de planejamento', err);
      return [];
    }
  }, [rawQuery.data]);

  return {
    ...rawQuery,
    data: parsedData,
  };
};
