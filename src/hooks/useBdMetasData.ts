import { useMemo } from 'react';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';
import { parse, isValid, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface BdMetasRow {
  dataString: string;
  dataParsed: Date;
  mesCurto: string;
  equipe: string;
  unidadeId: string;
  unidadeNome: string;
  tipoEquipe: string;
  valorMeta: number;
}

export const useBdMetasData = (selectedUnidadesIds: string[]) => {
  const { data: rawData, isLoading, isError, refetch, isRefetching } = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedBdMetasData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    const parseNumber = (val: any) => {
      if (!val) return 0;
      let str = String(val).trim();
      const clean = str.replace(/[R$%\s\.]/g, '').replace(',', '.');
      let num = Number(clean);
      return isNaN(num) ? 0 : num;
    };

    const result: BdMetasRow[] = [];

    rawData.forEach(({ unidadeId, bdMetas }) => {
      if (!bdMetas) return;
      
      const bdMetasArray = Array.isArray(bdMetas) 
        ? bdMetas 
        : (bdMetas as any).bd_metas;

      if (!bdMetasArray || bdMetasArray.length === 0) return;

      const unidadeInfo = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeId);
      const unidadeNome = unidadeInfo ? unidadeInfo.nome : `UNIDADE ${unidadeId}`;

      // Pula cabeçalho
      for (let i = 1; i < bdMetasArray.length; i++) {
        const row = bdMetasArray[i];
        if (!row || !Array.isArray(row)) continue; // Pelo menos até Col D

        const equipe = row[1];     // Coluna B
        const dataVal = row[2];    // Coluna C
        const valorMeta = parseNumber(row[3]); // Coluna D
        const tipoEquipe = row.length > 4 && row[4] ? row[4] : 'DESCONHECIDO'; // Coluna E

        let dataParsed: Date | null = null;
        let dataString = '';
        
        if (dataVal) {
          dataString = String(dataVal).split(' - ')[0].trim();
          let parsed = parse(dataString, 'dd/MM/yyyy', new Date());
          if (isValid(parsed)) {
            dataParsed = startOfDay(parsed);
          } else {
            parsed = new Date(dataString);
            if (isValid(parsed)) {
              dataParsed = startOfDay(parsed);
            }
          }
        }

        if (dataParsed && equipe) {
          const mesCurtoRaw = format(dataParsed, 'MMM', { locale: ptBR });
          const mesCurtoCapitalized = mesCurtoRaw.charAt(0).toUpperCase() + mesCurtoRaw.slice(1);

          result.push({
            dataString,
            dataParsed,
            mesCurto: mesCurtoCapitalized,
            equipe: String(equipe).trim().toUpperCase(),
            unidadeId,
            unidadeNome,
            tipoEquipe: String(tipoEquipe).trim().toUpperCase(),
            valorMeta
          });
        }
      }
    });

    return result;
  }, [rawData]);

  return {
    data: parsedBdMetasData,
    lastUpdated: rawData?.[0]?.lastUpdated || null,
    isLoading,
    isError,
    refetch,
    isRefetching
  };
};
