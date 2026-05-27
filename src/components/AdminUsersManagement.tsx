import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useProfiles } from '@/hooks/useProfiles';
import { useIsAdmin } from '@/hooks/useUserRole';
import { useAdminUpdatePassword } from '@/hooks/useAdminUpdatePassword';
import { Users, Key, Loader2, Search } from 'lucide-react';

export const AdminUsersManagement = () => {
  const { isAdmin } = useIsAdmin();
  const { data: profiles, isLoading } = useProfiles();
  const updatePassword = useAdminUpdatePassword();

  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProfiles = profiles?.filter(profile => {
    const search = searchTerm.toLowerCase();
    return (
      profile.full_name?.toLowerCase().includes(search) ||
      profile.email.toLowerCase().includes(search)
    );
  });

  const handleOpenDialog = (userId: string, userName: string) => {
    setSelectedUser({ id: userId, name: userName });
    setNewPassword('');
    setConfirmPassword('');
    setIsDialogOpen(true);
  };

  const handleUpdatePassword = async () => {
    if (!selectedUser) return;

    if (newPassword !== confirmPassword) {
      return;
    }

    await updatePassword.mutateAsync({
      userId: selectedUser.id,
      newPassword,
    });

    setIsDialogOpen(false);
    setSelectedUser(null);
    setNewPassword('');
    setConfirmPassword('');
  };

  const passwordsMatch = newPassword === confirmPassword;
  const isPasswordValid = newPassword.length >= 6;

  if (!isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Gerenciamento de Usuários
        </CardTitle>
        <CardDescription>
          Gerencie as senhas dos usuários do sistema
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Users List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : filteredProfiles?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum usuário encontrado</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredProfiles?.map(profile => (
              <div 
                key={profile.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {profile.full_name || profile.email}
                    </p>
                    {profile.full_name && (
                      <p className="text-xs text-muted-foreground">{profile.email}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => handleOpenDialog(profile.id, profile.full_name || profile.email)}
                >
                  <Key className="w-4 h-4" />
                  Alterar Senha
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Change Password Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alterar Senha</DialogTitle>
              <DialogDescription>
                Definir nova senha para <span className="font-medium">{selectedUser?.name}</span>
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nova Senha</label>
                <Input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                {newPassword && !isPasswordValid && (
                  <p className="text-xs text-destructive">A senha deve ter pelo menos 6 caracteres</p>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirmar Senha</label>
                <Input
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-destructive">As senhas não coincidem</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleUpdatePassword} 
                disabled={!isPasswordValid || !passwordsMatch || updatePassword.isPending}
              >
                {updatePassword.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Atualizando...
                  </>
                ) : (
                  'Atualizar Senha'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
