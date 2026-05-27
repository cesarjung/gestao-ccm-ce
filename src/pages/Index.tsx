import { useState } from 'react';
import { SectorSidebar } from '@/components/SectorSidebar';
import { ContentArea } from '@/components/ContentArea';
import { NavigationContext, ViewMode } from '@/types/navigation';


const Index = () => {
  const [context, setContext] = useState<NavigationContext>({ type: 'dashboard' });
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [collapsed, setCollapsed] = useState(false);


  return (
    <div className="flex h-screen overflow-hidden bg-background w-full">
      <SectorSidebar 
        context={context} 
        onNavigate={setContext} 
        collapsed={collapsed}
        onCollapseChange={setCollapsed}
      />
      <div className="flex-1 w-full h-full flex flex-col overflow-hidden">
        <ContentArea
          context={context}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
    </div>
  );
};

export default Index;
