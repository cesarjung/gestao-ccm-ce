import { useMemo } from 'react';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';
import { parse, isValid, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';

export interface DeslocamentoRow {
  id: string;
  unidadeId: string;
  unidadeNome: string;
  dataParsed: Date;
  mesAno: string; // ex: 'Jan 2026'
  mesCurto: string; // ex: 'Jan'
  supervisor: string;
  equipe: string;
  projeto: string;
  valDeslocamento: number; // Coluna U (index 20)
  valProdTurno: number; // Coluna AM (index 38)
  valProgTurno: number; // Coluna AQ (index 42)
}

export const useDeslocamentoData = (selectedUnidadesIds: string[]) => {
  const rawQuery = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedData = useMemo(() => {
    if (!rawQuery.data || !Array.isArray(rawQuery.data)) return [];
    
    try {
      const data: DeslocamentoRow[] = [];

      const parseNumber = (val: string) => {
        if (!val) return 0;
        const clean = String(val).replace(/[R$\s\.]/g, '').replace(',', '.');
        const num = Number(clean);
        return isNaN(num) ? 0 : num;
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

        // Se for um número decimal (Google Sheets envia tempo como fração de 24h em alguns casos)
        // Precisamos ter cuidado com pontos e vírgulas.
        // Se vier "0,0416" -> "0.0416"
        const clean = str.replace(/[R$\s]/g, '').replace(',', '.');
        const num = Number(clean);
        if (isNaN(num)) return 0;
        
        // Multiplica por 24 para converter fração do dia em horas.
        return num * 24;
      };

      rawQuery.data.forEach(unidadeData => {
        const rows = unidadeData.principal;
        const unidadeInfo = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeData.unidadeId);
        const unidadeNome = unidadeInfo?.nome || unidadeData.unidadeId;

        for (let i = 7; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue; // Precisa ir até AQ (42)

          const dataStringFull = row[1]; // Coluna B
          const supervisor = row[4];     // Coluna E
          const equipe = row[6];         // Coluna G
          const projeto = row[7];        // Coluna H

          const valDeslocamento = parseTimeInHours(row[64]); // Coluna BM (64) convertido para Horas
          const valProdTurno = parseNumber(row[38]); // Coluna AM
          const valProgTurno = parseNumber(row[42]); // Coluna AQ

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
              valDeslocamento,
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
    lastUpdated: rawQuery.data?.[0]?.lastUpdated || null,
  };
};
