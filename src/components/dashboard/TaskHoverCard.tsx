import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TaskHoverCardProps {
    task: any;
    routine: any;
    isAllowed: boolean;
    handleReopenTask: (taskId: string) => void;
    updateTaskMutationPending: boolean;
}

export const TaskHoverCard = ({
    task,
    routine,
    isAllowed,
    handleReopenTask,
    updateTaskMutationPending
}: TaskHoverCardProps) => {
    const [note, setNote] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNote = async () => {
            setLoading(true);
            try {
                if (!task.due_date || !task.routine_id) {
                    setNote("Sem comentários preenchidos.");
                    setLoading(false);
                    return;
                }

                // Safely convert due_date to target point to find the correct period
                const dateObj = new Date(task.due_date);
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                const safeDateString = `${year}-${month}-${day}`;
                const targetPoint = `${safeDateString}T12:00:00Z`;

                // Find the period first using robust T12:00:00Z bounds
                const { data: periodData } = await supabase
                    .from('routine_periods')
                    .select('id')
                    .eq('routine_id', task.routine_id)
                    .lte('period_start', targetPoint)
                    .gte('period_end', targetPoint)
                    .maybeSingle();

                if (periodData) {
                    const { data: checkinData } = await supabase
                        .from('routine_checkins')
                        .select('notes')
                        .eq('routine_period_id', periodData.id)
                        .eq('unit_id', task.unit_id)
                        .maybeSingle();

                    if (checkinData && checkinData.notes && checkinData.notes.trim() !== '') {
                        setNote(checkinData.notes);
                    } else {
                        setNote(null);
                    }
                } else {
                    setNote(null);
                }
            } catch (error) {
                console.error("Error fetching task note:", error);
            } finally {
                setLoading(false);
            }
        };

        if (task.status === 'concluida') {
            fetchNote();
        } else {
            setLoading(false);
        }
    }, [task]);

    return (
        <div className="space-y-2 text-left w-full overflow-hidden">
            <h4 className="text-sm font-semibold truncate">Tarefa Concluída</h4>
            <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words border-l-2 pl-2 border-success/50 bg-success/5 p-2 rounded-r-md max-h-[150px] overflow-y-auto w-full custom-scrollbar">
                {loading ? (
                    <span className="flex items-center text-muted-foreground/70"><Loader2 className="w-3 h-3 animate-spin mr-2" /> Carregando nota...</span>
                ) : note ? (
                    note
                ) : (
                    "Sem comentários preenchidos no encerramento da rotina."
                )}
            </div>
            {isAllowed && (
                <div className="pt-2 border-t mt-2 w-full">
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 border-yellow-500/30"
                        onClick={(e) => { e.stopPropagation(); handleReopenTask(task.id); }}
                        disabled={updateTaskMutationPending}
                    >
                        {updateTaskMutationPending ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                        Reabrir Tarefa
                    </Button>
                </div>
            )}
        </div>
    );
};
