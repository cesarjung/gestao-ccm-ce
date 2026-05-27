export type ViewMode = 'list' | 'kanban' | 'calendar' | 'gantt';

export type NavigationContext =
  | { type: 'all-sectors' }
  | { type: 'my-tasks' }
  | { type: 'sector'; sectorId: string; folder?: string; frequency?: string }
  | { type: 'dashboard' }
  | { type: 'settings' }
  | { type: 'planejamento'; section: 'carteira' | 'carteira_dashboard' }
  | { type: 'planejamento_equipes'; section: 'carteira' }
  | { type: 'poste_turno'; section: 'carteira' }
  | { type: 'deslocamento'; section: 'carteira' }
  | { type: 'planejado_meta'; section: 'carteira' }
  | { type: 'cumprimento_planejamento'; section: 'carteira' }
  | { type: 'etapas'; section: 'carteira' }
  | { type: 'planejamento_semanal'; section: 'carteira' };

export interface NavigationState {
  context: NavigationContext;
  viewMode: ViewMode;
}

export const VIEW_CONFIG = {
  planejamento: {
    id: 'planejamento',
    label: 'Planejamento de Rota',
    icon: 'Map'
  },
  planejamento_equipes: {
    id: 'planejamento_equipes',
    label: 'Planejamento de Equipes',
    icon: 'Users'
  },
  poste_turno: {
    id: 'poste_turno',
    label: 'Poste/Turno',
    icon: 'Activity'
  },
  deslocamento: {
    id: 'deslocamento',
    label: 'Deslocamento',
    icon: 'Navigation'
  },
  planejado_meta: {
    id: 'planejado_meta',
    label: 'Planejado x Meta',
    icon: 'Target'
  },
  cumprimento_planejamento: {
    id: 'cumprimento_planejamento',
    label: 'Cumprimento Planejamento',
    icon: 'CheckCircle'
  },
  etapas: {
    id: 'etapas',
    label: 'Etapas',
    icon: 'Layers'
  },
  planejamento_semanal: {
    id: 'planejamento_semanal',
    label: 'Planejamento Semanal',
    icon: 'CalendarDays'
  }
} as const;
