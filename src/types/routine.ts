export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export type TaskStatus = 'pending' | 'completed';

export interface Subtask {
  id: string;
  title: string;
  unit: string;
  responsible: string;
  status: TaskStatus;
}

export interface Task {
  id: string;
  title: string;
  frequency: Frequency;
  subtasks: Subtask[];
}

export interface UnitSummary {
  name: string;
  completed: number;
  pending: number;
  total: number;
}

export interface ResponsibleSummary {
  name: string;
  completed: number;
  pending: number;
  total: number;
}

export const frequencyLabels: Record<Frequency, string> = {
  daily: 'Diárias',
  weekly: 'Semanais',
  biweekly: 'Quinzenais',
  monthly: 'Mensais',
};

export const frequencyColors: Record<Frequency, string> = {
  daily: 'from-primary to-blue-600',
  weekly: 'from-emerald-500 to-teal-600',
  biweekly: 'from-amber-500 to-orange-600',
  monthly: 'from-violet-500 to-purple-600',
};
