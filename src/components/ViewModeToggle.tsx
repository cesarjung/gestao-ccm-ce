import { List, Columns3, CalendarDays, GanttChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ViewMode } from '@/types/navigation';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const VIEW_OPTIONS = [
  { value: 'list' as ViewMode, label: 'Lista', icon: List },
  { value: 'kanban' as ViewMode, label: 'Quadro', icon: Columns3 },
  { value: 'calendar' as ViewMode, label: 'Calendário', icon: CalendarDays },
  { value: 'gantt' as ViewMode, label: 'Gantt', icon: GanttChart },
];

export const ViewModeToggle = ({ value, onChange }: ViewModeToggleProps) => {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as ViewMode)}>
      {VIEW_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm',
              value === option.value && 'bg-primary/10 text-primary'
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{option.label}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
};
