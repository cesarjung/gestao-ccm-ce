import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
    Calendar,
    Users,
    Flag,
    Check,
    Circle,
    Loader2,
    Trash2,
    Pencil,
    X,
    Building2,
    CheckCircle2,
    ChevronDown,
    RefreshCw,
    MessageSquare,
    Clock
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import type { Tables } from '@/integrations/supabase/types';
import { useUpdateTask, useDeleteTask } from '@/hooks/useTaskMutations';
import { TaskEditDialog } from './TaskEditDialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from './ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ChecklistTab } from './tabs/ChecklistTab';
import { AttachmentsTab } from './tabs/AttachmentsTab';
import { HistoryTab } from './tabs/HistoryTab';

interface TaskDetailPanelProps {
    task: Tables<'tasks'> & {
        unit?: { name: string; code: string } | null;
        assignees?: { id: string; full_name: string | null; email: string | null; avatar_url: string | null }[];
    };
    onClose: () => void;
}

const priorityConfig: Record<number, { label: string; className: string }> = {
    1: { label: 'Baixa', className: 'text-muted-foreground' },
    2: { label: 'Normal', className: 'text-foreground' },
    3: { label: 'Média', className: 'text-warning' },
    4: { label: 'Alta', className: 'text-orange-500' },
    5: { label: 'Urgente', className: 'text-destructive' },
};

const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?';
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};

const avatarColors = [
    'bg-pink-500',
    'bg-purple-500',
    'bg-indigo-500',
    'bg-blue-500',
    'bg-teal-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-orange-500',
    'bg-red-500',
];

const getAvatarColor = (id: string): string => {
    const index = id.charCodeAt(0) % avatarColors.length;
    return avatarColors[index];
};


