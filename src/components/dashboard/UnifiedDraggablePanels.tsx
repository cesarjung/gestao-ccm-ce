import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  useDraggable,
  DragOverlay,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardPanel, useReorderDashboardPanels } from '@/hooks/useDashboardPanels';
import { CustomPanel } from './CustomPanel';
import { GripVertical, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Types for unified panel system
export type UnifiedPanel = {
  id: string;
  type: 'custom';
  panel?: DashboardPanel;
  position: { x: number; y: number };
};

interface UnifiedDraggablePanelsProps {
  customPanels: DashboardPanel[];
  selectedSectorId?: string | null;
  renderUnitsPanel: () => React.ReactNode;
  renderResponsiblesPanel: () => React.ReactNode;
}

// Hook to fetch dashboard layout from database
const useDashboardLayout = (sectorId?: string | null) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard-layout', sectorId],
    queryFn: async () => {
      if (!user) return [];

      let dataToProcess: any[] = [];

      try {
        if (sectorId) {
          // Fetch sector-specific layout
          const { data: sectorData, error: sectorError } = await supabase
            .from('dashboard_layout')
            .select('*')
            .eq('sector_id', sectorId);

          if (!sectorError && Array.isArray(sectorData) && sectorData.length > 0) {
            dataToProcess = sectorData;
          } else {
            // Fallback to global
            const { data: globalData, error: globalErr } = await supabase
              .from('dashboard_layout')
              .select('*')
              .is('sector_id', null);

            if (!globalErr && Array.isArray(globalData)) {
              dataToProcess = globalData;
            }
          }
        } else {
          // Fetch global layout directly
          const { data: globalData, error: globalErr } = await supabase
            .from('dashboard_layout')
            .select('*')
            .is('sector_id', null);

          if (!globalErr && Array.isArray(globalData)) {
            dataToProcess = globalData;
          }
        }
      } catch (err) {
        console.error('Safe try/catch in useDashboardLayout:', err);
      }

      // Since multiple admins/gestors might have saved layouts with their own user_id,
      // we want to extract the global "most recent" layout for each panel.
      const layoutMap = new Map<string, any>();

      // Sort data by updated_at desc to prioritize the latest configurations
      const sortedData = [...dataToProcess].sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
        const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
        return dateB - dateA; // Descending
      });

      for (const item of sortedData) {
        if (!layoutMap.has(item.panel_id)) {
          layoutMap.set(item.panel_id, item);
        }
      }

      return Array.from(layoutMap.values());
    },
    enabled: !!user,
    // Refetch periodically to get updates
    refetchInterval: 30000,
    staleTime: 10000,
  });
};

// Hook to save dashboard layout
const useSaveDashboardLayout = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ panels, sectorId }: { panels: UnifiedPanel[], sectorId?: string | null }) => {
      if (!user) throw new Error('User not authenticated');

      console.log('Saving layout for sector:', sectorId, 'Panels:', panels.length);

      // 1. Delete existing layout for this context
      let deleteQuery = supabase
        .from('dashboard_layout')
        .delete()
        .eq('user_id', user.id);

      if (sectorId) {
        deleteQuery = deleteQuery.eq('sector_id', sectorId);
      } else {
        deleteQuery = deleteQuery.is('sector_id', null);
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw deleteError;
      }

      // 2. Insert new positions
      if (panels.length > 0) {
        const updates = panels.map(panel => ({
          user_id: user.id,
          sector_id: sectorId || null,
          panel_id: panel.id,
          position_x: Math.round(panel.position.x),
          position_y: Math.round(panel.position.y),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }));

        const { error: insertError } = await supabase
          .from('dashboard_layout')
          .insert(updates);

        if (insertError) {
          console.error('Insert error:', insertError);
          throw insertError;
        }
      }
    },
    onMutate: async ({ panels, sectorId }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['dashboard-layout', sectorId] });

      // Snapshot the previous value
      const previousLayout = queryClient.getQueryData(['dashboard-layout', sectorId]);

      // Optimistically update to the new value
      const optimisticLayout = panels.map(p => ({
        panel_id: p.id,
        position_x: Math.round(p.position.x),
        position_y: Math.round(p.position.y),
        user_id: user.id,
        sector_id: sectorId || null,
      }));

      // We need to merge this with existing layout items that weren't in the panels array (if any)
      // But for this view, 'panels' contains everything we care about for this user/sector
      queryClient.setQueryData(['dashboard-layout', sectorId], (old: any[] | undefined) => {
        if (!old) return optimisticLayout;

        // Create a map of the new positions
        const newPositionsMap = new Map(optimisticLayout.map(i => [i.panel_id, i]));

        // return merged array: items in old that aren't in new (preserve them) + all new items
        const preserved = old.filter(item => !newPositionsMap.has(item.panel_id));
        return [...preserved, ...optimisticLayout];
      });

      return { previousLayout };
    },
    onError: (err, variables, context) => {
      console.error('Error saving layout:', err);
      toast.error(`Erro ao salvar layout: ${err.message}`);
      if (context?.previousLayout) {
        queryClient.setQueryData(['dashboard-layout', variables.sectorId], context.previousLayout);
      }
    },
    onSuccess: () => {
      toast.success('Layout salvo!');
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-layout', variables.sectorId] });
    },
  });
};

