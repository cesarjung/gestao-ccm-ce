import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Enums } from '@/integrations/supabase/types';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';

export type TaskFrequency = Enums<'task_frequency'>;

const FREQUENCIES: TaskFrequency[] = ['diaria', 'semanal', 'quinzenal', 'mensal'];

export interface FrequencyBreakdown {
  diaria: { completed: number; pending: number; total: number };
  semanal: { completed: number; pending: number; total: number };
  quinzenal: { completed: number; pending: number; total: number };
  mensal: { completed: number; pending: number; total: number };
}

export interface UnitRoutineStatus {
  id: string;
  name: string;
  code: string;
  frequencies: FrequencyBreakdown;
  totals: { completed: number; pending: number; total: number };
}

export interface ResponsibleRoutineStatus {
  id: string;
  name: string;
  email: string;
  frequencies: FrequencyBreakdown;
  totals: { completed: number; pending: number; total: number };
}

const emptyFrequencyBreakdown = (): FrequencyBreakdown => ({
  diaria: { completed: 0, pending: 0, total: 0 },
  semanal: { completed: 0, pending: 0, total: 0 },
  quinzenal: { completed: 0, pending: 0, total: 0 },
  mensal: { completed: 0, pending: 0, total: 0 },
});

export const useUnitRoutineStatus = (sectorId?: string | null) => {
  return useQuery({
    queryKey: ['unit-routine-status', sectorId],
    queryFn: async () => {
      // 1. Fetch units
      const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('id, name, code')
        .not('parent_id', 'is', null)
        .order('name');

      if (unitsError) throw unitsError;

      // 2. Fetch routines
      let routinesQuery = supabase
        .from('routines')
        .select('id, frequency')
        .eq('is_active', true);

      if (sectorId) routinesQuery = routinesQuery.eq('sector_id', sectorId);
      const { data: routines } = await routinesQuery;

      // 3. Fetch tasks
      let tasksQuery = supabase
        .from('tasks')
        .select('id, status, unit_id, routine_id');

      if (sectorId) tasksQuery = tasksQuery.eq('sector_id', sectorId);
      const { data: tasks } = await tasksQuery;

      // 4. Index routines by ID
      const routineFrequencyMap = new Map<string, TaskFrequency>();
      routines?.forEach(r => {
        if (FREQUENCIES.includes(r.frequency)) {
          routineFrequencyMap.set(r.id, r.frequency);
        }
      });

      // 5. Index tasks by Unit ID (O(T))
      // 5. Index tasks by Unit ID (O(T))
      const tasksByUnit = new Map<string, typeof tasks>();
      tasks?.forEach(t => {
        if (!t.unit_id) return;
        const list = tasksByUnit.get(t.unit_id) || [];
        list.push(t);
        tasksByUnit.set(t.unit_id, list);
      });

      // 6. Build results (O(U))
      const results: UnitRoutineStatus[] = [];

      for (const unit of units || []) {
        const frequencies = emptyFrequencyBreakdown();
        const totals = { completed: 0, pending: 0, total: 0 };

        const unitTasks = tasksByUnit.get(unit.id) || [];

        for (const task of unitTasks) {
          const freq = task.routine_id ? routineFrequencyMap.get(task.routine_id) : null;

          if (freq && FREQUENCIES.includes(freq)) {
            const isCompleted = task.status === 'concluida';

            frequencies[freq].total++;
            frequencies[freq][isCompleted ? 'completed' : 'pending']++;

            totals.total++;
            totals[isCompleted ? 'completed' : 'pending']++;
          }
        }

        if (totals.total > 0) {
          results.push({
            id: unit.id,
            name: unit.name,
            code: unit.code,
            frequencies,
            totals,
          });
        }
      }

      return results;
    },
  });
};

export const useResponsibleRoutineStatus = (sectorId?: string | null) => {
  return useQuery({
    queryKey: ['responsible-routine-status', sectorId],
    queryFn: async () => {
      // 1. Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');

      if (profilesError) throw profilesError;

      // 2. Fetch routines
      let routinesQuery = supabase
        .from('routines')
        .select('id, frequency')
        .eq('is_active', true);

      if (sectorId) routinesQuery = routinesQuery.eq('sector_id', sectorId);
      const { data: routines } = await routinesQuery;

      // 3. Fetch tasks
      let tasksQuery = supabase
        .from('tasks')
        .select('id, status, assigned_to, routine_id')
        .not('assigned_to', 'is', null);

      if (sectorId) tasksQuery = tasksQuery.eq('sector_id', sectorId);
      const { data: tasks } = await tasksQuery;

      // 4. Index routines
      const routineFrequencyMap = new Map<string, TaskFrequency>();
      routines?.forEach(r => {
        if (FREQUENCIES.includes(r.frequency)) {
          routineFrequencyMap.set(r.id, r.frequency);
        }
      });

      // 5. Index tasks by Responsible (O(T))
      const tasksByResponsible = new Map<string, typeof tasks>();
      tasks?.forEach(t => {
        if (!t.assigned_to) return;
        const list = tasksByResponsible.get(t.assigned_to) || [];
        list.push(t);
        tasksByResponsible.set(t.assigned_to, list);
      });

      // 6. Build results (O(P))
      const results: ResponsibleRoutineStatus[] = [];

      for (const profile of profiles || []) {
        const frequencies = emptyFrequencyBreakdown();
        const totals = { completed: 0, pending: 0, total: 0 };

        const responsibleTasks = tasksByResponsible.get(profile.id) || [];

        for (const task of responsibleTasks) {
          const freq = task.routine_id ? routineFrequencyMap.get(task.routine_id) : null;

          if (freq && FREQUENCIES.includes(freq)) {
            const isCompleted = task.status === 'concluida';

            frequencies[freq].total++;
            frequencies[freq][isCompleted ? 'completed' : 'pending']++;

            totals.total++;
            totals[isCompleted ? 'completed' : 'pending']++;
          }
        }

        if (totals.total > 0) {
          results.push({
            id: profile.id,
            name: profile.full_name || profile.email,
            email: profile.email,
            frequencies,
            totals,
          });
        }
      }

      return results;
    },
  });
};

