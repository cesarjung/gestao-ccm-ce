import { LayoutDashboard, Calendar, Users, Building2, Settings, ChevronLeft, ChevronRight, LogOut, Columns3, GanttChart, CalendarDays, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import sirtecLogo from '@/assets/sirtec-logo.jpg';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tarefas', icon: ClipboardList },
  { id: 'routines', label: 'Rotinas', icon: Calendar },
  { id: 'responsibles', label: 'Minhas Tarefas', icon: Users },
  { id: 'kanban', label: 'Kanban', icon: Columns3 },
  { id: 'gantt', label: 'Gantt', icon: GanttChart },
  { id: 'calendar', label: 'Calendário', icon: CalendarDays },
  { id: 'units', label: 'Unidades', icon: Building2 },
];

export const Sidebar = ({ activeView, onViewChange }: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();

  return (
    <aside
      className={cn(
        'h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <img src={sirtecLogo} alt="Sirtec" className="h-8 w-8 object-contain" />
            <span className="font-semibold text-sidebar-foreground">Gestão CCM</span>
          </div>
        ) : (
          <img src={sirtecLogo} alt="Sirtec" className="h-8 w-8 object-contain" />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary shadow-glow'
                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-primary')} />
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        {!collapsed && user && (
          <div className="px-3 py-2 text-sm text-muted-foreground truncate">
            {user.email}
          </div>
        )}
        <button
          onClick={() => onViewChange('settings')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
            activeView === 'settings'
              ? 'bg-sidebar-accent text-sidebar-primary shadow-glow'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
          )}
        >
          <Settings className={cn('w-5 h-5 flex-shrink-0', activeView === 'settings' && 'text-primary')} />
          {!collapsed && <span className="font-medium">Configurações</span>}
        </button>
        <button
          onClick={signOut}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors'
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
};
