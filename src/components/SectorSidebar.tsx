import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Plus,
  Folder,
  FolderOpen,
  ClipboardList,
  Calendar,
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  Users,
  Map,
  Activity,
  Navigation,
  Target,
  CheckCircle,
  Layers,
  Trash2,
  StickyNote,
  Home
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSectors, useSectorMutations, useSectionMutations, Sector, SectorSection } from '@/hooks/useSectors';
import { useSectorUserMutations } from '@/hooks/useSectorUsers';
import { useProfiles } from '@/hooks/useProfiles';
import { useIsAdmin, useIsGestorOrAdmin } from '@/hooks/useUserRole';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { NavigationContext, ViewMode } from '@/types/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MultiAssigneeSelect } from '@/components/MultiAssigneeSelect';
import { SectorSettingsDialog } from '@/components/SectorSettingsDialog';
import sirtecLogo from '@/assets/sirtec-logo-transparent.png';

interface SectorSidebarProps {
  context: NavigationContext;
  onNavigate: (context: NavigationContext) => void;
  collapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
}

const FREQUENCIES = [
  { id: 'diaria', label: 'Diário' },
  { id: 'semanal', label: 'Semanais' },
  { id: 'quinzenal', label: 'Quinzenais' },
  { id: 'mensal', label: 'Mensais' },
  { id: 'anual', label: 'Anuais' },
];

