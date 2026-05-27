import { useState } from 'react';
import { Send, User as UserIcon, Calendar, MessageSquare, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTaskHistory, useTaskComments, useAddTaskComment } from '@/hooks/useTaskEnhancements';
import { useRoutineHistory, useRoutineComments, useAddRoutineComment } from '@/hooks/useRoutineEnhancements';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HistoryTabProps {
    taskId?: string;
    routineId?: string;
}

export const HistoryTab = ({ taskId, routineId }: HistoryTabProps) => {
    const [commentText, setCommentText] = useState('');

    // Task Hooks
    const { data: taskHistory, isLoading: taskHistoryLoading } = useTaskHistory(taskId || '');
    const { data: taskComments, isLoading: taskCommentsLoading } = useTaskComments(taskId || '');
    const addTaskComment = useAddTaskComment();

    // Routine Hooks
    const { data: routineHistory, isLoading: routineHistoryLoading } = useRoutineHistory(routineId || '');
    const { data: routineComments, isLoading: routineCommentsLoading } = useRoutineComments(routineId || '');
    const addRoutineComment = useAddRoutineComment();

    const isRoutine = !!routineId;
    const history = isRoutine ? routineHistory : taskHistory;
    const isLoading = isRoutine ? (routineHistoryLoading || routineCommentsLoading) : (taskHistoryLoading || taskCommentsLoading);
    const isPending = isRoutine ? addRoutineComment.isPending : addTaskComment.isPending;

    const handleSendComment = () => {
        if (!commentText.trim()) return;

        if (isRoutine && routineId) {
            addRoutineComment.mutate({ routineId, content: commentText }, { onSuccess: () => setCommentText('') });
        } else if (taskId) {
            addTaskComment.mutate({ taskId, content: commentText }, { onSuccess: () => setCommentText('') });
        }
    };

    const timelineItems = history;

    if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground">Carregando histórico...</div>;

    return (
        <div className="flex flex-col space-y-4 p-1">
            {/* Input Area */}
            <div className="flex gap-2">
                <Textarea
                    placeholder="Escreva um comentário..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="min-h-[60px] resize-none"
                />
                <Button
                    className="h-auto self-end"
                    onClick={handleSendComment}
                    disabled={!commentText.trim() || isPending}
                >
                    <Send className="h-4 w-4" />
                </Button>
            </div>

            {/* Timeline */}
            <div className="space-y-6 relative pr-2">
                {/* Line */}
                <div className="absolute left-6 top-0 bottom-0 w-px bg-border -z-10" />

                {timelineItems?.map((item) => (
                    <div key={item.id} className="flex gap-4">
                        <Avatar className="h-8 w-8 border bg-background shrink-0">
                            {/* @ts-ignore - Supabase type join complexity */}
                            <AvatarImage src={item.user?.avatar_url || undefined} />
                            <AvatarFallback>{item.user?.full_name?.substring(0, 2).toUpperCase() || '?'}</AvatarFallback>
                        </Avatar>

                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{item.user?.full_name || 'Usuário'}</span>
                                <span className="text-xs text-muted-foreground">{format(new Date(item.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                            </div>

                            {item.action_type === 'comment' ? (
                                <div className="bg-secondary/30 p-3 rounded-lg text-sm border">
                                    {/* @ts-ignore - JSON parse */}
                                    {item.details?.snippet || 'Comentário sem texto'}
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                    <History className="h-3 w-3" />
                                    <span>
                                        {item.action_type === 'status_change' && `Alterou o status para ${item.details?.new_value}`}
                                        {item.action_type === 'create' && 'Criou a tarefa'}
                                        {item.action_type === 'upload' && 'Anexou um arquivo'}
                                        {item.action_type === 'checklist_add' && 'Adicionou item ao checklist'}
                                        {item.action_type === 'checklist_complete' && 'Marcou item do checklist'}
                                        {!['status_change', 'create', 'upload', 'checklist_add', 'checklist_complete', 'comment'].includes(item.action_type) && item.action_type}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {timelineItems?.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">Nenhuma atividade registrada.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
