import { useMemo } from 'react';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';
import { parse, isValid, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';

export interface ReprogramadaRow {
  id: string;
  unidadeId: string;
  unidadeNome: string;
  dataParsed: Date;
  mesCurto: string;
  equipe: string;
  projeto: string;
  motivo: string; // Coluna AU (index 46)
  valPlanejado: number; // Coluna AL (index 37)
}

export const useReprogramadasData = (selectedUnidadesIds: string[]) => {
  const rawQuery = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedData = useMemo(() => {
    if (!rawQuery.data || !Array.isArray(rawQuery.data)) return [];
    
    try {
      const data: ReprogramadaRow[] = [];

      const parseNumber = (val: any) => {
        if (!val) return 0;
        let str = String(val).trim();
        const isPercent = str.includes('%');
        
        const clean = str.replace(/[R$%\s\.]/g, '').replace(',', '.');
        
        let num = Number(clean);
        if (isNaN(num)) return 0;
        return isPercent ? num / 100 : num;
      };

      rawQuery.data.forEach(unidadeData => {
        const reprogRows = unidadeData.reprogramadas || [];
        const unidadeInfo = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeData.unidadeId);
        const unidadeNome = unidadeInfo?.nome || unidadeData.unidadeId;

        for (let i = 7; i < reprogRows.length; i++) {
          const row = reprogRows[i];
          if (!row || !Array.isArray(row)) continue; // Precisa ir até AU (46)

          const dataStringFull = row[1]; // Coluna B
          const equipe = row[6];         // Coluna G
          const projeto = row[7];        // Coluna H
          const valPlanejado = parseNumber(row[37]); // Coluna AL
          const motivo = row[46];        // Coluna AU

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

            data.push({
              id: `${unidadeData.unidadeId}-${i}-${dataParsed.getTime()}`,
              unidadeId: unidadeData.unidadeId,
              unidadeNome,
              dataParsed,
              mesCurto,
              equipe: equipe?.trim() || '',
              projeto: projeto?.trim() || 'Sem Projeto',
              motivo: motivo?.trim() || 'NÃO INFORMADO',
              valPlanejado
            });
          }
        }
      });

      // Ordenar por data crescente
      data.sort((a, b) => a.dataParsed.getTime() - b.dataParsed.getTime());
      
      return data;
    } catch (err) {
      console.error("Erro no parser das reprogramadas:", err);
      return [];
    }
  }, [rawQuery.data]);

  return {
    data: parsedData,
    lastUpdated: rawQuery.data?.[0]?.lastUpdated || null,
    isLoading: rawQuery.isLoading,
    isError: rawQuery.isError,
    error: rawQuery.error
  };
};
