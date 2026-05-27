import { useRef } from 'react';
import { Upload, File, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskAttachments, useUploadTaskAttachment, useDeleteTaskAttachment } from '@/hooks/useTaskEnhancements';
import { useRoutineAttachments, useUploadRoutineAttachment, useDeleteRoutineAttachment } from '@/hooks/useRoutineEnhancements';
import { format } from 'date-fns';

interface AttachmentsTabProps {
    taskId?: string;
    routineId?: string;
}

export const AttachmentsTab = ({ taskId, routineId }: AttachmentsTabProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Task Hooks
    const { data: taskAttachments, isLoading: taskLoading } = useTaskAttachments(taskId || '');
    const uploadTask = useUploadTaskAttachment();
    const deleteTask = useDeleteTaskAttachment();

    // Routine Hooks
    const { data: routineAttachments, isLoading: routineLoading } = useRoutineAttachments(routineId || '');
    const uploadRoutine = useUploadRoutineAttachment();
    const deleteRoutine = useDeleteRoutineAttachment();

    const isRoutine = !!routineId;
    const attachments = isRoutine ? routineAttachments : taskAttachments;
    const isLoading = isRoutine ? routineLoading : taskLoading;
    const isPending = isRoutine ? uploadRoutine.isPending : uploadTask.isPending;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (isRoutine && routineId) {
                uploadRoutine.mutate({ routineId, file });
            } else if (taskId) {
                uploadTask.mutate({ taskId, file });
            }
        }
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDelete = (id: string, path: string) => {
        if (isRoutine) {
            deleteRoutine.mutate({ id });
        } else {
            deleteTask.mutate({ id, path });
        }
    };

    if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground">Carregando anexos...</div>;

    return (
        <div className="space-y-4 p-1">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Arquivos</h3>
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    Anexar Arquivo
                </Button>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                />
            </div>

            <div className="grid gap-2">
                {attachments?.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-secondary/20 transition-colors">
                        <div className="h-10 w-10 bg-secondary/50 rounded flex items-center justify-center flex-shrink-0">
                            <File className="h-5 w-5 text-muted-foreground" />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate" title={file.file_name}>{file.file_name}</p>
                                <a href={file.file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                    Abrir <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{(file.file_size ? (file.file_size / 1024).toFixed(1) + ' KB' : 'Tamanho desconhecido')}</span>
                                <span>•</span>
                                <span>{format(new Date(file.created_at), 'dd/MM/yyyy HH:mm')}</span>
                            </div>
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(file.id, '')}
                            className="text-destructive hover:bg-destructive/10"
                            title="Remover arquivo"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}

                {attachments?.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg bg-secondary/10">
                        <Upload className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">Nenhum arquivo anexado.</p>
                        <p className="text-xs text-muted-foreground mt-1">Carregue documentos, imagens ou outros arquivos.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
