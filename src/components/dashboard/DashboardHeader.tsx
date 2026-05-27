import { Layers, LayoutGrid, Loader2, TrendingUp, Activity } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import sirtecLogoFull from '@/assets/sirtec-logo-full-black.png';

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

interface DashboardHeaderProps {
  selectedSectorId: string | null;
  onSectorChange: (value: string | null) => void;
  sectors: Sector[] | undefined;
  loadingSectors: boolean;
  overallPercentage?: number;
}

export const DashboardHeader = ({
  selectedSectorId,
  onSectorChange,
  sectors,
  loadingSectors,
  overallPercentage = 0,
}: DashboardHeaderProps) => {
  const selectedSector = sectors?.find(s => s.id === selectedSectorId);

  return (
    <div className="relative overflow-hidden rounded-2xl gradient-hero border border-border/50 p-6 md:p-8 shadow-elevated">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary/5 blur-[100px]" />
      </div>

      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <img src={sirtecLogoFull} alt="Sirtec Sistemas Elétricos" className="h-12 object-contain" />
              {selectedSector && (
                <Badge 
                  variant="outline" 
                  className="ml-2 text-sm px-3 py-1"
                  style={{ 
                    backgroundColor: `${selectedSector.color}15`,
                    color: selectedSector.color || 'inherit',
                    borderColor: `${selectedSector.color}50`
                  }}
                >
                  {selectedSector.name}
                </Badge>
              )}
            </div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              Gerenciamento de Rotinas
            </h2>
          </div>
          <p className="text-muted-foreground text-sm md:text-base max-w-lg">
            {selectedSector 
              ? `Acompanhe o desempenho do setor ${selectedSector.name}` 
              : 'Visão consolidada de todas as rotinas e tarefas da organização'}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Quick stat */}
          <div className="hidden md:flex items-center gap-3 px-4 py-2.5 rounded-xl glass-effect">
            <div className="p-2 rounded-lg bg-success/20">
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{overallPercentage}%</p>
              <p className="text-xs text-muted-foreground">Taxa geral</p>
            </div>
          </div>

          {/* Sector selector */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass-effect">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <Select
              value={selectedSectorId || 'all'}
              onValueChange={(value) => onSectorChange(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-[180px] border-0 bg-transparent h-auto p-0 focus:ring-0">
                <SelectValue placeholder="Selecionar setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    <span>Todos os Setores</span>
                  </div>
                </SelectItem>
                {loadingSectors ? (
                  <div className="p-2 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : (
                  sectors?.map(sector => (
                    <SelectItem key={sector.id} value={sector.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: sector.color || '#6366f1' }}
                        />
                        <span>{sector.name}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};
