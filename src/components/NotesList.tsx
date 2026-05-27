import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Calendar, Trash2, GripVertical, Lock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoteEditorDialog } from './NoteEditorDialog';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import {
    DndContext,
    DragEndEvent,
    useDraggable,
    DragOverlay,
    DragStartEvent,
    useSensor,
    useSensors,
    PointerSensor
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

// --- CONFIGURATION ---
const GRID_W = 240; // Card width (220) + gap (20)
const GRID_H = 220; // Card height (200) + gap (20)

// Helper to snap coordinates to grid
const snapToGrid = (x: number, y: number) => {
    return {
        x: Math.round(x / GRID_W) * GRID_W,
        y: Math.round(y / GRID_H) * GRID_H
    };
};

interface Note {
    id: string;
    title: string;
    content: any;
    updated_at: string;
    created_at: string;
    position_x: number;
    position_y: number;
    is_private?: boolean;
    created_by?: string;
}

// Draggable Note Card
const DraggableNoteCard = ({ note, onClick, onDelete, isOverlay = false }: { note: Note, onClick?: () => void, onDelete?: (e: any) => void, isOverlay?: boolean }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: note.id,
        data: { note }
    });

    // If it's the overlay, we don't use the absolute position relative to parent, 
    // we use the transform directly or just static style because DndKit handles the overlay position.
    // If it's the real card in the list, we position it absolutely using note.position_x/y

    const style = {
        // Apply Drag transformation
        // We use CSS.Translate for higher performance GPU movement
        transform: CSS.Translate.toString(transform),

        // Base Position
        left: !isOverlay ? (note.position_x || 0) : undefined,
        top: !isOverlay ? (note.position_y || 0) : undefined,
        position: !isOverlay ? 'absolute' as 'absolute' : undefined,

        width: '220px',
        height: '200px'
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group flex flex-col gap-3 p-4 rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow cursor-default touch-none",
                isDragging ? "opacity-30" : "opacity-100",
                isOverlay && "opacity-90 shadow-2xl scale-105 cursor-grabbing z-50 bg-background border-primary"
            )}
            onClick={onClick}
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className={cn(
                    "absolute right-2 top-2 p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors cursor-grab active:cursor-grabbing z-20",
                    !isOverlay && "opacity-0 group-hover:opacity-100"
                )}
            >
                <GripVertical className="w-4 h-4" />
            </div>

            <div className="flex items-start justify-between pl-2 pr-6">
                <h3 className="font-semibold line-clamp-1 select-none">{note.title}</h3>
            </div>

            <div className="flex-1 text-sm text-muted-foreground line-clamp-4 px-2 overflow-hidden pointer-events-none select-none">
                {note.content?.content ? (
                    note.content.content.map((block: any) => block.content?.map((c: any) => c.text).join(' ')).join(' ')
                ) : (
                    <span className="italic opacity-50">Sem conteúdo</span>
                )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border mt-auto px-2 relative z-10">
                <span className="text-xs text-muted-foreground flex items-center gap-1 select-none">
                    <Calendar className="h-3 w-3" />
                    {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true, locale: ptBR })}
                </span>

                {!isOverlay && onDelete && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(e);
                        }}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
};

