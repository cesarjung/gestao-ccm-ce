import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Paperclip, X, FileText, FileImage, Loader2, ExternalLink, Clock, File as FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface AttachmentsListProps {
    noteId?: string;
    pendingFiles?: File[];
    onAddPending?: (file: File) => void;
    onRemovePending?: (index: number) => void;
}

export const AttachmentsList = ({ noteId, pendingFiles = [], onAddPending, onRemovePending }: AttachmentsListProps) => {
    const queryClient = useQueryClient();
    const [isUploading, setIsUploading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const { data: attachments, isLoading } = useQuery({
        queryKey: ['note-attachments', noteId],
        queryFn: async () => {
            if (!noteId) return [];
            const { data, error } = await supabase
                .from('note_attachments')
                .select('*')
                .eq('note_id', noteId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },
        enabled: !!noteId
    });

    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            if (!noteId) return;

            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const fileName = `${Math.random().toString(36).substring(2)}_${safeName}`;
            const filePath = `${noteId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('notes')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { error: dbError } = await supabase
                .from('note_attachments')
                .insert({
                    note_id: noteId,
                    file_name: file.name, // Storing original name
                    file_path: filePath,
                    file_type: file.type,
                    file_size: file.size,
                });

            if (dbError) throw dbError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['note-attachments', noteId] });
            toast.success('Arquivo anexado');
        },
        onError: () => {
            toast.error('Erro ao anexar');
        },
        onSettled: () => {
            setIsUploading(false);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('note_attachments')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['note-attachments', noteId] });
            toast.success('Anexo removido');
        },
        onError: () => {
            toast.error('Erro ao remover anexo');
        }
    });

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (noteId) {
            setIsUploading(true);
            uploadMutation.mutate(file);
        } else if (onAddPending) {
            onAddPending(file);
        }
        e.target.value = '';
    };

    // --- SAFE MODE DOWNLOAD ---
    // No external dependencies, just pure Browser API
    const handleDownload = async (path: string, fileName: string) => {
        if (isDownloading) return;

        try {
            setIsDownloading(true);
            toast.info(`Baixando: ${fileName}`);
            console.log(`[Download] Starting for ${fileName} from ${path}`);

            const { data, error } = await supabase.storage
                .from('notes')
                .download(path);

            if (error) throw error;
            if (!data) throw new Error('Dados vazios');

            // Using Blob + URL.createObjectURL
            // This is the most reliable way to handle client-side downloads
            // without worrying about Supabase Content-Disposition headers or cors.
            const blob = new Blob([data], { type: data.type || 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = fileName; // Force filename

            // Append to body to ensure click works in all browsers
            document.body.appendChild(link);
            link.click();

            // Clean up
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 500);

        } catch (error: any) {
            console.error('[Download] Error:', error);
            toast.error(`Erro: ${error.message}`);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleOpenInNewTab = (path: string) => {
        const { data } = supabase.storage.from('notes').getPublicUrl(path);
        if (data?.publicUrl) {
            window.open(data.publicUrl, '_blank');
        }
    };

    const getFileIcon = (type: string | null) => {
        if (type?.startsWith('image/')) return <FileImage className="w-4 h-4 text-blue-500" />;
        if (type?.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />;
        return <FileIcon className="w-4 h-4 text-gray-500" />; // Valid component now
    };

    if (isLoading && noteId) return <div className="text-xs text-muted-foreground animate-pulse">Carregando anexos...</div>;

    return (
        <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium flex items-center gap-2">
                    <Paperclip className="w-4 h-4" /> Anexos
                </h4>
                <div>
                    <input
                        type="file"
                        id={`attachment-upload-${noteId || 'new'}`}
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isUploading}
                        onClick={() => document.getElementById(`attachment-upload-${noteId || 'new'}`)?.click()}
                    >
                        {isUploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Paperclip className="w-3 h-3 mr-1" />}
                        Adicionar
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {pendingFiles.map((file, idx) => (
                    <div
                        key={`pending-${idx}`}
                        className="flex items-center justify-between p-2 rounded-md border border-dashed border-muted-foreground/50 bg-muted/10 opacity-70"
                    >
                        <div className="flex items-center gap-2 overflow-hidden flex-1">
                            <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                            <span className="text-sm truncate max-w-[140px] block italic" title={file.name}>{file.name}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => onRemovePending && onRemovePending(idx)}
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    </div>
                ))}

                {attachments?.map((att) => (
                    <div
                        key={att.id}
                        className="flex items-center justify-between p-2 rounded-md border border-border bg-muted/20 hover:bg-muted/40 transition-colors group cursor-pointer"
                        onDoubleClick={() => handleDownload(att.file_path, att.file_name)}
                        title="Clique duplo para baixar"
                    >
                        <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => handleDownload(att.file_path, att.file_name)}>
                            <div className="shrink-0">
                                {getFileIcon(att.file_type)}
                            </div>
                            <span className="text-sm truncate max-w-[140px] block">{att.file_name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-primary transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenInNewTab(att.file_path);
                                }}
                                title="Abrir em nova guia"
                            >
                                <ExternalLink className="w-3 h-3" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteMutation.mutate(att.id);
                                }}
                                title="Remover anexo"
                            >
                                <X className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
