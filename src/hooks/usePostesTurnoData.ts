import { useMemo } from 'react';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';
import { parse, isValid, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';

export interface PosteTurnoRow {
  id: string;
  unidadeId: string;
  unidadeNome: string;
  dataParsed: Date;
  mesAno: string; // ex: 'Jan 2026'
  mesCurto: string; // ex: 'Jan'
  supervisor: string;
  equipe: string;
  projeto: string;
  valPlanTurno: number; // Coluna U (index 20)
  valProdTurno: number; // Coluna AM (index 38)
  valProgTurno: number; // Coluna AQ (index 42)
}

export const usePostesTurnoData = (selectedUnidadesIds: string[]) => {
  const rawQuery = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedData = useMemo(() => {
    if (!rawQuery.data || !Array.isArray(rawQuery.data)) return [];
    
    try {
      const data: PosteTurnoRow[] = [];

      const parseNumber = (val: any) => {
        if (!val) return 0;
        let str = String(val).trim();
        str = str.replace(/[R$%\s]/g, '');
        if (str.includes(',')) {
          str = str.replace(/\./g, '').replace(',', '.');
        }
        let num = Number(str);
        if (isNaN(num)) {
          const match = str.match(/[\d\.]+/);
          if (match) num = Number(match[0]);
        }
        return isNaN(num) ? 0 : num;
      };

      rawQuery.data.forEach(unidadeData => {
        const rowsIndividual = unidadeData.principal || [];
        const bdMetasObj = Array.isArray(unidadeData.bdMetas) ? null : unidadeData.bdMetas;
        const rowsCentral = (bdMetasObj && bdMetasObj.central_postes) ? bdMetasObj.central_postes : [];

        const unidadeInfo = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeData.unidadeId);
        const unidadeNome = unidadeInfo?.nome || unidadeData.unidadeId;

        // 1. Processa a aba individual (para Prod% - valProdTurno e valProgTurno)
        for (let i = 4; i < rowsIndividual.length; i++) {
          const row = rowsIndividual[i];
          if (!row || !Array.isArray(row)) continue;

          const dataStringFull = row[1]; // Coluna B
          const supervisor = row[4];     // Coluna E
          const equipe = row[6];         // Coluna G
          const projeto = row[7];        // Coluna H

          // Ignora a coluna U da individual, pois agora usamos a central
          const valPlanTurno = 0; 
          const valProdTurno = parseNumber(row[38]); // Coluna AM
          const valProgTurno = parseNumber(row[42]); // Coluna AQ

          const dataApenas = dataStringFull ? String(dataStringFull).split(' - ')[0].trim() : '';
          let dataParsed: Date | null = null;
          if (dataApenas) {
            const parsed = parse(dataApenas, 'dd/MM/yyyy', new Date());
            if (isValid(parsed)) dataParsed = startOfDay(parsed);
          }

          if (dataParsed) {
            const mesCurtoRaw = format(dataParsed, 'MMM', { locale: ptBR });
            data.push({
              id: `ind-${unidadeData.unidadeId}-${i}-${dataParsed.getTime()}`,
              unidadeId: unidadeData.unidadeId,
              unidadeNome,
              dataParsed,
              mesAno: format(dataParsed, 'MMM yyyy', { locale: ptBR }),
              mesCurto: mesCurtoRaw.charAt(0).toUpperCase() + mesCurtoRaw.slice(1),
              supervisor: supervisor?.trim() || '',
              equipe: equipe?.trim() || '',
              projeto: projeto?.trim() || 'Sem Projeto',
              valPlanTurno,
              valProdTurno,
              valProgTurno
            });
          }
        }

        // 2. Processa a aba central (para Poste/Turno - valPlanTurno)
        for (let i = 0; i < rowsCentral.length; i++) {
          const row = rowsCentral[i];
          if (!row) continue;

          const dataStringFull = row.data;
          const valPlanTurno = parseNumber(row.implant);
          const valProdTurno = 0;
          const valProgTurno = 0;

          const dataApenas = dataStringFull ? String(dataStringFull).split(' - ')[0].trim() : '';
          let dataParsed: Date | null = null;
          if (dataApenas) {
            const parsed = parse(dataApenas, 'dd/MM/yyyy', new Date());
            if (isValid(parsed)) dataParsed = startOfDay(parsed);
          }

          if (dataParsed) {
            const mesCurtoRaw = format(dataParsed, 'MMM', { locale: ptBR });
            data.push({
              id: `cen-${unidadeData.unidadeId}-${i}-${dataParsed.getTime()}`,
              unidadeId: unidadeData.unidadeId,
              unidadeNome,
              dataParsed,
              mesAno: format(dataParsed, 'MMM yyyy', { locale: ptBR }),
              mesCurto: mesCurtoRaw.charAt(0).toUpperCase() + mesCurtoRaw.slice(1),
              supervisor: row.supervisor?.trim() || '',
              equipe: row.equipe?.trim() || '',
              projeto: row.projeto?.trim() || 'Sem Projeto',
              valPlanTurno,
              valProdTurno,
              valProgTurno
            });
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
    rawData: rawQuery.data,
    lastUpdated: rawQuery.data?.[0]?.lastUpdated || null,
  };
};
