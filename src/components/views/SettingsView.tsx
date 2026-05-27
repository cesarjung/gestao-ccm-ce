import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useUnits } from '@/hooks/useUnits';
import { useProfiles, Profile } from '@/hooks/useProfiles';
import { useCanManageUsers, useIsAdmin } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { createClient } from '@supabase/supabase-js';
import { toast } from '@/hooks/use-toast';
import { User, Building2, UserPlus, Shield, ShieldX, Pencil, Calendar, Lock, UserCircle, FolderKey, Key, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { UnitsManagement } from '@/components/UnitsManagement';
import { GoogleCalendarConnect } from '@/components/GoogleCalendarConnect';
import { SectorUsersManagement } from '@/components/SectorUsersManagement';
import { AdminUsersManagement } from '@/components/AdminUsersManagement';
import { MultiAssigneeSelect } from '@/components/MultiAssigneeSelect';
import { UserPermissionsTab } from '@/components/UserPermissionsTab';

type AppRole = 'admin' | 'gestor' | 'usuario';

interface UserWithRole extends Profile {
  role?: AppRole;
}

interface SettingsViewProps {
  hideHeader?: boolean;
}

export const SettingsView = ({ hideHeader }: SettingsViewProps) => {
  const { canManageUsers, isLoading: isLoadingRole } = useCanManageUsers();
  const { isAdmin } = useIsAdmin();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data: units } = useUnits();
  const { data: profiles, refetch: refetchProfiles } = useProfiles();

  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserUnits, setNewUserUnits] = useState<string[]>([]);
  const [newUserRole, setNewUserRole] = useState<AppRole>('usuario');
  const [isCreating, setIsCreating] = useState(false);

  // Edit user state
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editUnits, setEditUnits] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<AppRole>('usuario');
  const [isUpdating, setIsUpdating] = useState(false);

  // My profile state (for regular users)
  const [myName, setMyName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Get current user's profile
  const myProfile = profiles?.find(p => p.id === user?.id);

  // Initialize my profile name when profile loads
  useState(() => {
    if (myProfile) {
      setMyName(myProfile.full_name || '');
    }
  });

  const openEditDialog = async (profile: Profile) => {
    setEditingUser(profile);
    setEditName(profile.full_name || '');
    setEditEmail(profile.email || '');

    // Fetch user's managed units
    const { data: managedUnits } = await supabase
      .from('unit_managers')
      .select('unit_id')
      .eq('user_id', profile.id);

    const managedUnitIds = managedUnits?.map(u => u.unit_id) || [];
    // Include profile unit_id if exists and not already in managed units
    const allUnits = profile.unit_id && !managedUnitIds.includes(profile.unit_id)
      ? [profile.unit_id, ...managedUnitIds]
      : managedUnitIds.length > 0 ? managedUnitIds : (profile.unit_id ? [profile.unit_id] : []);

    setEditUnits(allUnits);

    // Fetch user role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', profile.id)
      .maybeSingle();

    setEditRole((roleData?.role as AppRole) || 'usuario');
  };

  const handleUpdateMyProfile = async () => {
    if (!user) return;

    setIsUpdatingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: myName.trim() })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Perfil atualizado',
        description: 'Seu nome foi atualizado com sucesso.',
      });

      refetchProfiles();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Erro ao atualizar perfil',
        description: error.message || 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({
        title: 'Erro',
        description: 'Preencha a nova senha e a confirmação',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Erro',
        description: 'As senhas não coincidem',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Erro',
        description: 'A senha deve ter pelo menos 6 caracteres',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: 'Senha alterada',
        description: 'Sua senha foi alterada com sucesso.',
      });

      // Clear password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({
        title: 'Erro ao alterar senha',
        description: error.message || 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    setIsUpdating(true);
    try {
      // Update email if changed (via RPC Admin)
      if (editEmail && editEmail !== editingUser.email) {
        const { error: emailError } = await supabase.rpc('update_user_email_rpc' as any, {
          target_user_id: editingUser.id,
          new_email: editEmail.trim()
        });

        if (emailError) {
          throw new Error(emailError.message || 'Erro ao atualizar email');
        }
      }

      // Update profile with primary unit (first selected)
      const primaryUnitId = editUnits.length > 0 ? editUnits[0] : null;
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: editName.trim(),
          unit_id: primaryUnitId
        })
        .eq('id', editingUser.id);

      if (profileError) throw profileError;

      // Update unit_managers - delete all and insert new ones
      await supabase
        .from('unit_managers')
        .delete()
        .eq('user_id', editingUser.id);

      if (editUnits.length > 0) {
        await supabase
          .from('unit_managers')
          .insert(editUnits.map(unitId => ({
            user_id: editingUser.id,
            unit_id: unitId
          })));
      }

      // Update role (only admins can change roles)
      if (isAdmin) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: editRole })
          .eq('user_id', editingUser.id);

        if (roleError) throw roleError;
      }

      toast({
        title: 'Usuário atualizado',
        description: `${editName} foi atualizado com sucesso.`,
      });

      setEditingUser(null);
      refetchProfiles();
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        title: 'Erro ao atualizar usuário',
        description: error.message || 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserName || !newUserPassword) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      // 1. Create a temporary client to sign up the new user without logging out the admin
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false, // Critical: Don't overwrite admin session
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      );

      // 2. Sign Up via API (This guarantees valid Hashing and Metadata)
      const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: {
            full_name: newUserName,
          }
        }
      });

      if (signUpError) {
        throw new Error(signUpError.message);
      }

      if (!signUpData.user?.id) {
        throw new Error('Usuário criado mas ID não retornado.');
      }

      const newUserId = signUpData.user.id;

      // 3. Confirm Email (via Admin RPC)
      // Use 'as any' to bypass the type check for the new RPC
      const { error: confirmError } = await supabase.rpc('confirm_user_email' as any, {
        target_email: newUserEmail
      });

      if (confirmError) {
        console.error('Error confirming email:', confirmError);
        // Don't throw, user created but needs confirmation
        toast({
          title: 'Atenção',
          description: 'Usuário criado, mas houve erro ao confirmar email automaticamente.',
          variant: 'destructive'
        });
      }

      // 4. Update Profile & Role (The trigger on_auth_user_created created the profile, we update it)
      // Check if profile exists (wait a bit? Trigger is usually fast, but let's be safe)
      // We can just UPDATE directly.

      // Update Role
      if (newUserRole !== 'usuario') {
        // Using as any for update because the generated types might not have 'role' if it's new
        await supabase.from('profiles').update({ role: newUserRole } as any).eq('id', newUserId);
        // Also update user_roles if needed
        if (isAdmin) {
          await supabase.from('user_roles').insert({ user_id: newUserId, role: newUserRole });
        }
      }

      // Update Units
      if (newUserUnits.length > 0) {
        // Update unit_managers
        await supabase.from('unit_managers').insert(
          newUserUnits.map(unitId => ({ user_id: newUserId, unit_id: unitId }))
        );
        // Update primary unit in profile
        await supabase.from('profiles').update({ unit_id: newUserUnits[0] }).eq('id', newUserId);
      }

      toast({
        title: 'Usuário criado',
        description: `${newUserName} foi cadastrado com sucesso e já pode fazer login.`,
      });

      // Reset form
      setNewUserEmail('');
      setNewUserName('');
      setNewUserPassword('');
      setNewUserUnits([]);
      setNewUserRole('usuario');
      refetchProfiles();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: 'Erro ao criar usuário',
        description: error.message || 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Show loading while checking permissions
  if (isLoadingRole) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  // For regular users (not admin or gestor), show only their profile settings
  if (!canManageUsers) {
    const userUnit = units?.find(u => u.id === myProfile?.unit_id);

    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
          <p className="text-muted-foreground">Visualize e atualize suas informações pessoais</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Profile Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCircle className="w-5 h-5" />
                Informações Pessoais
              </CardTitle>
              <CardDescription>
                Seus dados cadastrados no sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="my-name">Nome Completo</Label>
                <Input
                  id="my-name"
                  value={myName || myProfile?.full_name || ''}
                  onChange={(e) => setMyName(e.target.value)}
                  placeholder="Seu nome"
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={myProfile?.email || user?.email || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Para alterar o email, entre em contato com um administrador
                </p>
              </div>

              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input
                  value={userUnit ? `${userUnit.name} (${userUnit.code})` : 'Não atribuída'}
                  disabled
                  className="bg-muted"
                />
              </div>

              <Button
                onClick={handleUpdateMyProfile}
                disabled={isUpdatingProfile || !myName.trim()}
              >
                {isUpdatingProfile ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </CardContent>
          </Card>

          {/* Change Password Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Alterar Senha
              </CardTitle>
              <CardDescription>
                Atualize sua senha de acesso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Digite a senha novamente"
                />
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={isChangingPassword || !newPassword || !confirmPassword}
              >
                {isChangingPassword ? 'Alterando...' : 'Alterar Senha'}
              </Button>
            </CardContent>
          </Card>

          {/* Theme / Appearance Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Moon className="w-5 h-5" />
                Aparência
              </CardTitle>
              <CardDescription>
                Personalize o tema visual do sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme-select-user">Tema da Interface</Label>
                <Select value={theme} onValueChange={(v: "light" | "dark" | "system") => setTheme(v)}>
                  <SelectTrigger id="theme-select-user">
                    <SelectValue placeholder="Selecione um tema" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Claro</SelectItem>
                    <SelectItem value="dark">Escuro</SelectItem>
                    <SelectItem value="system">Padrão do Sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Google Calendar Integration */}
        <GoogleCalendarConnect />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {!hideHeader && (
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">Gerencie usuários, unidades e permissões</p>
        </div>
      )}

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <UserCircle className="w-4 h-4" />
            Meu Perfil
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Criar Usuário
          </TabsTrigger>
          <TabsTrigger value="list" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="units" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Unidades
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="sectors" className="flex items-center gap-2">
              <FolderKey className="w-4 h-4" />
              Espaços
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="permissions" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Permissões
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="passwords" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              Senhas
            </TabsTrigger>
          )}
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Integrações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Profile Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCircle className="w-5 h-5" />
                  Informações Pessoais
                </CardTitle>
                <CardDescription>
                  Seus dados cadastrados no sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="my-name-admin">Nome Completo</Label>
                  <Input
                    id="my-name-admin"
                    value={myName || myProfile?.full_name || ''}
                    onChange={(e) => setMyName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={myProfile?.email || user?.email || ''}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <Button
                  onClick={handleUpdateMyProfile}
                  disabled={isUpdatingProfile || !myName.trim()}
                >
                  {isUpdatingProfile ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </CardContent>
            </Card>

            {/* Change Password Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  Alterar Senha
                </CardTitle>
                <CardDescription>
                  Atualize sua senha de acesso
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password-admin">Nova Senha</Label>
                  <Input
                    id="new-password-admin"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password-admin">Confirmar Nova Senha</Label>
                  <Input
                    id="confirm-password-admin"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Digite a senha novamente"
                  />
                </div>

                <Button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !newPassword || !confirmPassword}
                >
                  {isChangingPassword ? 'Alterando...' : 'Alterar Senha'}
                </Button>
              </CardContent>
            </Card>

            {/* Theme / Appearance Card (Admin) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Moon className="w-5 h-5" />
                  Aparência
                </CardTitle>
                <CardDescription>
                  Personalize o tema visual do sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="theme-select-admin">Tema da Interface</Label>
                  <Select value={theme} onValueChange={(v: "light" | "dark" | "system") => setTheme(v)}>
                    <SelectTrigger id="theme-select-admin">
                      <SelectValue placeholder="Selecione um tema" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Claro</SelectItem>
                      <SelectItem value="dark">Escuro</SelectItem>
                      <SelectItem value="system">Padrão do Sistema</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Cadastrar Novo Usuário
              </CardTitle>
              <CardDescription>
                Adicione novos colaboradores ao sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    placeholder="Nome do usuário"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Unidades</Label>
                  <MultiAssigneeSelect
                    profiles={(units || []).map(u => ({ id: u.id, full_name: `${u.name} (${u.code})`, email: '', avatar_url: null, unit_id: null, created_at: '', updated_at: '' }))}
                    selectedIds={newUserUnits}
                    onChange={setNewUserUnits}
                    placeholder="Selecione as unidades"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Função</Label>
                  <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usuario">Usuário</SelectItem>
                      <SelectItem value="gestor">Gestor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleCreateUser} disabled={isCreating}>
                {isCreating ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Usuários Cadastrados
              </CardTitle>
              <CardDescription>
                Lista de todos os usuários do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {profiles?.map((profile) => (
                  <div
                    key={profile.id}
                    onClick={() => openEditDialog(profile)}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{profile.full_name || profile.email}</p>
                        <p className="text-sm text-muted-foreground">{profile.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {units?.find(u => u.id === profile.unit_id) && (
                        <span className="text-xs bg-secondary px-2 py-1 rounded">
                          {units.find(u => u.id === profile.unit_id)?.code}
                        </span>
                      )}
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
                {(!profiles || profiles.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum usuário cadastrado
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="units">
          <UnitsManagement />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="sectors">
            <SectorUsersManagement />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="passwords">
            <AdminUsersManagement />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="permissions">
            <UserPermissionsTab />
          </TabsContent>
        )}

        <TabsContent value="integrations">
          <div className="space-y-4">
            <GoogleCalendarConnect />
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Altere os dados do usuário {editingUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome Completo</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
                {editEmail !== editingUser?.email && (
                  <p className="text-xs text-muted-foreground">
                    O email será atualizado no login do usuário
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Unidades</Label>
              <MultiAssigneeSelect
                profiles={(units || []).map(u => ({ id: u.id, full_name: `${u.name} (${u.code})`, email: '', avatar_url: null, unit_id: null, created_at: '', updated_at: '' }))}
                selectedIds={editUnits}
                onChange={setEditUnits}
                placeholder="Selecione as unidades"
              />
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="edit-role">Função</Label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usuario">Usuário</SelectItem>
                    <SelectItem value="gestor">Gestor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateUser} disabled={isUpdating}>
              {isUpdating ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
