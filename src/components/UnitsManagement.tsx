import { useState } from 'react';
import { useUnits } from '@/hooks/useUnits';
import { useUnitManagers } from '@/hooks/useUnitManagers';
import { useProfiles } from '@/hooks/useProfiles';
import { useIsAdmin } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Building2, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Pencil, 
  Trash2,
  FolderTree,
  Loader2,
  Users,
  UserPlus,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface Unit {
  id: string;
  name: string;
  code: string;
  description: string | null;
  parent_id: string | null;
}

export const UnitsManagement = () => {
  const { data: units, isLoading, refetch } = useUnits();
  const { data: unitManagers, refetch: refetchManagers } = useUnitManagers();
  const { data: allProfiles } = useProfiles();
  const { isAdmin } = useIsAdmin();
  const queryClient = useQueryClient();
  
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingManager, setIsAddingManager] = useState<string | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formParentId, setFormParentId] = useState<string>('none');

  // Get units with parent_id from raw data
  const unitsWithHierarchy = (units as Unit[]) || [];
  
  // Separate gerências (parent_id = null) and unidades (has parent_id)
  const gerencias = unitsWithHierarchy.filter(u => !u.parent_id);
  
  const getChildUnits = (parentId: string) => {
    return unitsWithHierarchy.filter(u => u.parent_id === parentId);
  };

  const toggleExpand = (unitId: string) => {
    setExpandedUnits(prev => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  const getManagersForUnit = (unitId: string) => {
    return unitManagers?.filter(m => m.unit_id === unitId) || [];
  };

  const getAvailableProfilesForUnit = (unitId: string) => {
    const existingManagerIds = getManagersForUnit(unitId).map(m => m.user_id);
    return allProfiles?.filter(p => !existingManagerIds.includes(p.id)) || [];
  };

  const openCreateDialog = (parentId?: string) => {
    setFormName('');
    setFormCode('');
    setFormDescription('');
    setFormParentId(parentId || 'none');
    setIsCreateOpen(true);
  };

  const openEditDialog = (unit: Unit) => {
    setSelectedUnit(unit);
    setFormName(unit.name);
    setFormCode(unit.code);
    setFormDescription(unit.description || '');
    setFormParentId(unit.parent_id || 'none');
    setIsEditOpen(true);
  };

  const openDeleteDialog = (unit: Unit) => {
    setSelectedUnit(unit);
    setIsDeleteOpen(true);
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formCode.trim()) {
      toast.error('Nome e código são obrigatórios');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('units')
        .insert({
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          description: formDescription.trim() || null,
          parent_id: formParentId === 'none' ? null : formParentId,
        });

      if (error) throw error;

      toast.success(formParentId && formParentId !== 'none' ? 'Unidade criada com sucesso!' : 'Gerência criada com sucesso!');
      setIsCreateOpen(false);
      refetch();
    } catch (error: any) {
      console.error('Error creating unit:', error);
      toast.error(error.message || 'Erro ao criar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedUnit || !formName.trim() || !formCode.trim()) {
      toast.error('Nome e código são obrigatórios');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('units')
        .update({
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          description: formDescription.trim() || null,
          parent_id: formParentId === 'none' ? null : formParentId,
        })
        .eq('id', selectedUnit.id);

      if (error) throw error;

      toast.success('Atualizado com sucesso!');
      setIsEditOpen(false);
      setSelectedUnit(null);
      refetch();
    } catch (error: any) {
      console.error('Error updating unit:', error);
      toast.error(error.message || 'Erro ao atualizar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUnit) return;

    setIsSubmitting(true);
    try {
      // Check if has children
      const children = getChildUnits(selectedUnit.id);
      if (children.length > 0) {
        toast.error('Não é possível excluir uma gerência com unidades vinculadas');
        return;
      }

      const { error } = await supabase
        .from('units')
        .delete()
        .eq('id', selectedUnit.id);

      if (error) throw error;

      toast.success('Excluído com sucesso!');
      setIsDeleteOpen(false);
      setSelectedUnit(null);
      refetch();
    } catch (error: any) {
      console.error('Error deleting unit:', error);
      toast.error(error.message || 'Erro ao excluir');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddManager = async (unitId: string) => {
    if (!selectedManagerId) {
      toast.error('Selecione um usuário');
      return;
    }

    try {
      const { error } = await supabase
        .from('unit_managers')
        .insert({
          unit_id: unitId,
          user_id: selectedManagerId,
        });

      if (error) throw error;

      toast.success('Responsável adicionado com sucesso!');
      setIsAddingManager(null);
      setSelectedManagerId('');
      refetchManagers();
    } catch (error: any) {
      console.error('Error adding manager:', error);
      toast.error(error.message || 'Erro ao adicionar responsável');
    }
  };

  const handleRemoveManager = async (managerId: string) => {
    try {
      const { error } = await supabase
        .from('unit_managers')
        .delete()
        .eq('id', managerId);

      if (error) throw error;

      toast.success('Responsável removido!');
      refetchManagers();
    } catch (error: any) {
      console.error('Error removing manager:', error);
      toast.error(error.message || 'Erro ao remover responsável');
    }
  };

  const renderUnitItem = (unit: Unit, isGerencia: boolean = false) => {
    const children = getChildUnits(unit.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedUnits.has(unit.id);
    const managers = getManagersForUnit(unit.id);
    const availableProfiles = getAvailableProfilesForUnit(unit.id);

    return (
      <div key={unit.id} className={cn("animate-fade-in", !isGerencia && "ml-6")}>
        <div 
          className={cn(
            "flex items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer",
            isGerencia 
              ? "bg-primary/5 border-primary/20 hover:bg-primary/10" 
              : "bg-card border-border hover:bg-secondary/30",
            !isGerencia && !isExpanded && "border-dashed"
          )}
          onClick={() => toggleExpand(unit.id)}
        >
          <div className="p-1">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
          
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            isGerencia ? "bg-primary/20" : "bg-secondary"
          )}>
            {isGerencia ? <FolderTree className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-muted-foreground" />}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{unit.name}</span>
              <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{unit.code}</span>
              {managers.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Users className="w-3 h-3" />
                  {managers.length}
                </Badge>
              )}
              {!isGerencia && !isExpanded && (
                <span className="text-xs text-muted-foreground italic">
                  Clique para ver responsáveis
                </span>
              )}
            </div>
            {unit.description && (
              <p className="text-xs text-muted-foreground truncate">{unit.description}</p>
            )}
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {isGerencia && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => openCreateDialog(unit.id)}
                  title="Adicionar unidade"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => openEditDialog(unit)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={() => openDeleteDialog(unit)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-2 ml-6 space-y-2">
            {/* Managers list - only for units (not gerências) */}
            {!isGerencia && (
              <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Responsáveis
                  </span>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        setIsAddingManager(unit.id);
                        setSelectedManagerId('');
                      }}
                    >
                      <UserPlus className="w-3 h-3" />
                      Adicionar
                    </Button>
                  )}
                </div>

                {/* Add manager form */}
                {isAddingManager === unit.id && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-background rounded border">
                    <Select value={selectedManagerId} onValueChange={setSelectedManagerId}>
                      <SelectTrigger className="flex-1 h-8">
                        <SelectValue placeholder="Selecione um usuário" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProfiles.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground text-center">
                            Nenhum usuário disponível
                          </div>
                        ) : (
                          availableProfiles.map(profile => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.full_name || profile.email}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8" onClick={() => handleAddManager(unit.id)}>
                      Adicionar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0"
                      onClick={() => setIsAddingManager(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Managers list */}
                {managers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum responsável definido</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {managers.map(manager => (
                      <div 
                        key={manager.id}
                        className="flex items-center gap-2 bg-background rounded-full pl-1 pr-2 py-1 border"
                      >
                        <Avatar className="w-6 h-6">
                          <AvatarImage src={manager.profile?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {manager.profile?.full_name?.charAt(0) || manager.profile?.email?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{manager.profile?.full_name || manager.profile?.email}</span>
                        {isAdmin && (
                          <button 
                            onClick={() => handleRemoveManager(manager.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Child units - only for gerências */}
            {isGerencia && hasChildren && (
              <div className="space-y-2">
                {children.map(child => renderUnitItem(child, false))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Gerências e Unidades
            </CardTitle>
            <CardDescription>
              Estrutura hierárquica de gerências e unidades
            </CardDescription>
          </div>
          {isAdmin && (
            <Button onClick={() => openCreateDialog()} className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Gerência
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {gerencias.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma gerência cadastrada</p>
            {isAdmin && (
              <Button variant="outline" className="mt-4" onClick={() => openCreateDialog()}>
                Criar primeira gerência
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {gerencias.map(gerencia => renderUnitItem(gerencia, true))}
          </div>
        )}
      </CardContent>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {formParentId && formParentId !== 'none' ? 'Adicionar Unidade' : 'Criar Nova Gerência'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                placeholder={formParentId && formParentId !== 'none' ? "Nome da unidade" : "Nome da gerência"}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input
                placeholder="Ex: BRU, GER-OESTE"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                placeholder="Descrição opcional"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            {formParentId === 'none' && (
              <div className="space-y-2">
                <Label>Gerência (opcional)</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem gerência (é uma gerência)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (é uma gerência)</SelectItem>
                    {gerencias.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {selectedUnit?.parent_id ? 'Unidade' : 'Gerência'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Gerência</Label>
              <Select value={formParentId} onValueChange={setFormParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem gerência (é uma gerência)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (é uma gerência)</SelectItem>
                  {gerencias.filter(g => g.id !== selectedUnit?.id).map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{selectedUnit?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isSubmitting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
