import { useState } from 'react';
import { Plus, Check, Trash2, Circle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChecklist, useAddChecklistItem, useToggleChecklistItem, useDeleteChecklistItem } from '@/hooks/useTaskEnhancements';
import { useRoutineChecklist, useAddRoutineChecklistItem, useToggleRoutineChecklistItem, useDeleteRoutineChecklistItem } from '@/hooks/useRoutineEnhancements';
import { cn } from '@/lib/utils';

interface ChecklistTabProps {
    taskId?: string;
    subtaskId?: string;
    routineId?: string;
}

export const ChecklistTab = ({ taskId, subtaskId, routineId }: ChecklistTabProps) => {
    const [newItemText, setNewItemText] = useState('');

    // Task Hooks
    const { data: taskItems, isLoading: taskLoading } = useChecklist(taskId, subtaskId);
    const addTaskItem = useAddChecklistItem();
    const toggleTaskItem = useToggleChecklistItem();
    const deleteTaskItem = useDeleteChecklistItem();

    // Routine Hooks
    const { data: routineItems, isLoading: routineLoading } = useRoutineChecklist(routineId);
    const addRoutineItem = useAddRoutineChecklistItem();
    const toggleRoutineItem = useToggleRoutineChecklistItem();
    const deleteRoutineItem = useDeleteRoutineChecklistItem();

    // Determine context
    const isRoutine = !!routineId;
    const items = isRoutine ? routineItems : taskItems;
    const isLoading = isRoutine ? routineLoading : taskLoading;
    const isPending = isRoutine ? addRoutineItem.isPending : addTaskItem.isPending;

    const handleAdd = () => {
        if (!newItemText.trim()) return;

        if (isRoutine && routineId) {
            addRoutineItem.mutate({ routineId, content: newItemText }, { onSuccess: () => setNewItemText('') });
        } else {
            addTaskItem.mutate({ taskId, subtaskId, content: newItemText }, { onSuccess: () => setNewItemText('') });
        }
    };

    const handleToggle = (id: string, isCompleted: boolean) => {
        if (isRoutine) {
            toggleRoutineItem.mutate({ id, isCompleted });
        } else {
            toggleTaskItem.mutate({ id, isCompleted });
        }
    };

    const handleDelete = (id: string) => {
        if (isRoutine) {
            deleteRoutineItem.mutate(id);
        } else {
            deleteTaskItem.mutate(id);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleAdd();
    };

    const completedCount = items?.filter(i => i.is_completed).length || 0;
    const totalCount = items?.length || 0;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground">Carregando checklist...</div>;

    return (
        <div className="space-y-4 p-1">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">Checklist</h3>
                {totalCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                        {completedCount}/{totalCount} ({progress}%)
                    </span>
                )}
            </div>

            {/* Progress Bar */}
            {totalCount > 0 && (
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                        className="h-full bg-success transition-all duration-500 ease-in-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
                <Input
                    placeholder="Adicionar item..."
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-9"
                />
                <Button size="sm" onClick={handleAdd} disabled={!newItemText.trim() || isPending}>
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            {/* List */}
            <div className="space-y-2 mt-2">
                {items?.map((item) => (
                    <div key={item.id} className="group flex items-center gap-3 p-2 rounded-md hover:bg-secondary/30 transition-colors border border-transparent hover:border-border/50">
                        <button
                            onClick={() => handleToggle(item.id, !item.is_completed)}
                            className="flex-shrink-0 focus:outline-none"
                        >
                            {item.is_completed ? (
                                <CheckCircle2 className="h-5 w-5 text-success" />
                            ) : (
                                <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                            )}
                        </button>

                        <span className={cn(
                            "flex-1 text-sm break-all",
                            item.is_completed && "text-muted-foreground line-through"
                        )}>
                            {item.content}
                        </span>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(item.id)}
                            className="opacity-0 group-hover:opacity-100 h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}

                {items?.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg bg-secondary/10">
                        <p className="text-sm">Nenhum item na checklist.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
