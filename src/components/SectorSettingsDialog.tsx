import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useSectors, useSectorMutations } from '@/hooks/useSectors';
import { useSectorUsers, useSectorUserMutations } from '@/hooks/useSectorUsers';
import { useProfiles } from '@/hooks/useProfiles';
import { Trash2, Users, Loader2, Save } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export interface SectorSettingsDialogProps {
    sectorId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isAdmin: boolean;
    isGestorOrAdmin?: boolean;
    currentUserId?: string;
}

export const SectorSettingsDialog = ({ sectorId, open, onOpenChange, isAdmin, isGestorOrAdmin, currentUserId }: SectorSettingsDialogProps) => {
    const { data: sectors } = useSectors();
    const { updateSector, deleteSector } = useSectorMutations();
    const { data: sectorUsers, isLoading: loadingUsers } = useSectorUsers(sectorId || undefined);
    const { addUserToSector, removeUserFromSector } = useSectorUserMutations();
    const { data: profiles } = useProfiles();

    const sector = sectors?.find(s => s.id === sectorId);

    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('#6366f1');
    const [isPrivate, setIsPrivate] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');

    useEffect(() => {
        if (sector && open) {
            setEditName(sector.name);
            setEditColor(sector.color || '#6366f1');
            setIsPrivate(!!sector.is_private);
        }
    }, [sector, open]);

    const handleUpdateSector = async () => {
        if (!sectorId || !editName.trim()) return;
        await updateSector.mutateAsync({
            id: sectorId,
            name: editName.trim(),
            color: editColor,
            is_private: isPrivate,
        });
        onOpenChange(false);
    };

    const handleDeleteSector = async () => {
        if (!sectorId) return;
        await deleteSector.mutateAsync(sectorId);
        onOpenChange(false);
    };

    const availableUsers = profiles?.filter(
        profile => !sectorUsers?.some(su => su.user_id === profile.id)
    ) || [];

    const handleAddUser = async () => {
        if (!sectorId || !selectedUserId) return;
        await addUserToSector.mutateAsync({ sectorId, userId: selectedUserId });
        setSelectedUserId('');
    };

    const handleRemoveUser = async (id: string, userId: string) => {
        if (!sectorId) return;
        if (userId === sector?.created_by) {
            // Optional: prevent removing the owner
            return;
        }
        await removeUserFromSector.mutateAsync({ id, sectorId });
    };

    const isOwner = sector?.created_by === currentUserId;
    const canManage = isAdmin || isGestorOrAdmin || isOwner;

    if (!sector) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Configurações do Espaço</DialogTitle>
                    <DialogDescription>
                        Edite os detalhes e membros do espaço "{sector.name}".
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 pt-4">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">Nome do Espaço</Label>
                            <Input
                                id="edit-name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                disabled={!canManage}
                            />
                        </div>

                        {canManage && (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="edit-private"
                                        checked={isPrivate}
                                        onCheckedChange={setIsPrivate}
                                    />
                                    <Label htmlFor="edit-private">Espaço Privado / Compartilhado</Label>
                                </div>
                                {!isAdmin && !isPrivate && (
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                        Aviso: Apenas administradores podem criar espaços totalmente públicos. O seu ficará restrito a você e convidados.
                                    </p>
                                )}
                            </div>
                        )}

                        {canManage && (
                            <Button onClick={handleUpdateSector} className="w-full" disabled={!editName.trim()}>
                                <Save className="w-4 h-4 mr-2" /> Salvar Alterações
                            </Button>
                        )}
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4" /> Membros
                        </h4>

                        {canManage && isPrivate && (
                            <div className="flex gap-2 mb-4">
                                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Convidar usuário..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableUsers.map(profile => (
                                            <SelectItem key={profile.id} value={profile.id}>
                                                {profile.full_name || profile.email}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button onClick={handleAddUser} disabled={!selectedUserId}>
                                    Adicionar
                                </Button>
                            </div>
                        )}

                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {loadingUsers ? (
                                <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                            ) : sectorUsers?.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-2">Somente você e admins têm acesso.</p>
                            ) : (
                                sectorUsers?.map(su => (
                                    <div key={su.id} className="flex items-center justify-between p-2 rounded-md border text-sm">
                                        <span className="truncate flex-1 pr-2">
                                            {su.user?.full_name || su.user?.email || 'Desconhecido'}
                                            {su.user_id === sector.created_by && <span className="text-xs text-muted-foreground ml-2">(Criador)</span>}
                                        </span>
                                        {canManage && su.user_id !== sector.created_by && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                                                onClick={() => handleRemoveUser(su.id, su.user_id)}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {canManage && (
                        <div className="border-t pt-4 flex justify-end">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" className="gap-2">
                                        <Trash2 className="w-4 h-4" /> Excluir Espaço
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir espaço?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta ação não pode ser desfeita. Excluirá "{sector.name}" e todas as tarefas e rotinas associadas!
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteSector} className="bg-destructive hover:bg-destructive/90 text-white">
                                            Sim, Excluir
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
