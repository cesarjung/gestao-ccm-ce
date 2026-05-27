import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield } from 'lucide-react';
import { useProfiles } from '@/hooks/useProfiles';
import { useModulePermissions, useUpdateModulePermissions } from '@/hooks/useModulePermissions';

const PLANEJAMENTO_SECTIONS = [
  { id: 'carteira_dashboard', label: 'Carteira' },
  { id: 'carteira', label: 'Carteira Planejada' },
  { id: 'planejamento_semanal', label: 'Planejamento Semanal' },
  { id: 'planejamento_equipes', label: 'Equipes' },
  { id: 'poste_turno', label: 'Poste/Turno' },
  { id: 'deslocamento', label: 'Deslocamento' },
  { id: 'planejado_meta', label: 'Planejado x Meta' },
  { id: 'cumprimento_planejamento', label: 'Cumprimento Plan.' },
  { id: 'etapas', label: 'Etapas' }
];

export const UserPermissionsTab = () => {
  const { data: profiles = [] } = useProfiles();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [localPermissions, setLocalPermissions] = useState<string[]>([]);
  
  const { data: permissionsData, isLoading } = useModulePermissions('PLANEJAMENTO', selectedUserId);
  const updatePermissions = useUpdateModulePermissions();

  // Quando carregar as permissões do banco, atualiza o estado local
  useEffect(() => {
    if (selectedUserId && !isLoading) {
      if (permissionsData) {
        setLocalPermissions(permissionsData.permissions || []);
      } else {
        // Se não tem dados, assume array vazio
        setLocalPermissions([]);
      }
    }
  }, [selectedUserId, permissionsData, isLoading]);

  const handleTogglePermission = (sectionId: string) => {
    setLocalPermissions(prev => {
      if (prev.includes(sectionId)) {
        return prev.filter(id => id !== sectionId);
      } else {
        return [...prev, sectionId];
      }
    });
  };

  const handleSave = () => {
    if (!selectedUserId) return;
    
    updatePermissions.mutate({
      userId: selectedUserId,
      moduleName: 'PLANEJAMENTO',
      permissions: localPermissions
    });
  };

  const handleSelectAll = () => {
    setLocalPermissions(PLANEJAMENTO_SECTIONS.map(s => s.id));
  };

  const handleClearAll = () => {
    setLocalPermissions([]);
  };

  const filteredProfiles = profiles.filter(user => user.role !== 'admin');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Permissões de Usuários
        </CardTitle>
        <CardDescription>
          Gerencie quais módulos e seções cada usuário pode acessar no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Seletor de Usuário */}
        <div className="space-y-2 max-w-md">
          <Label htmlFor="user-select">Selecione o Usuário</Label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger id="user-select">
              <SelectValue placeholder="Escolha um usuário..." />
            </SelectTrigger>
            <SelectContent>
              {filteredProfiles.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name || user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Formulário de Permissões (Aparece apenas quando um usuário é selecionado) */}
        {selectedUserId && (
          <div className="border rounded-md p-4 bg-muted/20 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary">PLANEJAMENTO</h3>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll} className="h-7 text-xs">Marcar Todos</Button>
                <Button variant="outline" size="sm" onClick={handleClearAll} className="h-7 text-xs">Limpar</Button>
              </div>
            </div>
            
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Carregando permissões...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {PLANEJAMENTO_SECTIONS.map((section) => (
                  <div key={section.id} className="flex items-center space-x-2 bg-background p-2 rounded-md border shadow-sm">
                    <Checkbox 
                      id={`perm-${section.id}`} 
                      checked={localPermissions.includes(section.id)}
                      onCheckedChange={() => handleTogglePermission(section.id)}
                    />
                    <Label 
                      htmlFor={`perm-${section.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                    >
                      {section.label}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t">
              <Button 
                onClick={handleSave} 
                disabled={updatePermissions.isPending || isLoading}
                className="w-full md:w-auto"
              >
                {updatePermissions.isPending ? 'Salvando...' : 'Salvar Permissões'}
              </Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
};