export const TaskDetailPanel = ({ task, onClose }: TaskDetailPanelProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const deleteMutation = useDeleteTask();
    const updateMutation = useUpdateTask();
    const { user } = useAuth();

    // Local state for quick edit
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description || '');
    const [priority, setPriority] = useState<string>(task.priority?.toString() || '1');
    const [dueDate, setDueDate] = useState<string>(task.due_date?.split('T')[0] || '');


    // Comment Dialog State
    const [statusDialogOpen, setStatusDialogOpen] = useState(false);
    const [pendingStatus, setPendingStatus] = useState<'concluida' | 'nao_aplicavel' | 'pendente' | null>(null);
    const [comment, setComment] = useState('');

    const handleStatusChangeRequest = (newStatus: 'concluida' | 'nao_aplicavel' | 'pendente') => {
        setPendingStatus(newStatus);
        setComment('');
        setStatusDialogOpen(true);
    };

    const confirmStatusChange = () => {
        if (pendingStatus) {
            updateMutation.mutate({
                id: task.id,
                status: pendingStatus,
                comment: comment
            });
            setStatusDialogOpen(false);
        }
    };

    const handleSaveChanges = async () => {
        try {
            await updateMutation.mutateAsync({
                id: task.id,
                title,
                description,
                priority: parseInt(priority),
                due_date: dueDate || null
            });
            setIsEditing(false);
        } catch (e) {
            console.error("Failed to update task", e);
        }
    };

    const handleCancelEdit = () => {
        setTitle(task.title);
        setDescription(task.description || '');
        setPriority(task.priority?.toString() || '1');
        setDueDate(task.due_date?.split('T')[0] || '');
        setIsEditing(false);
    };


    const isCompleted = task.status === 'concluida';
    const isNA = task.status === 'nao_aplicavel';
    const isInProgress = task.status === 'em_andamento';
    const isPending = task.status === 'pendente';
    const isLate = task.status === 'atrasada';

    const priorityInfo = priorityConfig[task.priority || 1] || priorityConfig[1];

    return (
        <div className="bg-card border-l border-border h-full flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="p-6 border-b border-border">
                <div className="flex items-start justify-between mb-4">
                    {isEditing ? (
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="text-xl font-semibold"
                            placeholder="Título da tarefa"
                        />
                    ) : (
                        <h2 className="text-xl font-semibold text-foreground">{task.title}</h2>
                    )}

                    <div className="flex items-center gap-2">
                        {!isEditing && (
                            <>
                                <Button variant="ghost" size="sm" onClick={() => setEditDialogOpen(true)} title="Edição completa" className="text-primary hover:text-primary hover:bg-primary/10">
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
                                            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => { deleteMutation.mutate(task.id); onClose(); }} className="bg-destructive text-destructive-foreground">
                                                Excluir
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </>
                        )}
                        {isEditing && (
                            <>
                                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                                    <X className="h-4 w-4" />
                                </Button>
                                <Button size="sm" onClick={handleSaveChanges}>
                                    <Check className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                        <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
                    </div>
                </div>

                {/* Metadata Grid (Matching Routine Layout) */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                    {/* Status */}
                    <div className="flex items-center gap-3">
                        <Circle className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Status</span>
                        <div className={cn(
                            'ml-auto px-2 py-0.5 text-xs font-medium rounded-full border inline-flex items-center gap-1',
                            isCompleted ? 'bg-success/20 text-success border-success/30' :
                                isNA ? 'bg-muted text-muted-foreground border-muted' :
                                    isLate ? 'bg-destructive/20 text-destructive border-destructive/30' :
                                        isInProgress ? 'bg-primary/20 text-primary border-primary/30' :
                                            'bg-warning/20 text-warning border-warning/30'
                        )}>
                            {isCompleted ? 'CONCLUÍDA' :
                                isNA ? 'NÃO SE APLICA' :
                                    isLate ? 'ATRASADA' :
                                        isInProgress ? 'EM ANDAMENTO' : 'PENDENTE'}
                        </div>
                    </div>

                    {/* Priority */}
                    <div className="flex items-center gap-3">
                        <Flag className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Prioridade</span>
                        {isEditing ? (
                            <Select value={priority} onValueChange={setPriority}>
                                <SelectTrigger className="ml-auto w-32 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Baixa</SelectItem>
                                    <SelectItem value="2">Normal</SelectItem>
                                    <SelectItem value="3">Média</SelectItem>
                                    <SelectItem value="4">Alta</SelectItem>
                                    <SelectItem value="5">Urgente</SelectItem>
                                </SelectContent>
                            </Select>
                        ) : (
                            <span className={cn("ml-auto font-medium", priorityInfo.className)}>{priorityInfo.label}</span>
                        )}
                    </div>

                    {/* Unit */}
                    <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Unidade</span>
                        <span className="ml-auto text-foreground truncate max-w-[120px]" title={task.unit?.name}>{task.unit?.name || '---'}</span>
                    </div>

                    {/* Due Date */}
                    <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Vencimento</span>
                        {isEditing ? (
                            <Input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="ml-auto w-32 h-8"
                            />
                        ) : (
                            <span className="ml-auto text-foreground">{task.due_date ? format(new Date(task.due_date), 'dd/MM', { locale: ptBR }) : '---'}</span>
                        )}
                    </div>
                </div>

                {/* Big Action Button (Like Routine Panel) */}
                {!isEditing && (
                    <div className="mt-4 flex gap-2">
                        {isCompleted || isNA ? (
                            <Button
                                className="flex-1 gap-2 bg-yellow-500 hover:bg-yellow-600 text-white"
                                onClick={() => handleStatusChangeRequest('pendente')}
                                disabled={updateMutation.isPending}
                            >
                                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                Reabrir Tarefa
                            </Button>
                        ) : (
                            <>
                                <Button
                                    className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                                    onClick={() => handleStatusChangeRequest('concluida')}
                                    disabled={updateMutation.isPending}
                                >
                                    {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    Concluir Tarefa
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleStatusChangeRequest('nao_aplicavel')}
                                    disabled={updateMutation.isPending}
                                    title="Marcar como Não se Aplica"
                                >
                                    <X className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Description Section */}
            <div className="p-6 border-b border-border">
                {isEditing ? (
                    <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        className="resize-none"
                        placeholder="Descrição da tarefa..."
                    />
                ) : (
                    <div className="text-sm">
                        <p className="text-muted-foreground mb-1 font-medium">Descrição</p>
                        <p className="text-foreground whitespace-pre-wrap">{task.description || 'Sem descrição.'}</p>
                    </div>
                )}
            </div>

            {/* Tabs Section */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-6 pt-4 border-b border-border">
                        <TabsList className="w-full justify-start h-9 bg-transparent p-0">
                            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2">
                                Geral
                            </TabsTrigger>
                            <TabsTrigger value="checklist" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2">
                                Checklist
                            </TabsTrigger>
                            <TabsTrigger value="attachments" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2">
                                Arquivos
                            </TabsTrigger>
                            <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2">
                                Histórico
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-hidden p-0 flex flex-col">
                        <TabsContent value="overview" className="mt-0 h-full flex flex-col text-foreground/80">
                            {/* Responsibles (moved here) */}
                            <div className="flex-1 overflow-auto p-6 space-y-6">
                                {/* Responsibles (moved here) */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-4 h-4 text-primary" />
                                        <span className="text-sm font-medium">Responsáveis</span>
                                    </div>

                                    <div className="space-y-2">
                                        {task.assignees && task.assignees.length > 0 ? (
                                            task.assignees.map((assignee: any) => (
                                                <div key={assignee.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-secondary/20 transition-colors">
                                                    <Avatar className={cn('h-8 w-8', getAvatarColor(assignee.id))}>
                                                        <AvatarFallback className="text-white text-xs">{getInitials(assignee.full_name)}</AvatarFallback>
                                                        {assignee.avatar_url && <img src={assignee.avatar_url} alt={assignee.full_name} />}
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{assignee.full_name}</span>
                                                        <span className="text-xs text-muted-foreground">{assignee.email}</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                                                <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                                <p className="text-sm">Nenhum responsável atribuído.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="checklist" className="mt-0 h-full flex flex-col">
                            <div className="flex-1 overflow-auto p-6">
                                <ChecklistTab taskId={task.id} />
                            </div>
                        </TabsContent>

                        <TabsContent value="attachments" className="mt-0 h-full flex flex-col">
                            <div className="flex-1 overflow-auto p-6">
                                <AttachmentsTab taskId={task.id} />
                            </div>
                        </TabsContent>

                        <TabsContent value="history" className="mt-0 h-full flex flex-col">
                            <div className="flex-1 overflow-auto p-6">
                                <HistoryTab taskId={task.id} />
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            <TaskEditDialog
                task={task}
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
            />

            {/* Status Change Comment Dialog */}
            <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {pendingStatus === 'concluida' ? 'Concluir Tarefa' :
                                pendingStatus === 'nao_aplicavel' ? 'Marcar como Não se Aplica' : 'Reabrir Tarefa'}
                        </DialogTitle>
                        <DialogDescription>
                            Deseja adicionar um comentário?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            placeholder="Digite seu comentário (opcional)..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="resize-none"
                            rows={3}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={confirmStatusChange}
                            disabled={updateMutation.isPending}
                            className={cn(
                                pendingStatus === 'concluida' ? 'bg-success hover:bg-success/90' :
                                    pendingStatus === 'pendente' ? 'bg-primary hover:bg-primary/90' :
                                        'bg-destructive hover:bg-destructive/90'
                            )}
                        >
                            {updateMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Check className="h-4 w-4 mr-2" />
                            )}
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
