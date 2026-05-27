
import { CheckCircle2, Circle, Building2, Calendar, RefreshCw, MoreVertical, Check, Trash2, ChevronRight, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import type { Enums } from '@/integrations/supabase/types';

const statusConfig: Record<Enums<'task_status'>, { label: string; className: string }> = {
    pendente: { label: 'Pendente', className: 'bg-warning/20 text-warning border-warning/30' },
    em_andamento: { label: 'Em Andamento', className: 'bg-primary/20 text-primary border-primary/30' },
    concluida: { label: 'Concluída', className: 'bg-success/20 text-success border-success/30' },
    atrasada: { label: 'Atrasada', className: 'bg-destructive/20 text-destructive border-destructive/30' },
    cancelada: { label: 'Cancelada', className: 'bg-muted text-muted-foreground border-muted' },
    nao_aplicavel: { label: 'N/A', className: 'bg-secondary text-muted-foreground border-secondary' },
};

const priorityConfig: Record<number, { label: string; className: string }> = {
    1: { label: 'Baixa', className: 'text-muted-foreground' },
    2: { label: 'Normal', className: 'text-foreground' },
    3: { label: 'Média', className: 'text-warning' },
    4: { label: 'Alta', className: 'text-orange-500' },
    5: { label: 'Urgente', className: 'text-destructive' },
};

const frequencyLabels: Record<string, string> = {
    diaria: 'Diária',
    semanal: 'Semanal',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal',
    anual: 'Anual',
};

interface TaskRowItemProps {
    task: any;
    isSelected?: boolean;
    onToggleSelect?: (id: string) => void;
    onDelete?: (id: string) => void;
    onStatusChange?: (id: string, status: Enums<'task_status'>) => void;
    onClick?: () => void;
    hideSelection?: boolean;
    comment?: string | null;
    disableStrikethrough?: boolean;
}

export const TaskRowItem = ({
    task,
    isSelected = false,
    onToggleSelect,
    onDelete,
    onStatusChange,
    onClick,
    hideSelection = false,
    comment,
    disableStrikethrough = false
}: TaskRowItemProps) => {

    const statusInfo = statusConfig[task.status as Enums<'task_status'>] || statusConfig.pendente;
    const priorityInfo = priorityConfig[task.priority || 1] || priorityConfig[1];

    // Determine date to display: Due Date > Start Date > Created At
    const displayDate = task.due_date || task.start_date || task.created_at;
    const dateLabel = task.due_date ? 'Prazo: ' : task.start_date ? 'Início: ' : 'Criado: ';

    return (
        <div
            className={cn(
                'w-full text-left p-2 border-b border-border transition-colors group flex items-start gap-3', // Reduced padding p-4->p-2, gap-4->gap-3
                isSelected ? 'bg-primary/10' : 'hover:bg-secondary/50',
                onClick && 'cursor-pointer'
            )}
            onClick={(e) => {
                // Prevent clicking strictly on actions from triggering the row click
                if ((e.target as HTMLElement).closest('button')) return;
                if (onClick) onClick();
            }}
        >
            {/* SELEÇÃO */}
            {!hideSelection && onToggleSelect && (
                <button
                    onClick={(e) => {
                        onToggleSelect(task.id);
                    }}
                    className="mt-0.5 flex-shrink-0" /* Adjusted margin */
                >
                    {isSelected ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" /> /* Reduced icon size */
                    ) : (
                        <Circle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                    )}
                </button>
            )}

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2"> {/* items-start -> items-center for compactness */}
                    <h3 className={cn('font-medium text-sm text-foreground truncate', task.status === 'concluida' && !disableStrikethrough && 'line-through text-muted-foreground')}> {/* Added text-sm, truncate */}
                        {task.title}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5", statusInfo.className)}>{statusInfo.label}</Badge> {/* Smaller Badge */}
                        {/* Recurrence Badge */}
                        {task.is_recurring && (
                            <div className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0 rounded-full border border-blue-100 shrink-0 h-5">
                                <RefreshCw className="w-2.5 h-2.5" />
                                <span className="truncate max-w-[60px]">
                                    {frequencyLabels[task.recurrence_frequency] || task.recurrence_frequency}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Comment Display */}
                {comment && (
                    <div className="flex items-center gap-1 mt-0.5 ml-0">
                        <MessageSquare className="w-2.5 h-2.5 text-blue-500 flex-shrink-0" />
                        <span className="text-[10px] text-blue-600 font-medium break-words leading-tight">
                            {comment}
                        </span>
                    </div>
                )}

                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground"> {/* text-xs -> text-[10px], gap-4 -> gap-3 */}
                    {displayDate && (
                        <span className="flex items-center gap-1" title={dateLabel + format(new Date(displayDate), 'dd/MM/yyyy HH:mm')}>
                            <Calendar className="h-3 w-3" />
                            {format(new Date(displayDate), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                    )}
                    {task.unit && (
                        <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{task.unit.name}</span>
                    )}
                    {task.routine && (
                        <span className="flex items-center gap-1">
                            <RefreshCw className="h-3 w-3" />
                            {task.routine.title}
                        </span>
                    )}
                    <span className={cn('flex items-center gap-1', priorityInfo.className)}>
                        Prioridade: {priorityInfo.label}
                    </span>

                    {/* Assignees Display */}
                    {(task.assignees && task.assignees.length > 0) && (
                        <div className="flex items-center -space-x-1.5">
                            {task.assignees.slice(0, 3).map((assignee: any) => (
                                <div key={assignee.id} className="h-5 w-5 rounded-full border border-background overflow-hidden" title={assignee.full_name}>
                                    {assignee.avatar_url ? (
                                        <img src={assignee.avatar_url} alt={assignee.full_name} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="h-full w-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500">
                                            {assignee.full_name?.substring(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {task.assignees.length > 3 && (
                                <div className="h-5 w-5 rounded-full border border-background bg-slate-100 flex items-center justify-center text-[8px] font-medium text-slate-600">
                                    +{task.assignees.length - 3}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ACTIONS */}
            <div className="flex items-center gap-1">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0"> {/* Smaller button */}
                            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {onStatusChange && (
                            <DropdownMenuItem onClick={() => onStatusChange(task.id, 'concluida')}>
                                <Check className="mr-2 h-4 w-4" /> Concluir
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {onDelete && (
                            <DropdownMenuItem onClick={() => onDelete(task.id)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                {/* Chevrons hidden or kept small? Kept small */}
                {/* Removed Chevrons to save space/clean up as they were mostly for mobile expansion indication but row is clickable */}
                {/* User didn't ask to remove chevrons but "compact". Keeping them but smaller if needed. */}
                {/* Actually, let's keep logic but maybe hide if truly compact? The code had them. I will keep them but cleaner. */}
                {hideSelection && (
                    <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0')} />
                )}
                {!hideSelection && (
                    <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', isSelected && 'text-primary')} />
                )}
            </div>
        </div>
    );
};