// Draggable Panel Component
interface DraggablePanelProps {
  panel: UnifiedPanel;
  renderContent: () => React.ReactNode;
  canDrag: boolean;
}

const DraggablePanel = ({ panel, renderContent, canDrag }: DraggablePanelProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: panel.id,
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    left: panel.position.x,
    top: panel.position.y,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'absolute transition-shadow duration-200 w-[calc(50%-1rem)] min-w-[300px]',
        isDragging && 'opacity-50 z-50 shadow-2xl'
      )}
    >
      {/* Drag Handle */}
      <div
        {...(canDrag ? { ...attributes, ...listeners } : {})}
        className={cn(
          "absolute left-0 top-0 bottom-0 w-8 z-[60] flex items-center justify-center bg-gradient-to-r from-muted/90 to-transparent rounded-l-lg transition-opacity touch-none",
          canDrag
            ? "cursor-grab active:cursor-grabbing opacity-100 ring-1 ring-border/50"
            : "cursor-not-allowed opacity-40"
        )}
        title={canDrag ? "Arraste para reposicionar" : "Somente administradores podem reorganizar"}
      >
        {canDrag ? (
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        ) : (
          <Lock className="w-3 h-3 text-muted-foreground" />
        )}
      </div>

      <div className="pl-6">
        {renderContent()}
      </div>
    </div>
  );
};

// Drag Overlay Component  
const DragOverlayContent = ({ panel, selectedSectorId, renderUnitsPanel, renderResponsiblesPanel }: {
  panel: UnifiedPanel;
  selectedSectorId?: string | null;
  renderUnitsPanel: () => React.ReactNode;
  renderResponsiblesPanel: () => React.ReactNode;
}) => {
  const renderContent = () => {
    switch (panel.type) {
      case 'custom':
        return panel.panel ? <CustomPanel panel={panel.panel} dashboardSectorId={selectedSectorId} /> : null;
      case 'units':
        return renderUnitsPanel();
      case 'responsibles':
        return renderResponsiblesPanel();
    }
  };

  return (
    <div className="relative opacity-90 shadow-2xl rounded-lg w-[calc(50vw-2rem)] min-w-[300px] max-w-[600px]">
      <div className="absolute left-0 top-0 bottom-0 w-8 z-[60] flex items-center justify-center cursor-grabbing bg-gradient-to-r from-muted/90 to-transparent rounded-l-lg ring-1 ring-border/50">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="pl-6">
        {renderContent()}
      </div>
    </div>
  );
};

