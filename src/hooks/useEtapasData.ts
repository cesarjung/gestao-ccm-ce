import { useMemo } from 'react';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';
import { parse, isValid, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';

export interface EtapasRow {
  id: string;
  unidadeId: string;
  unidadeNome: string;
  dataParsed: Date;
  mesAno: string;
  mesCurto: string;
  supervisor: string;
  equipe: string;
  projeto: string;
  etapaOriginal: string; // Coluna M original
  etapaGrupo: string; // O grupo calculado ('Conclusão', 'Esc/Imp', 'Esc/Im/Lç', 'Implant.', 'Lançamento', ou 'Outros')
  valProdTurno: number; // Coluna AM (index 38)
  valDisponivel: number; // Coluna BB (index 53)
}

export const useEtapasData = (selectedUnidadesIds: string[]) => {
  const rawQuery = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedData = useMemo(() => {
    if (!rawQuery.data || !Array.isArray(rawQuery.data)) return [];
    
    try {
      const data: EtapasRow[] = [];

      const parseNumber = (val: any) => {
        if (!val) return 0;
        let str = String(val).trim();
        const isPercent = str.includes('%');
        
        const clean = str.replace(/[R$%\s\.]/g, '').replace(',', '.');
        let num = Number(clean);
        if (isNaN(num)) return 0;
        return isPercent ? num / 100 : num;
      };

      const getEtapaGrupo = (etapaRaw: string) => {
        if (!etapaRaw) return 'Outros';
        const str = String(etapaRaw).trim().toLowerCase();
        
        // As regras de categorização:
        if (str.includes('conclusão') || str.includes('conclusao')) return 'Conclusão';
        if (str === 'escavação/implantação/lançamento') return 'Esc/Im/Lç';
        if (str === 'escavação/implantação' || (str.includes('escavação') && str.includes('implantação'))) return 'Esc/Imp';
        if (str === 'lançamento de cabo') return 'Lançamento';
        // Para implantação, se contém implantação mas não contém escavação
        if (str.includes('implantação') && !str.includes('escavação')) return 'Implant.';
        
        return 'Outros';
      };

      rawQuery.data.forEach(unidadeData => {
        const rows = unidadeData.principal;
        const unidadeInfo = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeData.unidadeId);
        const unidadeNome = unidadeInfo?.nome || unidadeData.unidadeId;

        for (let i = 7; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue;

          const dataStringFull = row[1];
          const supervisor = row[4];
          const equipe = row[6];
          const projeto = row[7];
          const etapaOriginal = row[12]; // Coluna M

          const valProdTurno = parseNumber(row[38]); // Coluna AM (Meta)
          const valDisponivel = parseNumber(row[53]); // Coluna BB

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
              etapaOriginal: etapaOriginal?.trim() || '',
              etapaGrupo: getEtapaGrupo(etapaOriginal),
              valProdTurno,
              valDisponivel
            });
          }
        }
      });

      data.sort((a, b) => a.dataParsed.getTime() - b.dataParsed.getTime());
      return data;
    } catch (err) {
      console.error('Erro ao processar dados de etapas:', err);
      return [];
    }
  }, [rawQuery.data]);

  return {
    ...rawQuery,
    data: parsedData,
    lastUpdated: rawQuery.data?.[0]?.lastUpdated || null,
  };
};
