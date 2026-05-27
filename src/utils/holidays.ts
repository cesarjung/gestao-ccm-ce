import { isWeekend, getYear, format } from 'date-fns';

// Feriados nacionais fixos (mês-dia)
const FIXED_HOLIDAYS = [
  '01-01', // Ano Novo
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalhador
  '09-07', // Independência do Brasil
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '12-25', // Natal
];

// Calcula a data da Páscoa usando o algoritmo de Meeus/Jones/Butcher
function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Obtém feriados móveis baseados na Páscoa
function getMovableHolidays(year: number): string[] {
  const easter = calculateEaster(year);
  const holidays: string[] = [];
  
  // Carnaval (47 dias antes da Páscoa - Segunda e Terça)
  const carnavalTuesday = new Date(easter);
  carnavalTuesday.setDate(easter.getDate() - 47);
  const carnavalMonday = new Date(carnavalTuesday);
  carnavalMonday.setDate(carnavalTuesday.getDate() - 1);
  
  // Quarta-feira de Cinzas (46 dias antes da Páscoa) - alguns consideram feriado
  const ashWednesday = new Date(easter);
  ashWednesday.setDate(easter.getDate() - 46);
  
  // Sexta-feira Santa (2 dias antes da Páscoa)
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  
  // Corpus Christi (60 dias após a Páscoa)
  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);
  
  holidays.push(format(carnavalMonday, 'MM-dd'));
  holidays.push(format(carnavalTuesday, 'MM-dd'));
  holidays.push(format(goodFriday, 'MM-dd'));
  holidays.push(format(easter, 'MM-dd'));
  holidays.push(format(corpusChristi, 'MM-dd'));
  
  return holidays;
}

// Verifica se uma data é feriado nacional brasileiro
export function isHoliday(date: Date): boolean {
  const year = getYear(date);
  const dateStr = format(date, 'MM-dd');
  
  // Verifica feriados fixos
  if (FIXED_HOLIDAYS.includes(dateStr)) {
    return true;
  }
  
  // Verifica feriados móveis
  const movableHolidays = getMovableHolidays(year);
  return movableHolidays.includes(dateStr);
}

// Verifica se uma data é final de semana ou feriado
export function isWeekendOrHoliday(date: Date): boolean {
  return isWeekend(date) || isHoliday(date);
}

// Encontra o próximo dia útil a partir de uma data
export function getNextBusinessDay(date: Date): Date {
  const nextDay = new Date(date);
  while (isWeekendOrHoliday(nextDay)) {
    nextDay.setDate(nextDay.getDate() + 1);
  }
  return nextDay;
}

// Ajusta uma data para o próximo dia útil se cair em feriado/final de semana
export function adjustToBusinessDay(date: Date | string | null, skipWeekendsHolidays: boolean): Date | null {
  if (!date) return null;
  
  const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
  
  if (!skipWeekendsHolidays) {
    return dateObj;
  }
  
  return getNextBusinessDay(dateObj);
}
