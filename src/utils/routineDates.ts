import { addDays, addWeeks, addMonths, isWeekend, format, setDate, endOfMonth, isSameDay } from 'date-fns';

// Brazilian National Holidays (Fixed dates) MM-DD
const FIXED_HOLIDAYS = [
    '01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25',
];

export function isHoliday(date: Date): boolean {
    const dateString = format(date, 'MM-dd');
    return FIXED_HOLIDAYS.includes(dateString);
}

export function isBusinessDay(date: Date): boolean {
    return !isWeekend(date) && !isHoliday(date);
}

export function getNextBusinessDay(date: Date): Date {
    let nextDate = new Date(date.getTime());
    while (!isBusinessDay(nextDate)) {
        nextDate = addDays(nextDate, 1);
    }
    return nextDate;
}

export function getPreviousBusinessDay(date: Date): Date {
    let prevDate = new Date(date.getTime());
    while (!isBusinessDay(prevDate)) {
        prevDate = addDays(prevDate, -1);
    }
    return prevDate;
}

// Get the Nth weekday of the month (e.g. 2nd Friday)
function getNthWeekdayOfMonth(date: Date): { nth: number; weekday: number } {
    const day = date.getDate();
    const weekday = date.getDay(); // 0 is Sunday
    const nth = Math.ceil(day / 7); // 1st, 2nd, 3rd, 4th, or 5th
    return { nth, weekday };
}

// Get date for the Nth weekday of a specific month
function getDateByNthWeekday(year: number, month: number, nth: number, weekday: number): Date {
    // Start at the 1st of the month
    const targetDate = new Date(year, month, 1);
    const firstDayOfWeek = targetDate.getDay();

    // Calculate days to add to get to the first occurrence of 'weekday'
    let daysToAdd = weekday - firstDayOfWeek;
    if (daysToAdd < 0) daysToAdd += 7;

    targetDate.setDate(1 + daysToAdd + (nth - 1) * 7);

    // Handle case where 5th occurrence doesn't exist (e.g. February), default to last occurrence
    if (targetDate.getMonth() !== month) {
        targetDate.setDate(targetDate.getDate() - 7);
    }

    return targetDate;
}

export interface GenerationOptions {
    frequency: 'diaria' | 'semanal' | 'quinzenal' | 'mensal';
    limitDate: Date; // hard stop date
    skipWeekendsHolidays?: boolean;
    monthlyAnchor?: 'date' | 'weekday';
}

export interface PeriodDates {
    start: Date;
    end: Date;
}

/**
 * Generates an array of future start/end dates for the entire duration of a routine.
 * Used for pre-generating up to 1 year of tasks synchronously upon creation.
 */
export function generateRoutineTimeline(
    baseStart: Date,
    baseEnd: Date,
    options: GenerationOptions
): PeriodDates[] {
    const timeline: PeriodDates[] = [];
    const durationMs = baseEnd.getTime() - baseStart.getTime();

    let currentStart = new Date(baseStart.getTime());
    let currentEnd = new Date(baseEnd.getTime());

    // If the initial date falls on a weekend/holiday and skip is active, adjust it immediately
    if (options.skipWeekendsHolidays && !isBusinessDay(currentStart)) {
        currentStart = getNextBusinessDay(currentStart);
        currentEnd = new Date(currentStart.getTime() + durationMs);
    }

    const { nth, weekday } = getNthWeekdayOfMonth(baseStart);
    const baseDayOfMonth = baseStart.getDate();

    let iteration = 0;

    // Failsafe limit to avoid true infinite loops if limitDate is somehow 10+ years
    const MAX_ITERATIONS = 400;

    while (currentStart <= options.limitDate && iteration < MAX_ITERATIONS) {
        timeline.push({
            start: new Date(currentStart.getTime()),
            end: new Date(currentEnd.getTime()),
        });

        iteration++;

        // Calculate Next Nominal Base Date
        let nextNominalStart: Date;

        switch (options.frequency) {
            case 'diaria':
                nextNominalStart = addDays(currentStart, 1);
                break;
            case 'semanal':
                nextNominalStart = addWeeks(currentStart, 1);
                break;
            case 'quinzenal':
                nextNominalStart = addWeeks(currentStart, 2);
                break;
            case 'mensal':
                // For monthly, we need to anchor securely to avoid month-length drift (31 -> 30 -> 28)
                if (options.monthlyAnchor === 'weekday') {
                    const targetYear = currentStart.getMonth() === 11 ? currentStart.getFullYear() + 1 : currentStart.getFullYear();
                    const targetMonth = currentStart.getMonth() === 11 ? 0 : currentStart.getMonth() + 1;

                    nextNominalStart = getDateByNthWeekday(targetYear, targetMonth, nth, weekday);
                    nextNominalStart.setHours(currentStart.getHours(), currentStart.getMinutes(), currentStart.getSeconds(), currentStart.getMilliseconds());
                } else {
                    // 'date' anchor (e.g., always day 15)
                    const targetYearOffset = currentStart.getMonth() === 11 ? currentStart.getFullYear() + 1 : currentStart.getFullYear();
                    const targetMonthOffset = currentStart.getMonth() === 11 ? 0 : currentStart.getMonth() + 1;

                    nextNominalStart = new Date(targetYearOffset, targetMonthOffset, 1);

                    const endOfMonthDate = endOfMonth(nextNominalStart).getDate();

                    // Snap to the original day of month or the last valid day of the target month
                    const targetDay = Math.min(baseDayOfMonth, endOfMonthDate);
                    nextNominalStart.setDate(targetDay);
                    nextNominalStart.setHours(currentStart.getHours(), currentStart.getMinutes(), currentStart.getSeconds(), currentStart.getMilliseconds());
                }
                break;
            default:
                nextNominalStart = addDays(currentStart, 1);
        }

        // Apply Drift Correction for Weekends/Holidays (only pushes forward)
        if (options.skipWeekendsHolidays && !isBusinessDay(nextNominalStart)) {
            currentStart = getNextBusinessDay(nextNominalStart);
        } else {
            currentStart = nextNominalStart;
        }

        currentEnd = new Date(currentStart.getTime() + durationMs);

        // Safety check: if skipWeekends forced the END date into an invalid state 
        // Example: A task created at 22:00 that lasts 4 hours might bleed into Saturday.
        // For simplicity of checking, we assume duration maps exactly.
    }

    return timeline;
}