export const NotesList = ({ sectorId }: { sectorId?: string }) => {
    const { user } = useAuth();
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedNote, setSelectedNote] = useState<any>(null);
    const [noteToDelete, setNoteToDelete] = useState<any>(null);
    const [activeDragNote, setActiveDragNote] = useState<Note | null>(null);
    const [activeTab, setActiveTab] = useState('public');

    // Optimistic notes allow us to update UI immediately while saving to DB
    const [optimisticNotes, setOptimisticNotes] = useState<Note[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    );

    const { data: notes, isLoading, refetch } = useQuery({
        queryKey: ['notes', sectorId],
        queryFn: async () => {
            let query = supabase
                .from('notes')
                .select('*')
                .order('created_at', { ascending: false }); // Fetch newest first

            if (sectorId) {
                query = query.eq('sector_id', sectorId);
            }

            const { data, error } = await query;

            if (error) throw error;
            return data as Note[];
        },
    });

    // Update optimistic notes when valid data arrives
    useEffect(() => {
        if (!notes) return;

        // "Smart Placement" Logic (running only once on fetch to initialize positions if missing/ranked)
        // If we detect positions are primarily small integers (0,1,2 - from the rank migration), 
        // we convert them to pixels.
        // Or if they are null, we find a spot.

        let occupied = new Set<string>();
        const toPixel = (n: Note) => {
            // Heuristic: if x < 50, assume it's a rank and needs conversion
            // Otherwise assume it's already a pixel coord
            let x = n.position_x ?? 0;
            let y = n.position_y ?? 0;

            // If it seems to be a rank (migrated data), convert to grid
            if (x < 50 && y < 50 && (x !== 0 || y !== 0)) {
                // Convert rank 'x' to grid coordinates
                // 4 columns per row assumption for initial migration
                const col = x % 4;
                const row = Math.floor(x / 4);
                x = col * GRID_W;
                y = row * GRID_H;
            }
            return { x, y };
        };

        // First pass: map existing valid positions
        const placed = notes.map(n => {
            const { x, y } = toPixel(n);
            return { ...n, position_x: x, position_y: y };
        });

        // Register occupied slots
        placed.forEach(n => {
            const key = `${Math.round(n.position_x / GRID_W)},${Math.round(n.position_y / GRID_H)}`;
            occupied.add(key);
        });

        // Second pass: fix collisions or placement for new/unpositioned notes (0,0 duplicates)
        // We iterate through and if we find a collision (mostly for 0,0), we move it to next slot.
        const finalized = placed.map((n, i) => {
            const key = `${Math.round(n.position_x / GRID_W)},${Math.round(n.position_y / GRID_H)}`;

            // If this slot is already taken by a PREVIOUS note in this list 
            // (and it's not THIS note's reserved spot - complicated check, simplifying: )
            // Actually, simplest way for 'new' notes:
            // If x=0, y=0, treat as unpositioned unless it's the very first note and truly at 0,0.
            // We'll trust the DB unless its 0,0.

            if (n.position_x === 0 && n.position_y === 0 && i > 0) {
                // Find first empty slot
                let row = 0;
                let col = 0;
                while (occupied.has(`${col},${row}`)) {
                    col++;
                    if (col >= 4) { // Max 4 cols then wrap
                        col = 0;
                        row++;
                    }
                }

                // Found spot
                occupied.add(`${col},${row}`);
                return { ...n, position_x: col * GRID_W, position_y: row * GRID_H };
            }

            return n;
        });

        setOptimisticNotes(finalized);
    }, [notes]);


    // Realtime
    useEffect(() => {
        const channel = supabase
            .channel('public:notes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => refetch())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [refetch]);


    const handleDragStart = (event: DragStartEvent) => {
        const note = optimisticNotes.find(n => n.id === event.active.id);
        if (note) setActiveDragNote(note);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, delta } = event;
        setActiveDragNote(null);

        const original = optimisticNotes.find(n => n.id === active.id);
        if (!original) return;

        // Calculate new raw position
        const rawX = (original.position_x || 0) + delta.x;
        const rawY = (original.position_y || 0) + delta.y;

        // Snap to Grid
        const snapped = snapToGrid(Math.max(0, rawX), Math.max(0, rawY));

        // Optimistic Update
        const updatedList = optimisticNotes.map(n =>
            n.id === active.id ? { ...n, position_x: snapped.x, position_y: snapped.y } : n
        );
        setOptimisticNotes(updatedList);

        // Persist
        const { error } = await supabase
            .from('notes')
            .update({ position_x: snapped.x, position_y: snapped.y })
            .eq('id', active.id);

        if (error) {
            console.error("Save pos failed", error);
            toast.error("Erro ao salvar posição");
        }
    };

    const handleDelete = async () => {
        if (!noteToDelete) return;
        try {
            const { error } = await supabase.from('notes').delete().eq('id', noteToDelete.id);
            if (error) throw error;
            toast.success('Anotação excluída');
            setOptimisticNotes(prev => prev.filter(n => n.id !== noteToDelete.id));
        } catch (e) {
            console.error(e);
            toast.error('Erro ao excluir');
        } finally {
            setNoteToDelete(null);
        }
    };

    if (isLoading && optimisticNotes.length === 0) {
        return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="h-full flex flex-col gap-6">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Quadros e Anotações</h2>
                    <p className="text-sm text-muted-foreground">Área livre: Arraste para organizar. Use a grade auxiliar.</p>
                </div>
                <div className="flex items-center gap-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="public" className="gap-2">
                                <Globe className="w-4 h-4" />
                                Quadro Público
                            </TabsTrigger>
                            <TabsTrigger value="private" className="gap-2">
                                <Lock className="w-4 h-4" />
                                Meu Quadro Privado
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Button onClick={() => { setSelectedNote(null); setIsEditorOpen(true); }} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Nova Anotação
                    </Button>
                </div>
            </div>

            <div className="flex-1 relative overflow-auto border border-border/50 rounded-xl bg-muted/5 shadow-inner">
                {/* Background Grid Pattern for guidance */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-10"
                    style={{
                        backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
                        backgroundSize: `${GRID_W}px ${GRID_H}px`
                    }}
                />

                <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <div className="absolute inset-0" style={{ minWidth: '100%', minHeight: '100%', width: 2000, height: 2000 }}>
                        {optimisticNotes.filter(n => activeTab === 'public' ? !n.is_private : (n.is_private && n.created_by === user?.id)).length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <p className="text-muted-foreground/40">O quadro está vazio</p>
                            </div>
                        )}

                        {optimisticNotes
                            .filter(n => activeTab === 'public' ? !n.is_private : (n.is_private && n.created_by === user?.id))
                            .map((note) => (
                                <DraggableNoteCard
                                    key={note.id}
                                    note={note}
                                    onClick={() => { setSelectedNote(note); setIsEditorOpen(true); }}
                                    onDelete={(e) => setNoteToDelete(note)}
                                />
                            ))}
                    </div>

                    <DragOverlay>
                        {activeDragNote ? (
                            <DraggableNoteCard note={activeDragNote} isOverlay />
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </div>

            <NoteEditorDialog
                open={isEditorOpen}
                onOpenChange={setIsEditorOpen}
                note={selectedNote}
                onSuccess={refetch}
                sectorId={sectorId}
            />

            <AlertDialog open={!!noteToDelete} onOpenChange={(open) => !open && setNoteToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir anotação?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
