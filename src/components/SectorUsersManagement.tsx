import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useSectors, useSectorMutations } from '@/hooks/useSectors';
import { useSectorUsers, useSectorUserMutations } from '@/hooks/useSectorUsers';
import { useProfiles } from '@/hooks/useProfiles';
import { useIsAdmin } from '@/hooks/useUserRole';
import { Users, UserPlus, Trash2, Shield, Loader2 } from 'lucide-react';

export const SectorUsersManagement = () => {
  const { isAdmin } = useIsAdmin();
  const { data: sectors } = useSectors();
  const { data: profiles } = useProfiles();
  const { addUserToSector, removeUserFromSector } = useSectorUserMutations();
  const { updateSector, deleteSector } = useSectorMutations();

  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Edit State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');

  const { data: sectorUsers, isLoading: loadingUsers } = useSectorUsers(selectedSectorId);

  const selectedSector = sectors?.find(s => s.id === selectedSectorId);

  const SECTOR_COLORS = [
    '#6366f1', // Indigo (Default)
    '#ec4899', // Pink
    '#a855f7', // Purple
    '#3b82f6', // Blue
    '#0ea5e9', // Sky
    '#14b8a6', // Teal
    '#22c55e', // Green
    '#eab308', // Yellow
    '#f97316', // Orange
    '#ef4444', // Red
    '#64748b', // Slate
    '#000000', // Black
  ];

  const handleOpenEditDialog = () => {
    if (!selectedSector) return;
    setEditName(selectedSector.name);
    setEditColor(selectedSector.color || '#6366f1');
    setIsEditDialogOpen(true);
  };

  const handleEditSector = async () => {
    if (!selectedSectorId || !editName.trim()) return;

    await updateSector.mutateAsync({
      id: selectedSectorId,
      name: editName.trim(),
      color: editColor,
    });

    setIsEditDialogOpen(false);
  };

  const handleDeleteSector = async () => {
    if (!selectedSectorId) return;

    await deleteSector.mutateAsync(selectedSectorId);
    setSelectedSectorId('');
  };

  // Get users not already in the selected sector
  const availableUsers = profiles?.filter(
    profile => !sectorUsers?.some(su => su.user_id === profile.id)
  ) || [];

  const handleAddUser = async () => {
    if (!selectedSectorId || !selectedUserId) return;

    await addUserToSector.mutateAsync({
      sectorId: selectedSectorId,
      userId: selectedUserId,
    });

    setSelectedUserId('');
    setIsAddDialogOpen(false);
  };

  const handleRemoveUser = async (id: string) => {
    if (!selectedSectorId) return;

    await removeUserFromSector.mutateAsync({
      id,
      sectorId: selectedSectorId,
    });
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Usuários por Espaço
        </CardTitle>
        <CardDescription>
          Gerencie os espaços e defina quais usuários podem acessá-los
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sector Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Selecione um Espaço</label>
          <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um espaço" />
            </SelectTrigger>
            <SelectContent>
              {sectors?.map(sector => (
                <SelectItem key={sector.id} value={sector.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: sector.color || '#6366f1' }}
                    />
                    {sector.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedSectorId && (
          <>
            {/* Header with Actions */}
            <div className="flex items-center justify-between pb-4 border-b">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: selectedSector?.color || '#6366f1' }}
                />
                <h4 className="text-lg font-semibold">
                  {selectedSector?.name}
                </h4>
              </div>

              <div className="flex items-center gap-2">
                {/* Edit Button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={handleOpenEditDialog}
                >
                  <UserPlus className="w-4 h-4 rotate-0 invisible absolute" /> {/* Spacer hack */}
                  <span className="sr-only">Editar</span>
                  <span className="flex items-center gap-2">
                    ✏️ Editar
                  </span>
                </Button>

                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-2">
                      <UserPlus className="w-4 h-4" />
                      Add Usuário
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Usuário ao Espaço</DialogTitle>
                      <DialogDescription>
                        Selecione um usuário para dar acesso a este espaço
                      </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                      <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um usuário" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableUsers.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                              Todos os usuários já têm acesso
                            </div>
                          ) : (
                            availableUsers.map(profile => (
                              <SelectItem key={profile.id} value={profile.id}>
                                <div className="flex flex-col">
                                  <span>{profile.full_name || profile.email}</span>
                                  {profile.full_name && (
                                    <span className="text-xs text-muted-foreground">{profile.email}</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleAddUser}
                        disabled={!selectedUserId || addUserToSector.isPending}
                      >
                        {addUserToSector.isPending ? 'Adicionando...' : 'Adicionar'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="gap-2" title="Excluir Espaço">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir espaço?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja excluir o espaço "{selectedSector?.name}"?
                        Essa ação não pode ser desfeita e removerá todos os acessos de usuários a este espaço.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteSector}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleteSector.isPending ? 'Excluindo...' : 'Excluir'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Users List */}
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Usuários com acesso
              </h4>
              {loadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : sectorUsers?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg border-dashed">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum usuário com acesso</p>
                  <p className="text-xs mt-1">Clique em "Add Usuário" para liberar o acesso.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sectorUsers?.map(su => (
                    <div
                      key={su.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {su.user?.full_name || su.user?.email || 'Usuário'}
                          </p>
                          {su.user?.full_name && (
                            <p className="text-xs text-muted-foreground">{su.user.email}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveUser(su.id)}
                        disabled={removeUserFromSector.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Espaço</DialogTitle>
            <DialogDescription>
              Personalize o nome e a cor do espaço {selectedSector?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="edit-sector-name" className="text-sm font-medium">Nome do Espaço</label>
              <input
                id="edit-sector-name"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Cor do Ícone</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {SECTOR_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setEditColor(color)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${editColor === color ? 'border-foreground scale-110' : 'border-transparent hover:scale-110'
                      }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-10 h-10 p-0 border-0 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">Cor personalizada (Hex)</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleEditSector}
              disabled={updateSector.isPending || !editName.trim()}
            >
              {updateSector.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

