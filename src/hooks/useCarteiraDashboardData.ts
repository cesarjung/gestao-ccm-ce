import { useMemo } from 'react';
import { usePlanejamentoRaw } from './usePlanejamentoRaw';
import { parse, isValid, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';

export interface CarteiraRow {
  id: string;
  unidadeId: string;
  unidadeNome: string;
  projeto: string;
  titulo: string;
  statusExecucao: string;
  municipio: string;
  prioridade: string;
  meses: string[]; // Lista de meses (ex: "abr./25")
  avnpMap: Record<string, number>; // Mapa Mês -> AVNP
  avnpMaisRecente: number; // AVNP do primeiro mês da lista
  obrasInaptasVal: string;
  obrasSemOrcamentoVal: string;
  postesDisponiveis: number;
  capacidadeFaturamento: number;
  dataInicio: Date | null;
  dataFim: Date | null;
  dataVistoria: Date | null;
  dataEnergizacao: Date | null;
  latitude: number | null;
  longitude: number | null;
  qtdGpm: number;
  qtdNeoex: number;
  orcamentoValidado: number;
  orcamentoRaw: string;
  recursosAplicados: number;
}

export interface BaseCurvaRow {
  unidadeId: string;
  mesMeta: string;
  metaPostesEquipe: number;
  totalPostes: number;
  totalEquipes: number;
}

export interface MetaFaturamentoRow {
  unidadeId: string;
  mesMeta: string;
  valor: number;
}

export const useCarteiraDashboardData = (selectedUnidadesIds: string[]) => {
  const { data: rawData, isLoading } = usePlanejamentoRaw(selectedUnidadesIds);

  const parsedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return { carteira: [], baseCurva: [], metasFaturamento: [] };

    const parseNumber = (val: any) => {
      if (val === 0 || val === '0') return 0;
      if (!val) return 0;
      if (typeof val === 'number') return val;
      let str = String(val).trim();
      const isPercent = str.includes('%');
      // Se a string já é um número decimal válido (ex: "227288.33"), converte direto
      if (/^-?\d+\.\d+$/.test(str)) {
         const num = Number(str);
         return isPercent ? num / 100 : num;
      }
      // Caso contrário, limpa a formatação R$ 227.288,33
      const clean = str.replace(/[R$%\s\.]/g, '').replace(',', '.');
      let num = Number(clean);
      if (isNaN(num)) return 0;
      return isPercent ? num / 100 : num;
    };

    const normalizeString = (str: string) => {
      if (!str) return '';
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    };

    const parseDate = (val: any): Date | null => {
      if (!val) return null;
      let str = String(val).trim();
      if (!str || str === '-') return null;
      let parsed = parse(str.split(' - ')[0], 'dd/MM/yyyy', new Date());
      if (isValid(parsed)) return startOfDay(parsed);
      parsed = new Date(str);
      if (isValid(parsed)) return startOfDay(parsed);
      return null;
    };

    const carteira: CarteiraRow[] = [];
    const baseCurva: BaseCurvaRow[] = [];
    const metasFaturamento: MetaFaturamentoRow[] = [];
    let lastUpdated: Date | null = null;
    const recursosAplicadosPorObra: Record<string, number> = {};

    rawData.forEach(unidadeData => {
      if (unidadeData.lastUpdated) {
        const d = new Date(unidadeData.lastUpdated);
        if (!lastUpdated || d > lastUpdated) lastUpdated = d;
      }
      
      const carteiraRows = unidadeData.carteira;
      const unidadeInfo = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeData.unidadeId);
      const unidadeNome = unidadeInfo ? unidadeInfo.nome : `UNIDADE ${unidadeData.unidadeId}`;

      // Nova lógica de Recursos Aplicados via base Global
      let usouBaseGlobal = false;
      if (unidadeData.bdMetas && typeof unidadeData.bdMetas === 'object' && 'recursos_aplicados' in unidadeData.bdMetas) {
        const ra = unidadeData.bdMetas.recursos_aplicados as Record<string, number>;
        if (ra && Object.keys(ra).length > 0) {
          usouBaseGlobal = true;
          Object.entries(ra).forEach(([obraId, metaSoma]) => {
            // Como o dicionário global já tem a soma total e ele vem igual em todas as unidades,
            // nós não usamos += para evitar duplicidade caso mais de uma unidade seja carregada.
            recursosAplicadosPorObra[obraId] = metaSoma;
          });
        }
      }

      // Fallback para a lógica antiga usando Plan_Principal caso a base global falhe
      if (!usouBaseGlobal) {
        const principalRows = unidadeData.principal;
        if (principalRows && Array.isArray(principalRows)) {
          for (let j = 1; j < principalRows.length; j++) {
            const pRow = principalRows[j];
            if (!pRow || !Array.isArray(pRow)) continue;
            
            const obraId = String(pRow[7] || '').trim(); // Coluna H
            
            // Fallback +2 colunas (caso a planilha tenha sofrido shift na base de dados)
            let metaVal = parseNumber(pRow[38]); // Coluna AM
            let paramAO = parseNumber(pRow[40]); // Coluna AO
            
            // Se a coluna original estiver vazia e a deslocada tiver dado, assume o shift
            const raw38 = pRow[38];
            if ((raw38 === undefined || raw38 === null || raw38 === '') && pRow[40] !== undefined) {
               metaVal = parseNumber(pRow[40]); // Fallback para AO
               paramAO = parseNumber(pRow[42]); // Fallback para AQ
            }
            
            if (obraId && paramAO > 0) {
              if (!recursosAplicadosPorObra[obraId]) {
                recursosAplicadosPorObra[obraId] = 0;
              }
              recursosAplicadosPorObra[obraId] += metaVal;
            }
          }
        }
      }

      // O usuário solicitou expressamente que:
      // Valor Considerado = AM = 38 (capacidadeFaturamento)
      // Orçamento Validado = AJ = 35 (orcamentoValidado) OU "R$ MO Validado" na linha 5 (index 4)
      
      let indexOrcamento = 35; // AJ fallback
      let indexPostes = 24; // Y fallback
      
      // Procura exatamente na linha 5 (index 4) o cabeçalho correto, ou nas primeiras linhas
      let foundOrcamentoIdx = -1;
      let foundPostesIdx = -1;
      
      for (let hr = 0; hr < Math.min(10, carteiraRows.length); hr++) {
        const headerRow = carteiraRows[hr];
        if (Array.isArray(headerRow)) {
          // Busca cabeçalho do Orçamento Validado
          const idxOrc = headerRow.findIndex(h => {
            const s = String(h).toLowerCase();
            return s.includes('mo validado') || s.includes('orçamento val') || s.includes('orcamento val');
          });
          if (idxOrc !== -1) foundOrcamentoIdx = idxOrc;

          // Busca cabeçalho de Postes Disponíveis (PT DISP)
          const idxPostes = headerRow.findIndex(h => {
            const s = String(h).toLowerCase().trim();
            return s === 'pt disp' || s === 'pt. disp' || s === 'postes disp' || s.includes('pt disp');
          });
          if (idxPostes !== -1) foundPostesIdx = idxPostes;
        }
      }
      
      if (foundOrcamentoIdx !== -1) indexOrcamento = foundOrcamentoIdx;
      if (foundPostesIdx !== -1) indexPostes = foundPostesIdx;

      // --- PROCESSAR CARTEIRA ---
      
      // Procura a linha exata dos cabeçalhos (dinamicamente)
      let dataStartIndex = 5; // fallback
      for (let i = 0; i < Math.min(10, carteiraRows.length); i++) {
        const row = carteiraRows[i];
        if (Array.isArray(row) && row.some(cell => String(cell).toUpperCase().includes('PROJETO_INVESTIMENTO'))) {
          dataStartIndex = i + 1; // Dados começam logo abaixo do cabeçalho
          break;
        }
      }

      // Função de conversão UTM para LatLng (Zona 24S - Ceará)
      const utmToLatLng = (easting: number, northing: number) => {
        // Se as coordenadas já parecem ser Lat/Long válidas (ex: -7.23, -39.32), retorna direto
        if (Math.abs(easting) < 180 && Math.abs(northing) < 180) {
          return { lat: easting, lng: northing }; // Na planilha pode vir invertido, ajustaremos embaixo
        }
        
        // Ceará = UTM Zona 24 Sul
        const zone = 24;
        const southernHemisphere = true;

        const a = 6378137;
        const eccSquared = 0.00669438;
        const k0 = 0.9996;

        let x = easting - 500000.0;
        let y = southernHemisphere ? northing - 10000000.0 : northing;

        const longOrigin = (zone - 1) * 6 - 180 + 3;
        const eccPrimeSquared = (eccSquared) / (1 - eccSquared);

        const M = y / k0;
        const mu = M / (a * (1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * Math.pow(eccSquared, 3) / 256));

        const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));

        const phi1Rad = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) 
                      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
                      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);

        const N1 = a / Math.sqrt(1 - eccSquared * Math.pow(Math.sin(phi1Rad), 2));
        const T1 = Math.pow(Math.tan(phi1Rad), 2);
        const C1 = eccPrimeSquared * Math.pow(Math.cos(phi1Rad), 2);
        const R1 = a * (1 - eccSquared) / Math.pow(1 - eccSquared * Math.pow(Math.sin(phi1Rad), 2), 1.5);
        const D = x / (N1 * k0);

        let lat = phi1Rad - (N1 * Math.tan(phi1Rad) / R1) * (Math.pow(D, 2) / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * eccPrimeSquared) * Math.pow(D, 4) / 24
                + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * eccPrimeSquared - 3 * C1 * C1) * Math.pow(D, 6) / 720);
        lat = lat * 180 / Math.PI;

        let lng = (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * eccPrimeSquared + 24 * T1 * T1)
                * Math.pow(D, 5) / 120) / Math.cos(phi1Rad);
        lng = longOrigin + lng * 180 / Math.PI;

        return { lat, lng };
      };

      for (let i = dataStartIndex; i < carteiraRows.length; i++) {
        const row = carteiraRows[i];
        if (!row || !Array.isArray(row)) continue; 

        // Ler AVNP e Mês (No Ceará não existe essas colunas na Carteira, então deixamos vazio)
        const meses: string[] = [];
        const avnpMap: Record<string, number> = {};
        const avnpMaisRecente = 0;

        const parseCoord = (val: any) => {
            if (!val) return 0;
            let str = String(val).trim();
            if (str.includes(',') && str.includes('.')) {
                str = str.replace(/\./g, '').replace(',', '.');
            } else if (str.includes(',')) {
                str = str.replace(',', '.');
            }
            const num = Number(str);
            return isNaN(num) ? 0 : num;
        };

        let rawLat = parseCoord(row[50]); // AY = 50 (Latitude/UTM Y)
        let rawLng = parseCoord(row[51]); // AZ = 51 (Longitude/UTM X)

        let finalLat = 0;
        let finalLng = 0;

        // Na planilha, a coluna 50 (Latitude) tem o Y (958...) e 51 (Longitude) tem o X (554...)
        if (rawLat !== 0 && rawLng !== 0) {
           // Se forem coordenadas grandes (UTM), o Leste (X) costuma ter 6 dígitos (554377) e o Norte (Y) 7 (9588391)
           if (rawLng > 1000000) {
              const coords = utmToLatLng(rawLat, rawLng); // inverte
              finalLat = coords.lat;
              finalLng = coords.lng;
           } else if (rawLat > 1000000) {
              const coords = utmToLatLng(rawLng, rawLat); 
              finalLat = coords.lat;
              finalLng = coords.lng;
           } else {
              finalLat = rawLat;
              finalLng = rawLng;
           }
        }

        const obraId = String(row[10] || '').trim(); // K = 10 (PROJETO_INVESTIMENTO)

        carteira.push({
          id: `${unidadeData.unidadeId}-${i}`,
          unidadeId: unidadeData.unidadeId,
          unidadeNome,
          obrasInaptasVal: row[1] ? String(row[1]).trim() : '', // B = 1 (APTA?)
          obrasSemOrcamentoVal: row[3] ? String(row[3]).trim() : '', // D = 3 (ORÇ.)
          statusExecucao: (row[7] || row[42] || '').toString().trim(), // H=7 ou AQ=42 (STATUS ESTEIRA)
          projeto: obraId, 
          titulo: row[11] ? String(row[11]).trim() : '', // L = 11 (CLIENTE)
          municipio: row[8] ? String(row[8]).trim() : '', // I = 8 (MUNICIPIO)
          prioridade: '', // N/A
          // Se PT DISP (21) estiver vazio, usa TOTAL PT (16)
          postesDisponiveis: row[21] && String(row[21]).trim() !== '' ? parseNumber(row[21]) : parseNumber(row[16]), 
          capacidadeFaturamento: parseNumber(row[39]), // AN = 39 (VALOR CONSIDERADO)
          dataInicio: parseDate(row[5]), // F = 5 (Inicio)
          dataFim: parseDate(row[6]), // G = 6 (Fim)
          dataVistoria: parseDate(row[45]), // AT = 45 (Data Vistoria)
          dataEnergizacao: null, // N/A
          meses,
          avnpMap,
          avnpMaisRecente,
          latitude: finalLat !== 0 ? finalLat : null,
          longitude: finalLng !== 0 ? finalLng : null,

          qtdGpm: parseNumber(row[18]), // S = 18 (Qtd. Postes Realizado (GPM))
          qtdNeoex: parseNumber(row[20]), // U = 20 (Qtd. Postes Planejados)
          // Se MO VALIDADO (36) estiver vazio, usa VR_MAO_DE_OBRA (35)
          orcamentoValidado: row[36] && String(row[36]).trim() !== '' ? parseNumber(row[36]) : parseNumber(row[35]),
          orcamentoRaw: String(row[36] !== undefined && row[36] !== null && row[36] !== '' ? row[36] : (row[35] || 'VAZIO')),
          recursosAplicados: recursosAplicadosPorObra[obraId] || 0,
        });
      }

      const bdMetasObj = unidadeData.bdMetas as any;
      const baseCurvaRows = bdMetasObj?.base_curva || [];
      const bdConfigRows = bdMetasObj?.bd_config || [];
      
      const unidadeNomeNorm = normalizeString(unidadeNome);

      for (let i = 1; i < baseCurvaRows.length; i++) {
        const row = baseCurvaRows[i];
        if (!row || !Array.isArray(row)) continue;
        
        const unidadeRow = normalizeString(String(row[1] || ''));
        if (unidadeRow !== unidadeNomeNorm && unidadeRow !== unidadeNomeNorm.replace(/\s+/g, '')) {
          continue;
        }

        let parsedMes = parseDate(row[2]);
        let mesMetaStr = '';
        if (parsedMes) {
          mesMetaStr = `${format(parsedMes, "MMM", { locale: ptBR })}./${format(parsedMes, "yy")}`.toLowerCase();
        } else {
          mesMetaStr = row[2] ? String(row[2]).trim() : '';
        }
        
        baseCurva.push({
          unidadeId: unidadeData.unidadeId,
          mesMeta: mesMetaStr, // C (Formatado para bater com selectedMeses)
          metaPostesEquipe: parseNumber(row[4]), // E
          totalPostes: parseNumber(row[5]), // F
          totalEquipes: parseNumber(row[6]), // G
        });
      }

      for (let i = 2; i < bdConfigRows.length; i++) {
        const row = bdConfigRows[i];
        if (!row || !Array.isArray(row)) continue;

        const unidadeRow = normalizeString(String(row[81] || ''));
        if (unidadeRow === unidadeNomeNorm || unidadeRow === unidadeNomeNorm.replace(/\s+/g, '')) {
          const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
          for (let m = 0; m < 12; m++) {
            metasFaturamento.push({
              unidadeId: unidadeData.unidadeId,
              mesMeta: `${monthNames[m]}./26`,
              valor: parseNumber(row[82 + m])
            });
          }
        }
      }
    });

    return { carteira, baseCurva, metasFaturamento, lastUpdated };
  }, [rawData]);

  return {
    data: parsedData,
    isLoading
  };
};