export interface UnitSummary {
  id: string;
  name: string;
  code: string;
  description: string | null;
  completed: number;
  pending: number;
  total: number;
}

export const useUnitsSummary = (sectorId?: string | null) => {
  return useQuery({
    queryKey: ['units-summary', sectorId],
    refetchInterval: 5000,
    queryFn: async () => {
      // 1. Fetch all units
      const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('*')
        .order('name');

      if (unitsError) throw unitsError;

      // 2. Fetch all tasks (filtered by sector if needed)
      let tasksQuery = supabase
        .from('tasks')
        .select('status, unit_id');

      if (sectorId) {
        tasksQuery = tasksQuery.eq('sector_id', sectorId);
      }

      const { data: tasks, error: tasksError } = await tasksQuery;

      if (tasksError) throw tasksError;

      // 3. Aggregate stats in memory
      const tasksByUnit = new Map<string, { completed: number; pending: number; total: number }>();

      // Initialize map for all units (to ensure units with 0 tasks are tracked if needed, though we filter them out later)
      units?.forEach(u => {
        tasksByUnit.set(u.id, { completed: 0, pending: 0, total: 0 });
      });

      // Process tasks
      tasks?.forEach(task => {
        if (task.unit_id) {
          const stats = tasksByUnit.get(task.unit_id) || { completed: 0, pending: 0, total: 0 };

          if (task.status === 'concluida') {
            stats.completed++;
          } else {
            stats.pending++;
          }
          stats.total++;

          // Update map (in case it wasn't there before, though it should be if referring to valid unit)
          tasksByUnit.set(task.unit_id, stats);
        }
      });

      const summaries: UnitSummary[] = [];

      for (const unit of units || []) {
        const stats = tasksByUnit.get(unit.id) || { completed: 0, pending: 0, total: 0 };

        if (stats.total > 0 || !sectorId) {
          summaries.push({
            id: unit.id,
            name: unit.name,
            code: unit.code,
            description: unit.description,
            completed: stats.completed,
            pending: stats.pending,
            total: stats.total,
          });
        }
      }

      return summaries.filter(s => s.total > 0 || !sectorId);
    },
  });
};

export const useOverallStats = (sectorIds?: string[]) => {
  return useQuery({
    queryKey: ['overall-stats', sectorIds],
    refetchInterval: 5000,
    queryFn: async () => {
      let routineQuery = supabase
        .from('routines')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      if (sectorIds && sectorIds.length > 0) {
        routineQuery = routineQuery.in('sector_id', sectorIds);
      }

      const { count: routineCount } = await routineQuery;

      let tasksQuery = supabase
        .from('tasks')
        .select('status');

      if (sectorIds && sectorIds.length > 0) {
        tasksQuery = tasksQuery.in('sector_id', sectorIds);
      }

      const { data: tasks } = await tasksQuery;

      const total = tasks?.length || 0;
      const completed = tasks?.filter(t => t.status === 'concluida').length || 0;
      const pending = tasks?.filter(t => t.status !== 'concluida').length || 0;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        routineCount: routineCount || 0,
        taskCount: total,
        completed,
        pending,
        percentage,
      };
    },
  });
};

const getPeriodDates = (period: string) => {
  const now = new Date();
  switch (period) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'quarter': return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case 'year': return { start: startOfYear(now), end: endOfYear(now) };
    default: return null;
  }
};

export const useCustomPanelData = (panel: any) => {
  const { filters } = panel;

  return useQuery({
    queryKey: ['custom-panel-data', panel.id, filters],
    refetchInterval: 5000,
    queryFn: async () => {
      let tasksQuery = supabase.from('tasks').select('id, title, status, unit_id, assigned_to, routine_id, created_at, sector_id');
      if (filters.sector_id) tasksQuery = tasksQuery.in('sector_id', Array.isArray(filters.sector_id) ? filters.sector_id : [filters.sector_id]);
      if (filters.unit_id) tasksQuery = tasksQuery.in('unit_id', Array.isArray(filters.unit_id) ? filters.unit_id : [filters.unit_id]);
      if (filters.status && filters.status.length > 0) tasksQuery = tasksQuery.in('status', filters.status);

      const { data: tasks } = await tasksQuery;

      let unitsQuery = supabase.from('units').select('id, name, code').order('name');
      const { data: units } = await unitsQuery;

      const results = (units || []).map(unit => {
        const unitTasks = tasks?.filter(t => t.unit_id === unit.id) || [];
        const frequencies: any = {};
        FREQUENCIES.forEach(f => {
          frequencies[f] = { total: 0, completed: 0, pending: 0 };
        });
        return { id: unit.id, name: unit.name, frequencies, totals: { total: unitTasks.length, completed: 0, pending: 0 } };
      }).filter(u => u.totals.total > 0);

      return { results, tasks, units };
    }
  });
};
