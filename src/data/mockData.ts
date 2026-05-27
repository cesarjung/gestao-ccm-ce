import { Task, Subtask, Frequency } from '@/types/routine';

const units = ['Unidade Centro', 'Unidade Norte', 'Unidade Sul', 'Unidade Leste', 'Unidade Oeste'];
const responsibles = ['Carlos Silva', 'Maria Santos', 'João Oliveira', 'Ana Costa', 'Pedro Lima'];

const generateSubtasks = (taskId: string, count: number): Subtask[] => {
  return units.slice(0, count).map((unit, index) => ({
    id: `${taskId}-sub-${index}`,
    title: `Execução - ${unit}`,
    unit,
    responsible: responsibles[index % responsibles.length],
    status: Math.random() > 0.4 ? 'completed' : 'pending',
  }));
};

export const mockTasks: Task[] = [
  // Daily tasks
  {
    id: 'daily-1',
    title: 'Verificação de Caixa',
    frequency: 'daily',
    subtasks: generateSubtasks('daily-1', 5),
  },
  {
    id: 'daily-2',
    title: 'Conferência de Estoque',
    frequency: 'daily',
    subtasks: generateSubtasks('daily-2', 5),
  },
  {
    id: 'daily-3',
    title: 'Limpeza e Organização',
    frequency: 'daily',
    subtasks: generateSubtasks('daily-3', 5),
  },
  {
    id: 'daily-4',
    title: 'Atualização de Relatórios',
    frequency: 'daily',
    subtasks: generateSubtasks('daily-4', 4),
  },
  // Weekly tasks
  {
    id: 'weekly-1',
    title: 'Reunião de Equipe',
    frequency: 'weekly',
    subtasks: generateSubtasks('weekly-1', 5),
  },
  {
    id: 'weekly-2',
    title: 'Inventário Parcial',
    frequency: 'weekly',
    subtasks: generateSubtasks('weekly-2', 5),
  },
  {
    id: 'weekly-3',
    title: 'Manutenção Preventiva',
    frequency: 'weekly',
    subtasks: generateSubtasks('weekly-3', 3),
  },
  // Biweekly tasks
  {
    id: 'biweekly-1',
    title: 'Auditoria de Processos',
    frequency: 'biweekly',
    subtasks: generateSubtasks('biweekly-1', 5),
  },
  {
    id: 'biweekly-2',
    title: 'Treinamento de Equipe',
    frequency: 'biweekly',
    subtasks: generateSubtasks('biweekly-2', 4),
  },
  // Monthly tasks
  {
    id: 'monthly-1',
    title: 'Fechamento Mensal',
    frequency: 'monthly',
    subtasks: generateSubtasks('monthly-1', 5),
  },
  {
    id: 'monthly-2',
    title: 'Análise de Indicadores',
    frequency: 'monthly',
    subtasks: generateSubtasks('monthly-2', 5),
  },
  {
    id: 'monthly-3',
    title: 'Revisão de Metas',
    frequency: 'monthly',
    subtasks: generateSubtasks('monthly-3', 5),
  },
];

export const getTasksByFrequency = (frequency: Frequency): Task[] => {
  return mockTasks.filter(task => task.frequency === frequency);
};

export const getAllSubtasks = (): Subtask[] => {
  return mockTasks.flatMap(task => task.subtasks);
};

export const getUnitsSummary = () => {
  const subtasks = getAllSubtasks();
  const summary: Record<string, { completed: number; pending: number }> = {};

  subtasks.forEach(subtask => {
    if (!summary[subtask.unit]) {
      summary[subtask.unit] = { completed: 0, pending: 0 };
    }
    if (subtask.status === 'completed') {
      summary[subtask.unit].completed++;
    } else {
      summary[subtask.unit].pending++;
    }
  });

  return Object.entries(summary).map(([name, data]) => ({
    name,
    completed: data.completed,
    pending: data.pending,
    total: data.completed + data.pending,
  }));
};

export const getResponsiblesSummary = () => {
  const subtasks = getAllSubtasks();
  const summary: Record<string, { completed: number; pending: number }> = {};

  subtasks.forEach(subtask => {
    if (!summary[subtask.responsible]) {
      summary[subtask.responsible] = { completed: 0, pending: 0 };
    }
    if (subtask.status === 'completed') {
      summary[subtask.responsible].completed++;
    } else {
      summary[subtask.responsible].pending++;
    }
  });

  return Object.entries(summary).map(([name, data]) => ({
    name,
    completed: data.completed,
    pending: data.pending,
    total: data.completed + data.pending,
  }));
};

export const getFrequencySummary = () => {
  const frequencies: Frequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];
  
  return frequencies.map(freq => {
    const tasks = getTasksByFrequency(freq);
    const subtasks = tasks.flatMap(t => t.subtasks);
    const completed = subtasks.filter(s => s.status === 'completed').length;
    const pending = subtasks.filter(s => s.status === 'pending').length;
    
    return {
      frequency: freq,
      taskCount: tasks.length,
      completed,
      pending,
      total: completed + pending,
      percentage: subtasks.length > 0 ? Math.round((completed / subtasks.length) * 100) : 0,
    };
  });
};