export const SectorSidebar = ({ context, onNavigate, collapsed, onCollapseChange }: SectorSidebarProps) => {
  const { user, signOut } = useAuth();
  const { data: sectors = [], isLoading } = useSectors();
  const { createSector, deleteSector } = useSectorMutations();
  const { createSection, deleteSection } = useSectionMutations();
  const { addUserToSector } = useSectorUserMutations();
  const { data: profiles = [] } = useProfiles();
  const { isAdmin } = useIsAdmin();
  const { isGestorOrAdmin } = useIsGestorOrAdmin();
  const { data: planejamentoPermissionsData } = useModulePermissions('PLANEJAMENTO');

  const allowedPlanejamentoSections = planejamentoPermissionsData?.permissions || [];
  const hasPlanejamentoAccess = (sectionId: string) => true; // Bypass
  const hasAnyPlanejamentoAccess = true; // Bypass

  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedRoutineFreqs, setExpandedRoutineFreqs] = useState<Set<string>>(new Set());
  const [isRotinasExpanded, setIsRotinasExpanded] = useState(true);
  const [newSectorName, setNewSectorName] = useState('');
  const [isNewSectorPrivate, setIsNewSectorPrivate] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [isPlanejamentoExpanded, setIsPlanejamentoExpanded] = useState(true);

  // Section Creation State
  const [activeSectorIdForSection, setActiveSectorIdForSection] = useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);

  // Sector Settings State
  const [activeConfigSectorId, setActiveConfigSectorId] = useState<string | null>(null);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);

  // Sector Deletion State
  const [sectorToDelete, setSectorToDelete] = useState<Sector | null>(null);

  const toggleSector = (sectorId: string) => {
    const newExpanded = new Set(expandedSectors);
    if (newExpanded.has(sectorId)) {
      newExpanded.delete(sectorId);
    } else {
      newExpanded.add(sectorId);
    }
    setExpandedSectors(newExpanded);
  };

  const toggleFolder = (key: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedFolders(newExpanded);
  };

  const toggleRoutineFreq = (key: string) => {
    const newExpanded = new Set(expandedRoutineFreqs);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedRoutineFreqs(newExpanded);
  };

  const handleCreateSector = async () => {
    if (!newSectorName.trim()) return;

    // Create the sector
    const newSector = await createSector.mutateAsync({ name: newSectorName.trim(), is_private: isNewSectorPrivate });

    // If private and users are selected, add them
    if (newSector && isNewSectorPrivate && selectedUsers.length > 0) {
      // Create an array of promises for adding users
      const addPromises = selectedUsers.map(userId =>
        addUserToSector.mutateAsync({
          sectorId: newSector.id,
          userId: userId
        })
      );

      try {
        await Promise.all(addPromises);
      } catch (err) {
        console.error("Erro ao adicionar alguns usuários ao novo espaço:", err);
      }
    }

    setNewSectorName('');
    setIsNewSectorPrivate(false);
    setSelectedUsers([]);
    setIsDialogOpen(false);
  };

  const handleCreateSection = async () => {
    if (!activeSectorIdForSection || !newSectionTitle.trim()) return;

    // Default to 'custom_tasks' type for new custom sections
    await createSection.mutateAsync({
      sector_id: activeSectorIdForSection,
      title: newSectionTitle.trim(),
      type: 'custom_tasks',
      order_index: 99 // Append to end
    });

    setNewSectionTitle('');
    setIsSectionDialogOpen(false);
    setActiveSectorIdForSection(null);
  };

  const handleDeleteSection = async (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    if (confirm('Tem certeza que deseja excluir esta seção?')) {
      await deleteSection.mutateAsync(sectionId);
    }
  };

  const isActive = (ctx: NavigationContext) => {
    if (ctx.type !== context.type) return false;
    if (ctx.type === 'sector' && context.type === 'sector') {
      return ctx.sectorId === context.sectorId &&
        ctx.folder === context.folder &&
        ctx.frequency === context.frequency;
    }
    return true;
  };

  const renderSectorItem = (sector: Sector) => {
    const isExpanded = expandedSectors.has(sector.id);
    const routinesKey = `${sector.id}-routines`;
    const isRoutinesExpanded = expandedFolders.has(routinesKey);

    // Filter out 'units' globally to fix legacy DB rows and the hardcoded Trigger that injects it for new sectors
    const sections = (sector.sections || [])
      .filter(s => s.type !== 'units')
      .sort((a, b) => a.order_index - b.order_index);

    // Fallback if no sections exist yet
    if (sections.length === 0) {
      sections.push(
        { id: 'dashboard', sector_id: sector.id, title: 'Dashboard', type: 'dashboard', order_index: 0 },
        { id: 'tasks', sector_id: sector.id, title: 'Tarefas', type: 'tasks', order_index: 1 },
        { id: 'routines', sector_id: sector.id, title: 'Rotinas', type: 'routines', order_index: 2 }
      );
    }

    return (
      <div key={sector.id} className="ml-2">
        <div className="flex items-center gap-1 w-full pr-2 group/sector">
          <button
            onClick={() => toggleSector(sector.id)}
            className={cn(
              'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
              'text-gray-200 hover:bg-sidebar-accent/50 hover:text-white'
            )}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <div
              className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold"
              style={{ backgroundColor: sector.color || '#6366f1' }}
            >
              {sector.name.charAt(0).toUpperCase()}
            </div>
            {!collapsed && <span className="truncate text-sm">{sector.name}</span>}
          </button>

          {/* Settings Button */}
          {(isGestorOrAdmin || sector.created_by === user?.id) && !collapsed && (
            <div className="flex opacity-0 group-hover/sector:opacity-100 transition-opacity ml-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveConfigSectorId(sector.id);
                  setIsConfigDialogOpen(true);
                }}
                className="p-1 hover:bg-sidebar-accent rounded text-muted-foreground hover:text-white"
                title="Configurações do Espaço"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSectorToDelete(sector);
                }}
                className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive"
                title="Excluir Espaço"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Add Section Button */}
          {isAdmin && !collapsed && (
            <button
              onClick={() => {
                setActiveSectorIdForSection(sector.id);
                setIsSectionDialogOpen(true);
              }}
              className="opacity-0 group-hover/sector:opacity-100 p-1 hover:bg-sidebar-accent rounded text-muted-foreground hover:text-white transition-opacity"
              title="Adicionar Seção"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>

        {isExpanded && !collapsed && (
          <div className="ml-4 space-y-0.5 border-l border-sidebar-border/50 pl-1 mt-0.5">
            {/* Atalho Fixo Anotações do Espaço */}
            <div className="relative group/section">
              <button
                onClick={() => onNavigate({ type: 'sector', sectorId: sector.id, folder: 'notes' })}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
                  context.type === 'sector' && context.sectorId === sector.id && context.folder === 'notes'
                    ? 'bg-sidebar-accent text-white font-medium'
                    : 'text-gray-300 hover:bg-sidebar-accent/50 hover:text-white'
                )}
              >
                <StickyNote className="w-3.5 h-3.5" />
                <span>Anotações e Quadros</span>
              </button>
            </div>

            {sections.map(section => {
              // Special handling for Routines
              if (section.type === 'routines') {
                return (
                  <div key={section.id} className="relative group/section">
                    <div className="flex items-center">
                      <button
                        onClick={() => onNavigate({ type: 'sector', sectorId: sector.id, folder: 'routines' })}
                        className={cn(
                          'flex-1 flex items-center gap-2 px-2 py-1 rounded-l-md text-xs transition-colors',
                          context.type === 'sector' && context.sectorId === sector.id && context.folder === 'routines'
                            ? 'bg-sidebar-accent text-white font-medium'
                            : 'text-gray-300 hover:bg-sidebar-accent/50 hover:text-white'
                        )}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{section.title}</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFolder(routinesKey);
                        }}
                        className={cn(
                          'px-1 py-1 rounded-r-md text-xs transition-colors',
                          isRoutinesExpanded
                            ? 'bg-sidebar-accent text-white'
                            : 'text-gray-300 hover:bg-sidebar-accent/50 hover:text-white'
                        )}
                      >
                        {isRoutinesExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>

                      {isAdmin && (
                        <button
                          onClick={(e) => handleDeleteSection(e, section.id)}
                          className="ml-1 p-0.5 text-gray-500 hover:text-destructive transition-colors"
                          title="Excluir seção"
                        >
                          <LogOut className="w-3 h-3 rotate-180" />
                        </button>
                      )}
                    </div>

                    {isRoutinesExpanded && (
                      <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-border/30 pl-1">
                        {FREQUENCIES.map((freq) => (
                          <button
                            key={freq.id}
                            onClick={() => onNavigate({ type: 'sector', sectorId: sector.id, folder: 'routines', frequency: freq.id })}
                            className={cn(
                              'w-full flex items-center gap-2 px-2 py-0.5 rounded-md text-[11px] transition-colors',
                              context.type === 'sector' && context.sectorId === sector.id && context.folder === 'routines' && context.frequency === freq.id
                                ? 'bg-sidebar-accent text-white font-medium'
                                : 'text-gray-300 hover:bg-sidebar-accent/50 hover:text-white'
                            )}
                          >
                            <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                            <span>{freq.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              // Generic Handling
              let Icon = ClipboardList;
              if (section.type === 'dashboard') Icon = LayoutDashboard;
              if (section.type === 'units') Icon = Building2;
              if (section.type === 'custom_tasks') Icon = ClipboardList;

              const isCustom = !['dashboard', 'tasks', 'routines', 'units'].includes(section.id); // Check if it's a legacy default ID

              return (
                <div key={section.id} className="flex items-center group/section">
                  <button
                    onClick={() => onNavigate({
                      type: 'sector',
                      sectorId: sector.id,
                      folder: isCustom ? section.id : section.type // Use ID for custom, type for legacy defaults mapping 
                    })}
                    className={cn(
                      'flex-1 flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors',
                      context.type === 'sector' && context.sectorId === sector.id && context.folder === (isCustom ? section.id : section.type)
                        ? 'bg-sidebar-accent text-white font-medium'
                        : 'text-gray-300 hover:bg-sidebar-accent/50 hover:text-white'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{section.title}</span>
                  </button>
                  {isAdmin && (
                    <button
                      onClick={(e) => handleDeleteSection(e, section.id)}
                      className="ml-1 p-0.5 text-gray-500 hover:text-destructive transition-colors"
                      title="Excluir seção"
                    >
                      <LogOut className="w-3 h-3 rotate-180" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        'min-h-screen flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64' // Increased width slightly to fit text
      )}
    >
      {/* Header */}
      <div className="px-3 pb-3 pt-4 border-b border-sidebar-border relative">
        {!collapsed ? (
          <div className="flex items-center gap-3 px-2">
            <img src={sirtecLogo} alt="Sirtec" className="h-16 w-16 object-contain" />
            <span className="text-sm font-medium text-white truncate">Gestão CCM</span>
          </div>
        ) : (
          <div className="flex justify-center">
            <img src={sirtecLogo} alt="Sirtec" className="h-10 w-10 object-contain" />
          </div>
        )}
        <button
          onClick={() => onCollapseChange(!collapsed)}
          className="absolute top-3 right-2 p-1 rounded-md hover:bg-sidebar-accent text-gray-400 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Navigation - scrollable but invisible scrollbar */}
      <nav className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] p-3 space-y-1">
        
        {/* Rotinas header */}
        {!collapsed && (
          <div className="flex items-center justify-between px-3 pt-2 pb-2">
            <button
              onClick={() => setIsRotinasExpanded(!isRotinasExpanded)}
              className="flex-1 flex items-center justify-between text-xs font-semibold text-white uppercase tracking-wider transition-colors mr-2"
            >
              <span>Rotinas</span>
              {isRotinasExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {isAdmin && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <button className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground shrink-0">
                    <Plus className="w-4 h-4" />
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar novo espaço</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <Input
                      placeholder="Nome do espaço"
                      value={newSectorName}
                      onChange={(e) => setNewSectorName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateSector()}
                    />
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="private-sector"
                          checked={isNewSectorPrivate}
                          onCheckedChange={setIsNewSectorPrivate}
                        />
                        <Label htmlFor="private-sector" className="text-sm font-normal">
                          Espaço Privado / Personalizado
                        </Label>
                      </div>

                      {/* Members Select (Only show if private) */}
                      {isNewSectorPrivate && (
                        <div className="space-y-2 pt-2 border-t border-border mt-2">
                          <Label className="text-xs text-muted-foreground">Compartilhar com (opcional)</Label>
                          <MultiAssigneeSelect
                            profiles={profiles}
                            selectedIds={selectedUsers}
                            onChange={setSelectedUsers}
                            placeholder="Selecione membros para convidar"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Os usuários selecionados poderão ver este espaço. (Admins/master sempre podem ver).
                          </p>
                        </div>
                      )}
                    </div>
                    <Button onClick={handleCreateSector} disabled={!newSectorName.trim()}>
                      Criar Espaço
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}

        {(!collapsed ? isRotinasExpanded : true) && (
          <div className="space-y-0.5">

        {/* Dashboard */}
        <button
          onClick={() => onNavigate({ type: 'dashboard' })}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
            context.type === 'dashboard'
              ? 'bg-sidebar-accent text-sidebar-primary'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
          )}
        >
          <LayoutDashboard className={cn('w-4 h-4 flex-shrink-0', context.type === 'dashboard' && 'text-primary')} />
          {!collapsed && <span className="text-sm">Dashboard</span>}
        </button>

        {/* Minhas Tarefas */}
        <button
          onClick={() => onNavigate({ type: 'my-tasks' })}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
            context.type === 'my-tasks'
              ? 'bg-sidebar-accent text-sidebar-primary'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
          )}
        >
          <ClipboardList className={cn('w-4 h-4 flex-shrink-0', context.type === 'my-tasks' && 'text-primary')} />
          {!collapsed && <span className="text-sm">Minhas Tarefas</span>}
        </button>

        {/* Todos os setores */}
        <button
          onClick={() => onNavigate({ type: 'all-sectors' })}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
            context.type === 'all-sectors'
              ? 'bg-sidebar-accent text-sidebar-primary'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
          )}
        >
          <Folder className="w-4 h-4" />
          {!collapsed && <span className="text-sm">Todos os setores</span>}
        </button>

        {/* Espaços list */}
        {isLoading ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-4">
            {/* Públicos */}
            <div className="space-y-0.5">
              {sectors.filter(s => !s.is_private).map(renderSectorItem)}
            </div>

            {/* Privados do Usuário */}
            {sectors.filter(s => s.is_private).length > 0 && (
              <div className="pt-2 border-t border-sidebar-border/50">
                {!collapsed && (
                  <div className="px-2 mb-1">
                    <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-widest pl-1">
                      Meus Espaços Privados
                    </span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {sectors.filter(s => s.is_private).map(renderSectorItem)}
                </div>
              </div>
            )}
          </div>
        )}
          </div>
        )}

        {/* Módulo Planejamento Header */}
        {!collapsed && hasAnyPlanejamentoAccess && (
          <div className="px-3 pt-4 pb-2">
            <button
              onClick={() => setIsPlanejamentoExpanded(!isPlanejamentoExpanded)}
              className="w-full flex items-center justify-between text-xs font-semibold text-white uppercase tracking-wider transition-colors"
            >
              <span>Planejamento</span>
              {isPlanejamentoExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        )}
        {(!collapsed ? isPlanejamentoExpanded : true) && hasAnyPlanejamentoAccess && (
          <div className="space-y-0.5 px-3">
            {hasPlanejamentoAccess('carteira_dashboard') && (
              <button
                onClick={() => onNavigate({ type: 'planejamento', section: 'carteira_dashboard' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'planejamento' && context.section === 'carteira_dashboard' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm">Carteira</span>}
              </button>
            )}
            {hasPlanejamentoAccess('carteira') && (
              <button
                onClick={() => onNavigate({ type: 'planejamento', section: 'carteira' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'planejamento' && context.section === 'carteira' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Map className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm whitespace-nowrap">Carteira Planejada</span>}
              </button>
            )}

            {/* Alojamentos */}
            {hasPlanejamentoAccess('carteira') && (
              <button
                onClick={() => onNavigate({ type: 'alojamentos', section: 'carteira' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'alojamentos' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Home className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm whitespace-nowrap">Alojamentos e Bases</span>}
              </button>
            )}

            {hasPlanejamentoAccess('planejamento_semanal') && (
              <button
                onClick={() => onNavigate({ type: 'planejamento_semanal', section: 'carteira' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'planejamento_semanal' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Calendar className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm whitespace-nowrap">Planejamento Semanal</span>}
              </button>
            )}
            
            {hasPlanejamentoAccess('planejamento_equipes') && (
              <button
                onClick={() => onNavigate({ type: 'planejamento_equipes', section: 'carteira' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'planejamento_equipes' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Users className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm">Equipes</span>}
              </button>
            )}

            {hasPlanejamentoAccess('poste_turno') && (
              <button
                onClick={() => onNavigate({ type: 'poste_turno', section: 'carteira' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'poste_turno' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Activity className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm whitespace-nowrap">Poste/Turno</span>}
              </button>
            )}

            {hasPlanejamentoAccess('deslocamento') && (
              <button
                onClick={() => onNavigate({ type: 'deslocamento', section: 'carteira' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'deslocamento' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Navigation className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm whitespace-nowrap">Deslocamento</span>}
              </button>
            )}

            {hasPlanejamentoAccess('planejado_meta') && (
              <button
                onClick={() => onNavigate({ type: 'planejado_meta', section: 'carteira' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'planejado_meta' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Target className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm whitespace-nowrap">Planejado x Meta</span>}
              </button>
            )}

            {hasPlanejamentoAccess('cumprimento_planejamento') && (
              <button
                onClick={() => onNavigate({ type: 'cumprimento_planejamento', section: 'carteira' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'cumprimento_planejamento' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <CheckCircle className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm whitespace-nowrap">Cumprimento Plan.</span>}
              </button>
            )}

            {hasPlanejamentoAccess('etapas') && (
              <button
                onClick={() => onNavigate({ type: 'etapas', section: 'carteira' })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                  context.type === 'etapas' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Layers className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="text-sm whitespace-nowrap">Etapas</span>}
              </button>
            )}
          </div>
        )}
      </nav>

      {/* Footer - always at bottom with mt-auto */}
      <div className="mt-auto p-2 border-t border-sidebar-border space-y-0.5 bg-sidebar">
        {!collapsed && user && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground truncate opacity-70 mb-1">
            {user.email}
          </div>
        )}

        <button
          onClick={() => onNavigate({ type: 'settings' })}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors',
            context.type === 'settings'
              ? 'bg-sidebar-accent text-sidebar-primary font-medium'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
          )}
          title={collapsed ? "Configurações" : undefined}
        >
          <Settings className={cn('w-4 h-4 flex-shrink-0', context.type === 'settings' && 'text-primary')} />
          {!collapsed && <span className="text-sm">Configurações</span>}
        </button>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title={collapsed ? "Sair" : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="text-sm">Sair</span>}
        </button>
      </div>

      {/* Dialog for Creating New Section */}
      <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Seção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="Nome da seção"
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSection()}
            />
            <Button onClick={handleCreateSection} disabled={!newSectionTitle.trim()}>
              Criar Seção
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog for Sector Settings */}
      <SectorSettingsDialog
        sectorId={activeConfigSectorId}
        open={isConfigDialogOpen}
        onOpenChange={setIsConfigDialogOpen}
        isAdmin={isAdmin}
        isGestorOrAdmin={isGestorOrAdmin}
        currentUserId={user?.id}
      />

      {/* Dialog for Sector Deletion */}
      <AlertDialog open={!!sectorToDelete} onOpenChange={(open) => !open && setSectorToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir espaço?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Excluirá "{sectorToDelete?.name}" e todas as tarefas e rotinas associadas a ele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={async () => {
                if (sectorToDelete) {
                  await deleteSector.mutateAsync(sectorToDelete.id);
                  setSectorToDelete(null);
                }
              }}
            >
              Sim, Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
};
