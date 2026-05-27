import { useState, useEffect } from 'react';
import { DashboardPanel, useReorderDashboardPanels } from '@/hooks/useDashboardPanels';
import { CustomPanel } from './CustomPanel';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DraggablePanelListProps {
  panels: DashboardPanel[];
}

export const DraggablePanelList = ({ panels: initialPanels }: DraggablePanelListProps) => {
  // Use local state for immediate visual updates
  const [panels, setPanels] = useState(initialPanels);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const reorderPanels = useReorderDashboardPanels();

  // Sync with prop changes when not dragging
  useEffect(() => {
    if (!draggedId) {
      setPanels(initialPanels);
    }
  }, [initialPanels, draggedId]);

  const handleDragStart = (e: React.DragEvent, panelId: string) => {
    setDraggedId(panelId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', panelId);
    
    // Add a small delay to allow the drag image to be created
    setTimeout(() => {
      const element = e.target as HTMLElement;
      element.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const element = e.target as HTMLElement;
    element.style.opacity = '1';
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, panelId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (panelId !== draggedId && draggedId) {
      setDragOverId(panelId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    // Find indices
    const dragIndex = panels.findIndex(p => p.id === draggedId);
    const dropIndex = panels.findIndex(p => p.id === targetId);

    if (dragIndex === -1 || dropIndex === -1) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    // Create new order immediately in local state
    const newPanels = [...panels];
    const [movedPanel] = newPanels.splice(dragIndex, 1);
    newPanels.splice(dropIndex, 0, movedPanel);

    // Update local state immediately
    setPanels(newPanels);

    // Update order indexes for database
    const updates = newPanels.map((panel, index) => ({
      id: panel.id,
      order_index: index
    }));

    // Persist to database
    reorderPanels.mutate(updates);
    
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      {panels.map((panel) => (
        <div
          key={panel.id}
          draggable
          onDragStart={(e) => handleDragStart(e, panel.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, panel.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, panel.id)}
          className={cn(
            'relative group transition-all duration-200 cursor-grab active:cursor-grabbing',
            draggedId === panel.id && 'opacity-50 scale-[0.98]',
            dragOverId === panel.id && draggedId !== panel.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg'
          )}
        >
          {/* Drag Handle - Always visible */}
          <div className="absolute left-0 top-0 bottom-0 w-8 z-10 flex items-center justify-center cursor-grab active:cursor-grabbing bg-gradient-to-r from-muted/80 to-transparent rounded-l-lg opacity-60 hover:opacity-100 transition-opacity">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </div>
          
          {/* Panel with left padding to accommodate grip */}
          <div className="pl-6">
            <CustomPanel panel={panel} />
          </div>
        </div>
      ))}
    </div>
  );
};
