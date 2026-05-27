import { useMemo } from 'react';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';
import { parse, isValid, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';

export interface PlanejadoMetaRow {
  id: string;
  unidadeId: string;
  unidadeNome: string;
  dataParsed: Date;
  mesAno: string; // ex: 'Jan 2026'
  mesCurto: string; // ex: 'Jan'
  supervisor: string;
  equipe: string;
  projeto: string;
  valPlanejado: number; // Coluna U (index 20)? AL is 37
  valProdTurno: number; // Coluna AM (index 38)
  valProgTurno: number; // Coluna AQ (index 42)
  valDisponivel: number; // Coluna BB (index 53)
  valPlanejadoMisto: number; // Valor Planejado Misto (Reprogramadas ou Principal)
}

export const usePlanejadoMetaData = (selectedUnidadesIds: string[]) => {
  const rawQuery = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedData = useMemo(() => {
    if (!rawQuery.data || !Array.isArray(rawQuery.data)) return [];
    
    try {
      const data: PlanejadoMetaRow[] = [];

      const parseNumber = (val: any) => {
        if (!val) return 0;
        let str = String(val).trim();
        const isPercent = str.includes('%');
        
        // Remove R$, %, espaços e TODOS OS PONTOS (separador de milhar no Brasil)
        // E troca a vírgula por ponto (separador decimal do JavaScript)
        const clean = str.replace(/[R$%\s\.]/g, '').replace(',', '.');
        
        let num = Number(clean);
        if (isNaN(num)) return 0;
        return isPercent ? num / 100 : num;
      };

      rawQuery.data.forEach(unidadeData => {
        const rows = unidadeData.principal;
        if (!rows || !Array.isArray(rows)) return;
        const unidadeInfo = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeData.unidadeId);
        const unidadeNome = unidadeInfo?.nome || unidadeData.unidadeId;

        // Pré-processar a aba Reprogramadas para a lógica Mista
        const reprogMap = new Map<string, number>();
        const reprogRows = unidadeData.reprogramadas || [];
        for (let i = 7; i < reprogRows.length; i++) {
          const rRow = reprogRows[i];
          if (!rRow || !Array.isArray(rRow)) continue;
          
          const rData = rRow[1]; // Coluna B
          const rEquipe = rRow[6]; // Coluna G
          const rProjeto = rRow[7]; // Coluna H
          const rValPlanejado = parseNumber(rRow[37]); // Coluna AL
          
          const key = `${rData ? String(rData).trim() : ''}|${rEquipe ? String(rEquipe).trim().toUpperCase() : ''}|${rProjeto ? String(rProjeto).trim().toUpperCase() : ''}`;
          reprogMap.set(key, rValPlanejado);
        }

        // Rastreador de duplicatas para a Coluna AQ (Produção)
        // Regra: Mesma equipe + Mesmo projeto + Mesmo valor AQ = Contabiliza apenas uma vez
        const seenProducaoAQ = new Set<string>();

        // Rastreador de chaves processadas na Plan_Principal
        const prinKeys = new Set<string>();

        for (let i = 7; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue;

          const dataStringFull = row[1]; // Coluna B
          const supervisor = row[4];     // Coluna E
          const equipe = row[6];         // Coluna G
          const projeto = row[7];        // Coluna H

          const valPlanejado = parseNumber(row[37]); // Coluna AL
          const valProdTurno = parseNumber(row[38]); // Coluna AM
          let valProgTurno = parseNumber(row[42]); // Coluna AQ
          const valDisponivel = parseNumber(row[53]); // Coluna BB

          // Lógica da Linha Mista (Prioriza Reprogramadas)
          const keyMista = `${dataStringFull ? String(dataStringFull).trim() : ''}|${equipe ? String(equipe).trim().toUpperCase() : ''}|${projeto ? String(projeto).trim().toUpperCase() : ''}`;
          const valPlanejadoMisto = reprogMap.has(keyMista) ? reprogMap.get(keyMista)! : valPlanejado;
          prinKeys.add(keyMista);

          // Lógica de Triagem/Deduplicação da Produção (Coluna AQ)
          if (valProgTurno > 0) {
            const eqStr = equipe ? String(equipe).trim().toUpperCase() : 'SEM EQUIPE';
            const projStr = projeto ? String(projeto).trim().toUpperCase() : 'SEM PROJETO';
            const signature = `${eqStr}|${projStr}|${valProgTurno}`;
            
            if (seenProducaoAQ.has(signature)) {
              valProgTurno = 0; // Zera apenas a produção desta linha duplicada
            } else {
              seenProducaoAQ.add(signature);
            }
          }

          const dataApenas = dataStringFull ? String(dataStringFull).split(' - ')[0].trim() : '';
          let dataParsed: Date | null = null;
          
          if (dataApenas) {
            const parsed = parse(dataApenas, 'dd/MM/yyyy', new Date());
            if (isValid(parsed)) {
              dataParsed = startOfDay(parsed);
            }
          }

          if (dataParsed) {
            const mesCurtoRaw = format(dataParsed, 'MMM', { locale: ptBR });
            const mesCurto = mesCurtoRaw.charAt(0).toUpperCase() + mesCurtoRaw.slice(1);
            const mesAno = format(dataParsed, 'MMM yyyy', { locale: ptBR });

            data.push({
              id: `${unidadeData.unidadeId}-${i}-${dataParsed.getTime()}`,
              unidadeId: unidadeData.unidadeId,
              unidadeNome,
              dataParsed,
              mesAno,
              mesCurto,
              supervisor: supervisor?.trim() || '',
              equipe: equipe?.trim() || '',
              projeto: projeto?.trim() || 'Sem Projeto',
              valPlanejado,
              valProdTurno,
              valProgTurno,
              valDisponivel,
              valPlanejadoMisto
            });
          }
        }

        // Adicionar as linhas EXCLUSIVAS da Reprogramadas (que não existiam na Plan_Principal)
        for (let i = 7; i < reprogRows.length; i++) {
          const rRow = reprogRows[i];
          if (!rRow || !Array.isArray(rRow)) continue;
          
          const rDataFull = rRow[1]; // Coluna B
          const rEquipe = rRow[6]; // Coluna G
          const rProjeto = rRow[7]; // Coluna H
          const rValPlanejado = parseNumber(rRow[37]); // Coluna AL
          
          const key = `${rDataFull ? String(rDataFull).trim() : ''}|${rEquipe ? String(rEquipe).trim().toUpperCase() : ''}|${rProjeto ? String(rProjeto).trim().toUpperCase() : ''}`;
          
          if (!prinKeys.has(key) && rValPlanejado > 0) {
            // Esta é uma linha exclusiva da Reprogramadas
            const dataApenas = rDataFull ? String(rDataFull).split(' - ')[0].trim() : '';
            let dataParsed: Date | null = null;
            
            if (dataApenas) {
              const parsed = parse(dataApenas, 'dd/MM/yyyy', new Date());
              if (isValid(parsed)) {
                dataParsed = startOfDay(parsed);
              }
            }

            if (dataParsed) {
              const mesCurtoRaw = format(dataParsed, 'MMM', { locale: ptBR });
              const mesCurto = mesCurtoRaw.charAt(0).toUpperCase() + mesCurtoRaw.slice(1);
              const mesAno = format(dataParsed, 'MMM yyyy', { locale: ptBR });
              
              // Como não existe na Plan_Principal, Produção e Meta são 0
              const valProdTurno = parseNumber(rRow[38] || 0);
              const valProgTurno = parseNumber(rRow[42] || 0);
              const valDisponivel = parseNumber(rRow[53] || 1);

              data.push({
                id: `${unidadeData.unidadeId}-reprog-${i}-${dataParsed.getTime()}`,
                unidadeId: unidadeData.unidadeId,
                unidadeNome,
                dataParsed,
                mesAno,
                mesCurto,
                supervisor: rRow[4]?.trim() || '',
                equipe: rEquipe?.trim() || '',
                projeto: rProjeto?.trim() || 'Sem Projeto',
                valPlanejado: 0, // Planejado original é 0 pois não existia
                valProdTurno,
                valProgTurno,
                valDisponivel,
                valPlanejadoMisto: rValPlanejado // O Misto recebe o valor reprogramado
              });
            }
          }
        }
      });

      // Ordenar por data crescente
      data.sort((a, b) => a.dataParsed.getTime() - b.dataParsed.getTime());
      
      return data;
    } catch (err) {
      console.error('Erro ao processar dados de poste_turno:', err);
      return [];
    }
  }, [rawQuery.data]);

  return {
    ...rawQuery,
    data: parsedData,
    lastUpdated: rawQuery.data?.[0]?.lastUpdated || null,
  };
};
