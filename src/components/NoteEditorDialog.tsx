import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogHeader } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from './RichTextEditor';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { AttachmentsList } from './AttachmentsList';

interface NoteEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    note?: any;
    onSuccess: () => void;
    sectorId?: string;
}

export const NoteEditorDialog = ({ open, onOpenChange, note, onSuccess, sectorId }: NoteEditorDialogProps) => {
    const { user } = useAuth();
    const [title, setTitle] = useState('');
    // Initializing with valid Tiptap JSON structure matches schema expectation
    const [content, setContent] = useState<any>({ type: 'doc', content: [] });
    const [isPrivate, setIsPrivate] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Pending files for new notes
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);

    // Use this to force editor to remount if needed
    const [sessionId, setSessionId] = useState(Date.now());

    useEffect(() => {
        if (open) {
            setSessionId(Date.now());
            setPendingFiles([]); // Clear pending files
            if (note) {
                setTitle(note.title);
                setContent(note.content || { type: 'doc', content: [] });
                setIsPrivate(note.is_private || false);
            } else {
                setTitle('');
                setContent({ type: 'doc', content: [] });
                setIsPrivate(false);
            }
        }
    }, [open, note]);

    // Helper to upload a single file
    const uploadFile = async (noteId: string, file: File) => {
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
                file_name: file.name,
                file_path: filePath,
                file_type: file.type,
                file_size: file.size,
            });

        if (dbError) throw dbError;
    };

    const handleSave = async () => {
        if (!title.trim()) {
            toast.error('O título é obrigatório');
            return;
        }

        try {
            setIsSaving(true);
            if (!user?.id) {
                toast.error('Erro: Usuário não autenticado');
                return;
            }

            const noteData = {
                title,
                content,
                is_private: isPrivate,
                updated_at: new Date().toISOString(),
            };

            let savedNoteId = note?.id;

            if (savedNoteId) {
                // UPDATE existing note
                const { error } = await supabase
                    .from('notes')
                    .update(noteData)
                    .eq('id', savedNoteId);

                if (error) throw error;
                toast.success('Anotação atualizada!');
            } else {
                // INSERT new note
                const { data, error } = await supabase
                    .from('notes')
                    .insert({
                        ...noteData,
                        created_by: user.id,
                        sector_id: sectorId || null
                    })
                    .select()
                    .single();

                if (error) throw error;
                savedNoteId = data.id;
                toast.success('Anotação criada!');
            }

            // Process pending files if any
            if (pendingFiles.length > 0 && savedNoteId) {
                toast.info('Enviando anexos...');
                try {
                    await Promise.all(pendingFiles.map(file => uploadFile(savedNoteId, file)));
                    toast.success('Anexos enviados!');
                } catch (uploadErr) {
                    console.error('Error uploading pending files:', uploadErr);
                    toast.error('Nota salva, mas houve erro ao enviar alguns anexos.');
                }
            }

            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            console.error('Error saving note:', error);
            toast.error(`Erro ao salvar: ${error.message || 'Desconhecido'}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden" aria-describedby={undefined}>
                <div className="sr-only">
                    <DialogTitle>Editor de Anotação</DialogTitle>
                </div>
                <div className="p-6 pb-2 border-b border-border">
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Título da Anotação"
                        className="text-lg font-bold border-none focus-visible:ring-0 px-0 h-auto placeholder:text-muted-foreground/50 shadow-none"
                    />
                </div>

                <div className="flex-1 overflow-hidden p-6 pt-2 flex flex-col">
                    <div className="flex-1 overflow-hidden min-h-0">
                        <RichTextEditor
                            content={content}
                            onChange={setContent}
                        />
                    </div>

                    {/* Always show attachments area, passing pending files logic */}
                    <div className="mt-2 shrink-0 max-h-[150px] overflow-y-auto px-1">
                        <AttachmentsList
                            noteId={note?.id}
                            pendingFiles={pendingFiles}
                            onAddPending={(file) => setPendingFiles([...pendingFiles, file])}
                            onRemovePending={(index) => {
                                const newFiles = [...pendingFiles];
                                newFiles.splice(index, 1);
                                setPendingFiles(newFiles);
                            }}
                        />
                    </div>
                </div>

                <DialogFooter className="p-4 border-t border-border bg-muted/40 flex flex-row items-center justify-between sm:justify-between w-full">
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="private-note"
                            checked={isPrivate}
                            onCheckedChange={setIsPrivate}
                        />
                        <Label htmlFor="private-note" className="text-sm cursor-pointer select-none">
                            Anotação Privada
                        </Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? 'Salvando...' : 'Salvar Anotação'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
