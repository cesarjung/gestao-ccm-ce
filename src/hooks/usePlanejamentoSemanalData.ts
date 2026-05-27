import { useMemo } from 'react';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';
import { parse, isValid, startOfDay, isWithinInterval } from 'date-fns';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';

export interface PlanejamentoSemanalRow {
  id: string;
  unidadeId: string;
  unidadeNome: string;
  dataParsed: Date;
  dataString: string;
  equipe: string;
  supervisor: string;
  valPlanejado: number; // AL (37)
  metaEquipe: number;   // AM (38)
  tempoDeslocamento: number; // BM (64)
  tempoPlanejado: number;    // BP (67)
}

export const usePlanejamentoSemanalData = (selectedUnidadesIds: string[], startDate?: Date, endDate?: Date) => {
  const rawQuery = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedData = useMemo(() => {
    if (!rawQuery.data || !Array.isArray(rawQuery.data)) return [];
    
    try {
      const data: PlanejamentoSemanalRow[] = [];

      const parseNumber = (val: any) => {
        if (!val) return 0;
        let str = String(val).trim();
        const isPercent = str.includes('%');
        
        const clean = str.replace(/[R$%\s\.]/g, '').replace(',', '.');
        let num = Number(clean);
        if (isNaN(num)) return 0;
        return isPercent ? num / 100 : num;
      };

      const parseTimeInHours = (val: any) => {
        if (!val) return 0;
        const str = String(val).trim();
        
        if (str.includes(':')) {
           const parts = str.split(':');
           const h = parseInt(parts[0], 10) || 0;
           const m = parseInt(parts[1], 10) || 0;
           const s = parts.length > 2 ? parseInt(parts[2], 10) || 0 : 0;
           return h + (m / 60) + (s / 3600);
        }

        const clean = str.replace(/[R$\s]/g, '').replace(',', '.');
        const num = Number(clean);
        if (isNaN(num)) return 0;
        
        return num * 24;
      };

      rawQuery.data.forEach(unidadeData => {
        const rows = unidadeData.principal;
        const unidadeInfo = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeData.unidadeId);
        const unidadeNome = unidadeInfo?.nome || unidadeData.unidadeId;

        for (let i = 7; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue; // Precisa ir até BP (67)

          const dataStringFull = row[1]; // Coluna B
          const supervisor = row[4];     // Coluna E
          const equipe = row[6];         // Coluna G

          const valPlanejado = parseNumber(row[37]); // Coluna AL
          const metaEquipe = parseNumber(row[38]);   // Coluna AM
          const tempoDeslocamento = parseTimeInHours(row[64]); // Coluna BM
          const tempoPlanejado = parseTimeInHours(row[67]);    // Coluna BP

          const dataApenas = dataStringFull ? String(dataStringFull).split(' - ')[0].trim() : '';
          let dataParsed: Date | null = null;
          
          if (dataApenas) {
            const parsed = parse(dataApenas, 'dd/MM/yyyy', new Date());
            if (isValid(parsed)) {
              dataParsed = startOfDay(parsed);
            }
          }

          if (dataParsed) {
            // Filtrar por data, se fornecido
            if (startDate && endDate) {
              if (!isWithinInterval(dataParsed, { start: startOfDay(startDate), end: startOfDay(endDate) })) {
                continue;
              }
            }

            data.push({
              id: `${unidadeData.unidadeId}-${i}-${dataParsed.getTime()}`,
              unidadeId: unidadeData.unidadeId,
              unidadeNome,
              dataParsed,
              dataString: dataApenas,
              equipe: equipe?.trim() || 'SEM EQUIPE',
              supervisor: supervisor?.trim() || 'SEM SUPERVISOR',
              valPlanejado,
              metaEquipe,
              tempoDeslocamento,
              tempoPlanejado
            });
          }
        }
      });

      // Ordenar por data crescente
      data.sort((a, b) => a.dataParsed.getTime() - b.dataParsed.getTime());
      
      return data;
    } catch (err) {
      console.error('Erro ao processar dados de planejamento semanal:', err);
      return [];
    }
  }, [rawQuery.data, startDate, endDate]);

  return {
    ...rawQuery,
    data: parsedData,
    lastBotUpdate: rawQuery.data?.[0]?.lastUpdated || null,
    lastSystemUpdate: rawQuery.dataUpdatedAt ? new Date(rawQuery.dataUpdatedAt).toISOString() : null,
  };
};
