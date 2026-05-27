import { useState, useEffect } from 'react';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useBulkUpdateTasks } from '@/hooks/useTasks';
import { useUpdateTask } from '@/hooks/useTaskMutations';

interface BulkRoutineCompletionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedRoutineIds: string[];
    onSuccess: () => void;
}

export const BulkRoutineCompletionDialog = ({
    open,
    onOpenChange,
    selectedRoutineIds,
    onSuccess,
}: BulkRoutineCompletionDialogProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const [pendingCount, setPendingCount] = useState<number>(0);
    const [parentTasks, setParentTasks] = useState<{ id: string }[]>([]);

    const bulkUpdateTasks = useBulkUpdateTasks();
    const updateTask = useUpdateTask();

    // Reset state when dialog opens
    useEffect(() => {
        if (open && selectedRoutineIds.length > 0) {
            calculatePendingTasks();
        }
    }, [open, selectedRoutineIds]);

    const calculatePendingTasks = async () => {
        setIsCalculating(true);
        try {
            // 1. Get Parent Tasks for selected routines
            const { data: parents } = await supabase
                .from('tasks')
                .select('id')
                .in('routine_id', selectedRoutineIds)
                .is('parent_task_id', null);

            const pTasks = parents || [];
            setParentTasks(pTasks);

            if (pTasks.length === 0) {
                setPendingCount(0);
                setIsCalculating(false);
                return;
            }

            const parentIds = pTasks.map(t => t.id);

            // 2. Count pending child tasks for these parents
            const { count } = await supabase
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .in('parent_task_id', parentIds)
                .neq('status', 'concluida')
                .neq('status', 'nao_aplicavel');

            setPendingCount(count || 0);

        } catch (error) {
            console.error("Error calculating pending tasks:", error);
            toast.error("Erro ao calcular tarefas pendentes.");
        } finally {
            setIsCalculating(false);
        }
    };

    const handleCloseWithoutResolving = async () => {
        if (parentTasks.length === 0) {
            onSuccess();
            onOpenChange(false);
            return;
        }

        setIsLoading(true);
        try {
            // Update parent tasks individually to trigger side effects (recurrence, etc)
            await Promise.all(parentTasks.map(task =>
                updateTask.mutateAsync({
                    id: task.id,
                    status: 'concluida'
                })
            ));

            toast.success(`${selectedRoutineIds.length} rotinas encerradas! Tarefas pendentes mantidas.`);
            onSuccess();
            onOpenChange(false);
        } catch (error) {
            toast.error("Erro ao encerrar rotinas.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCloseResolvingAll = async () => {
        if (parentTasks.length === 0) {
            onSuccess();
            onOpenChange(false);
            return;
        }

        setIsLoading(true);
        try {
            const parentIds = parentTasks.map(t => t.id);

            // 1. Find all pending child tasks
            const { data: pendingChildren } = await supabase
                .from('tasks')
                .select('id')
                .in('parent_task_id', parentIds)
                .neq('status', 'concluida')
                .neq('status', 'nao_aplicavel');

            // 2. Mark children as completed (Bulk is fine here)
            if (pendingChildren && pendingChildren.length > 0) {
                await bulkUpdateTasks.mutateAsync({
                    taskIds: pendingChildren.map(t => t.id),
                    status: 'concluida'
                });
            }

            // 3. Mark parent tasks as completed using useUpdateTask to trigger Recurrence
            await Promise.all(parentIds.map(id =>
                updateTask.mutateAsync({
                    id,
                    status: 'concluida'
                })
            ));

            toast.success(`${selectedRoutineIds.length} rotinas encerradas! Todas as tarefas foram concluídas.`);
            onSuccess();
            onOpenChange(false);
        } catch (error) {
            console.error("Error resolving all:", error);
            toast.error("Erro ao encerrar rotinas.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Encerrar {selectedRoutineIds.length} Rotina(s)</AlertDialogTitle>
                    <AlertDialogDescription>
                        {isCalculating ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Verificando tarefas pendentes...
                            </span>
                        ) : pendingCount > 0 ? (
                            <>
                                Existem <strong>{pendingCount} tarefa(s) pendente(s)</strong> vinculadas a estas rotinas.
                                Como deseja encerrar?
                            </>
                        ) : (
                            'Todas as tarefas já estão concluídas. Deseja encerrar as rotinas selecionadas?'
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {!isCalculating && (
                    <AlertDialogFooter className="flex flex-col sm:flex-col gap-2 sm:space-x-0 w-full">
                        <div className="flex-1" />
                        <AlertDialogCancel className="mt-0 w-full sm:w-auto">Cancelar</AlertDialogCancel>

                        {pendingCount > 0 && (
                            <Button
                                variant="outline"
                                onClick={handleCloseWithoutResolving}
                                disabled={isLoading}
                                className="w-full sm:w-auto"
                            >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Encerrar Sem Resolver
                            </Button>
                        )}

                        <Button
                            onClick={handleCloseResolvingAll}
                            disabled={isLoading}
                            className="bg-success hover:bg-success/90 w-full sm:w-auto whitespace-nowrap"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                            {pendingCount > 0 ? 'Encerrar Resolvendo Todas' : 'Encerrar'}
                        </Button>
                    </AlertDialogFooter>
                )}
            </AlertDialogContent>
        </AlertDialog>
    );
};
