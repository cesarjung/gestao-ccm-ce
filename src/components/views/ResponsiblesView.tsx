import { useState } from 'react';
import { useUserSubtasks } from '@/hooks/useSubtasks';
import { useCompleteSubtask, useAddSubtaskComment } from '@/hooks/useSubtaskMutations';
import { useProfiles } from '@/hooks/useProfiles';
import { ProgressBar } from '@/components/ProgressBar';
import { 
  CheckCircle2, 
  Clock, 
  User, 
  Loader2, 
  MessageSquare, 
  Paperclip,
  ChevronDown,
  ChevronUp,
  Send
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export const ResponsiblesView = () => {
  const { data: userSubtasks, isLoading } = useUserSubtasks();
  const { data: allProfiles } = useProfiles();
  const completeSubtask = useCompleteSubtask();
  const addComment = useAddSubtaskComment();
  
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Group subtasks by parent task
  const groupedByTask = userSubtasks?.reduce((acc, subtask) => {
    const taskId = subtask.task?.id || 'unknown';
    if (!acc[taskId]) {
      acc[taskId] = {
        task: subtask.task,
        subtasks: [],
      };
    }
    acc[taskId].subtasks.push(subtask);
    return acc;
  }, {} as Record<string, { task: typeof userSubtasks[0]['task']; subtasks: typeof userSubtasks }>);

  const toggleExpand = (subtaskId: string) => {
    setExpandedSubtasks(prev => {
      const next = new Set(prev);
      if (next.has(subtaskId)) {
        next.delete(subtaskId);
      } else {
        next.add(subtaskId);
      }
      return next;
    });
  };

  const handleToggleComplete = (subtaskId: string, currentState: boolean) => {
    completeSubtask.mutate({ subtaskId, isCompleted: !currentState });
  };

  const handleSendComment = (subtaskId: string) => {
    const content = commentInputs[subtaskId]?.trim();
    if (content) {
      addComment.mutate({ subtaskId, content });
      setCommentInputs(prev => ({ ...prev, [subtaskId]: '' }));
    }
  };

  const getTaskGroupStats = (subtasks: typeof userSubtasks) => {
    const total = subtasks?.length || 0;
    const completed = subtasks?.filter(s => s.is_completed).length || 0;
    return { total, completed, pending: total - completed };
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Minhas Tarefas</h1>
          <p className="text-muted-foreground">Subtarefas atribuídas a você</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const taskGroups = Object.values(groupedByTask || {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-1">Minhas Tarefas</h1>
        <p className="text-muted-foreground">Subtarefas atribuídas a você na sua unidade</p>
      </div>

      {taskGroups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma subtarefa atribuída a você</p>
        </div>
      ) : (
        <div className="space-y-6">
          {taskGroups.map((group, index) => {
            const stats = getTaskGroupStats(group.subtasks);
            const percentage = stats.total > 0
              ? Math.round((stats.completed / stats.total) * 100)
              : 0;
            const isRoutine = !!group.task?.routine;

            return (
              <div
                key={group.task?.id || index}
                className="rounded-xl border border-border bg-card shadow-card overflow-hidden animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      isRoutine ? "bg-accent/20" : "bg-primary/20"
                    )}>
                      <CheckCircle2 className={cn(
                        "w-5 h-5",
                        isRoutine ? "text-accent" : "text-primary"
                      )} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">
                          {group.task?.title || 'Tarefa'}
                        </h3>
                        {isRoutine && (
                          <Badge variant="outline" className="text-xs">
                            {group.task?.routine?.title}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {group.task?.unit?.name} • {stats.total} subtarefa{stats.total !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-xl font-bold',
                        percentage >= 70 ? 'text-success' : percentage >= 40 ? 'text-warning' : 'text-destructive'
                      )}
                    >
                      {percentage}%
                    </span>
                  </div>

                  <ProgressBar completed={stats.completed} total={stats.total} />

                  <div className="flex justify-between mt-2 text-xs">
                    <span className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="w-3 h-3" />
                      {stats.completed} concluídas
                    </span>
                    <span className="flex items-center gap-1 text-warning">
                      <Clock className="w-3 h-3" />
                      {stats.pending} pendentes
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {group.subtasks.map((subtask) => {
                    const isExpanded = expandedSubtasks.has(subtask.id);
                    
                    return (
                      <div key={subtask.id}>
                        <div
                          className={cn(
                            'px-4 py-3 flex items-center gap-3',
                            subtask.is_completed ? 'bg-success/5' : 'bg-background'
                          )}
                        >
                          <Checkbox
                            checked={subtask.is_completed || false}
                            onCheckedChange={() => handleToggleComplete(subtask.id, subtask.is_completed || false)}
                            disabled={completeSubtask.isPending}
                          />
                          <div className="flex-1">
                            <p className={cn(
                              "text-sm",
                              subtask.is_completed && "line-through text-muted-foreground"
                            )}>
                              {subtask.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(subtask.id)}>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                            </Collapsible>
                          </div>
                        </div>
                        
                        <Collapsible open={isExpanded}>
                          <CollapsibleContent>
                            <div className="px-4 py-3 bg-muted/30 border-t border-border space-y-3">
                              {/* Comments Section */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <MessageSquare className="h-3 w-3" />
                                  Comentários
                                </div>
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Adicionar comentário..."
                                    value={commentInputs[subtask.id] || ''}
                                    onChange={(e) => setCommentInputs(prev => ({ 
                                      ...prev, 
                                      [subtask.id]: e.target.value 
                                    }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSendComment(subtask.id);
                                      }
                                    }}
                                    className="flex-1 h-8 text-sm"
                                  />
                                  <Button 
                                    size="sm" 
                                    className="h-8"
                                    onClick={() => handleSendComment(subtask.id)}
                                    disabled={addComment.isPending || !commentInputs[subtask.id]?.trim()}
                                  >
                                    <Send className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>

                              {/* Attachments Section */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Paperclip className="h-3 w-3" />
                                  Anexos
                                </div>
                                <Button variant="outline" size="sm" className="h-8 text-xs">
                                  <Paperclip className="h-3 w-3 mr-1" />
                                  Adicionar anexo
                                </Button>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
