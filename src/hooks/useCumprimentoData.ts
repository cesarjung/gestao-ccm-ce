import { useMemo } from 'react';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';
import { parse, isValid, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';

export interface CumprimentoRow {
  id: string;
  unidadeId: string;
  unidadeNome: string;
  dataParsed: Date;
  mesAno: string; // ex: 'Jan 2026'
  mesCurto: string; // ex: 'Jan'
  supervisor: string;
  equipe: string;
  projeto: string;
  valPlanejado: number;
  valRealizado: number; // Coluna U (index 20)
  valProdTurno: number; // Coluna AM (index 38)
  valProgTurno: number; // Coluna AQ (index 42)
  valDisponivel: number; // Coluna BB (index 53)
  planilha: string; // Coluna BE (index 56)
  dataString: string;
}

export const useCumprimentoData = (selectedUnidadesIds: string[]) => {
  const rawQuery = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedData = useMemo(() => {
    if (!rawQuery.data || !Array.isArray(rawQuery.data)) return [];
    
    try {
      const data: CumprimentoRow[] = [];

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
        const unidadeInfo = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeData.unidadeId);
        const unidadeNome = unidadeInfo?.nome || unidadeData.unidadeId;

        for (let i = 7; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue; // Precisa ir até AQ (42)

          const dataStringFull = row[1]; // Coluna B
          const supervisor = row[4];     // Coluna E
          const equipe = row[6];         // Coluna G
          const projeto = row[7];        // Coluna H

          const valPlanejado = parseNumber(row[37]); // Coluna AL
          const valRealizado = parseNumber(row[40]); // Coluna AO
          const valProdTurno = parseNumber(row[38]); // Coluna AM
          const valProgTurno = parseNumber(row[42]); // Coluna AQ
          const valDisponivel = parseNumber(row[53]); // Coluna BB
          const planilha = row[56] ? String(row[56]).trim() : ''; // Coluna BE

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
              valRealizado,
              valProdTurno,
              valProgTurno,
              valDisponivel,
              planilha,
              dataString: dataApenas
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