export const UnifiedDraggablePanels = ({
  customPanels,
  selectedSectorId,
  renderUnitsPanel,
  renderResponsiblesPanel,
}: UnifiedDraggablePanelsProps) => {
  const { user } = useAuth();
  const { isAdmin, isLoading: isLoadingRole } = useIsAdmin();
  const { data: savedLayout, isLoading: isLoadingLayout } = useDashboardLayout(selectedSectorId);
  const saveLayout = useSaveDashboardLayout();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  // Calculate initial grid positions (2 columns)
  const getInitialPosition = (index: number) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const panelHeight = 300;
    const gap = 16;

    return {
      x: col * 400, // offset for second column
      y: row * (panelHeight + gap),
    };
  };

  const buildPanelList = useCallback((): UnifiedPanel[] => {
    const layoutMapById: Record<string, { x: number; y: number }> = {};
    const layoutMapByTitle: Record<string, { x: number; y: number }> = {};

    savedLayout?.forEach(item => {
      layoutMapById[item.panel_id] = { x: item.position_x, y: item.position_y };

      // Map by title if we know the global panel's title for this ID
      const globalPanel = customPanels?.find(p => p.id === item.panel_id);
      if (globalPanel?.title) {
        layoutMapByTitle[globalPanel.title] = { x: item.position_x, y: item.position_y };
      }
    });

    const panels: UnifiedPanel[] = [];
    let fallbackIndex = 0;

    customPanels.forEach(panel => {
      let position = layoutMapById[panel.id];

      // If ID didn't match (because it's a Sector copy of a Global panel), match by literal Title
      if (!position && layoutMapByTitle[panel.title]) {
        position = layoutMapByTitle[panel.title];
      }

      // If completely completely unmapped, append to sequential empty slots
      if (!position) {
        position = getInitialPosition(fallbackIndex);
        fallbackIndex++;
      } else {
        // Increment fallback index if position occupies early slot naturally
        // to prevent collisions, but we can just blindly increment
        fallbackIndex++;
      }

      panels.push({
        id: panel.id,
        type: 'custom',
        panel,
        position,
      });
    });

    return panels;
  }, [customPanels, savedLayout]);

  const [panels, setPanels] = useState<UnifiedPanel[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Rebuild panels whenever savedLayout or customPanels changes
  useEffect(() => {
    if (isLoadingLayout) return;

    // Don't update while dragging
    if (activeId !== null) return;

    const newPanels = buildPanelList();
    setPanels(newPanels);
    setInitialized(true);
  }, [customPanels, savedLayout, isLoadingLayout, buildPanelList, activeId]);

  // Update container height based on panel positions
  useEffect(() => {
    if (panels.length === 0) return;
    const maxY = Math.max(...panels.map(p => p.position.y + 300), 600);
    setContainerHeight(maxY + 50);
  }, [panels]);

  const handleDragStart = (event: DragStartEvent) => {
    if (!isAdmin) return;
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    setActiveId(null);

    if (!isAdmin || !delta) return;

    const panelIndex = panels.findIndex(p => p.id === active.id);
    if (panelIndex === -1) return;

    const panel = panels[panelIndex];
    const newPosition = {
      x: Math.max(0, panel.position.x + delta.x),
      y: Math.max(0, panel.position.y + delta.y),
    };

    const newPanels = [...panels];
    newPanels[panelIndex] = {
      ...panel,
      position: newPosition,
    };

    setPanels(newPanels);

    // Save to database (admin only - RLS will enforce this)
    console.log('handleDragEnd sectorId:', selectedSectorId);
    saveLayout.mutate({ panels: newPanels, sectorId: selectedSectorId });
  };

  const renderPanelContent = (panel: UnifiedPanel) => {
    switch (panel.type) {
      case 'custom':
        return panel.panel ? <CustomPanel panel={panel.panel} dashboardSectorId={selectedSectorId} /> : null;
      case 'units':
        return renderUnitsPanel();
      case 'responsibles':
        return renderResponsiblesPanel();
    }
  };

  const activePanel = activeId ? panels.find(p => p.id === activeId) : null;

  if (panels.length === 0 || isLoadingLayout || isLoadingRole) return null;

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {!isAdmin && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 bg-muted/30 px-3 py-1.5 rounded-md w-fit">
          <Lock className="w-3 h-3" />
          <span>Layout definido pelo administrador</span>
        </div>
      )}

      <div
        className="relative w-full"
        style={{ minHeight: containerHeight }}
      >
        {panels.map((panel) => (
          <DraggablePanel
            key={panel.id}
            panel={panel}
            renderContent={() => renderPanelContent(panel)}
            canDrag={isAdmin}
          />
        ))}
      </div>

      <DragOverlay>
        {activePanel && isAdmin && (
          <DragOverlayContent
            panel={activePanel}
            selectedSectorId={selectedSectorId}
            renderUnitsPanel={renderUnitsPanel}
            renderResponsiblesPanel={renderResponsiblesPanel}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
};
