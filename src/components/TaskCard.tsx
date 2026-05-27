import { useState } from 'react';
import { Task } from '@/types/routine';
import { cn } from '@/lib/utils';
import { ChevronDown, CheckCircle2, Clock, Users } from 'lucide-react';
import { ProgressBar } from './ProgressBar';

interface TaskCardProps {
  task: Task;
  delay?: number;
}

export const TaskCard = ({ task, delay = 0 }: TaskCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const completed = task.subtasks.filter((s) => s.status === 'completed').length;
  const total = task.subtasks.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      className="rounded-xl border border-border bg-card shadow-card overflow-hidden animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold',
              percentage === 100
                ? 'bg-success/20 text-success'
                : percentage >= 50
                ? 'bg-warning/20 text-warning'
                : 'bg-destructive/20 text-destructive'
            )}
          >
            {percentage}%
          </div>
          <div className="text-left">
            <h4 className="font-semibold text-foreground">{task.title}</h4>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {total} unidades
              </span>
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="w-3 h-3" />
                {completed}
              </span>
              <span className="flex items-center gap-1 text-warning">
                <Clock className="w-3 h-3" />
                {total - completed}
              </span>
            </div>
          </div>
        </div>

        <ChevronDown
          className={cn(
            'w-5 h-5 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-border">
          <div className="p-4">
            <ProgressBar completed={completed} total={total} className="mb-4" />

            <div className="space-y-2">
              {task.subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-colors',
                    subtask.status === 'completed'
                      ? 'bg-success/5 border-success/20'
                      : 'bg-warning/5 border-warning/20'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {subtask.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : (
                      <Clock className="w-5 h-5 text-warning" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{subtask.unit}</p>
                      <p className="text-xs text-muted-foreground">{subtask.responsible}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium px-2 py-1 rounded-full',
                      subtask.status === 'completed'
                        ? 'bg-success/20 text-success'
                        : 'bg-warning/20 text-warning'
                    )}
                  >
                    {subtask.status === 'completed' ? 'Concluído' : 'Pendente'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
