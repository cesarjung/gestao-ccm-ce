import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { PlanejamentoEquipeRow } from '@/hooks/usePlanejamentoEquipesData';
import { startOfDay, format } from 'date-fns';
import { Layers, Maximize2, Minimize2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Fix for default marker icons in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const TEAM_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', 
  '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e', '#0f766e', 
  '#4338ca', '#b45309', '#1d4ed8', '#047857', '#be123c'
];

const getTeamColor = (equipe: string) => {
  let hash = 0;
  for (let i = 0; i < equipe.length; i++) {
    hash = equipe.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TEAM_COLORS[Math.abs(hash) % TEAM_COLORS.length];
};

const createTeamMarkerIcon = (color: string, number: number, equipe: string) => {
  const shortName = equipe.split(' ')[0].substring(0, 6);
  return L.divIcon({
    className: 'custom-team-marker bg-transparent border-0',
    html: `<div style="background-color: ${color}; padding: 2px 6px; border-radius: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold; white-space: nowrap;">${shortName} <span style="opacity: 0.7; margin: 0 3px;">|</span> ${number}</div>`,
    iconSize: [60, 24],
    iconAnchor: [30, 12]
  });
};

interface PlanejamentoEquipesMapProps {
  data: PlanejamentoEquipeRow[];
  dates: Date[];
}

const MapUpdater = () => {
  const map = useMap();
  useEffect(() => {
    // Invalida o tamanho algumas vezes na montagem para garantir que renderize quando entrar na tela
    const timeout1 = setTimeout(() => map.invalidateSize(), 100);
    const timeout2 = setTimeout(() => map.invalidateSize(), 1000);
    
    // Configura ResizeObserver para redimensionamentos contínuos (ex: Tela Cheia)
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    
    const container = map.getContainer();
    if (container) {
      resizeObserver.observe(container);
    }

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      if (container) {
        resizeObserver.unobserve(container);
      }
      resizeObserver.disconnect();
    };
  }, [map]);
  return null;
}

export const PlanejamentoEquipesMap = ({ data, dates }: PlanejamentoEquipesMapProps) => {
  const [activeTeams, setActiveTeams] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Automatically activate all teams when data changes
  useEffect(() => {
    const teams = new Set(data.map(d => d.equipe));
    setActiveTeams(teams);
  }, [data]);

  const mapData = useMemo(() => {
    if (dates.length === 0) return [];
    
    const startD = startOfDay(dates[0]);
    const endD = startOfDay(dates[dates.length - 1]);

    const visitedCoords = new Map<string, number>();

    return data.map(row => {
      const color = getTeamColor(row.equipe);
      const points: { lat: number, lng: number, date: Date, municipio: string, projetos: string[], count: number, num: number }[] = [];
      let seqNum = 1;
      let currentGroup: { latLngKey: string, municipio: string, count: number, lat: number, lng: number, date: Date, projetos: string[] } | null = null;

      const addGroupToPoints = (group: any) => {
        const baseKey = group.latLngKey;
        const visits = visitedCoords.get(baseKey) || 0;
        
        let finalLat = group.lat;
        let finalLng = group.lng;
        
        if (visits > 0) {
          // Desloca levemente para baixo/direita para não sobrepor totalmente
          // ~1.5km de diferença visual
          finalLat -= visits * 0.015;
          finalLng += visits * 0.015;
        }
        
        visitedCoords.set(baseKey, visits + 1);
        
        points.push({
          lat: finalLat,
          lng: finalLng,
          date: group.date,
          municipio: group.municipio,
          projetos: group.projetos,
          count: group.count,
          num: seqNum++
        });
      };

      row.atividadesDiarias.forEach(ativ => {
        const ativDate = startOfDay(ativ.dataParsed);
        if (ativDate >= startD && ativDate <= endD) {
          ativ.atividades.forEach(a => {
            if (a.lat !== null && a.lng !== null && a.lat !== 0 && a.lng !== 0) {
              const muni = a.municipio || "Local";
              const key = `${a.lat},${a.lng}`;
              
              if (!currentGroup) {
                currentGroup = { latLngKey: key, municipio: muni, count: 1, lat: a.lat, lng: a.lng, date: ativDate, projetos: [a.projeto] };
              } else if (currentGroup.latLngKey === key) {
                currentGroup.count++;
                if (!currentGroup.projetos.includes(a.projeto)) currentGroup.projetos.push(a.projeto);
              } else {
                // Mudou de coordenada, salva o grupo anterior
                addGroupToPoints(currentGroup);
                currentGroup = { latLngKey: key, municipio: muni, count: 1, lat: a.lat, lng: a.lng, date: ativDate, projetos: [a.projeto] };
              }
            }
          });
        }
      });
      
      // Salva o último grupo
      if (currentGroup) {
        addGroupToPoints(currentGroup);
      }

      return {
        equipe: row.equipe,
        color,
        points
      };
    }).filter(d => d.points.length > 0);
  }, [data, dates]);

  const center: [number, number] = useMemo(() => {
    if (mapData.length > 0 && mapData[0].points.length > 0) {
      return [mapData[0].points[0].lat, mapData[0].points[0].lng];
    }
    return [-7.2372, -39.3222]; // Default Ceará
  }, [mapData]);

  const toggleTeam = (equipe: string) => {
    const next = new Set(activeTeams);
    if (next.has(equipe)) {
      next.delete(equipe);
    } else {
      next.add(equipe);
    }
    setActiveTeams(next);
  };

  const toggleAll = () => {
    if (activeTeams.size === mapData.length) {
      setActiveTeams(new Set());
    } else {
      setActiveTeams(new Set(mapData.map(d => d.equipe)));
    }
  };

  const mapContent = (
    <>
      <div className="h-12 bg-secondary/95 backdrop-blur border-b border-border flex flex-col sticky top-0 z-20 flex-shrink-0">
        <div className="h-5 flex items-center justify-between px-2 border-b border-border bg-muted/50">
          <div className="flex-1"></div>
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Mapa de Trajetos do Período
          </div>
          <div className="flex-1 flex justify-end">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
            >
              {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center px-4 text-[10px] font-medium text-muted-foreground justify-between">
          <span>Linhas retas indicam a ordem cronológica das obras da equipe.</span>
        </div>
      </div>

      <div className={cn("flex-1 relative w-full", isFullscreen ? "h-full" : "min-h-[850px]")}>
        <div className="absolute inset-0">
          <MapContainer 
            center={center} 
            zoom={8} 
            scrollWheelZoom={true}
            zoomAnimation={false}
            markerZoomAnimation={false}
            style={{ height: '100%', width: '100%', zIndex: 1 }}
          >
            <MapUpdater />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {mapData.map(teamData => {
            if (!activeTeams.has(teamData.equipe)) return null;

            const latlngs: [number, number][] = teamData.points.map(p => [p.lat, p.lng]);

            return (
              <React.Fragment key={teamData.equipe}>
                {/* Route Line */}
                {latlngs.length > 1 && (
                  <Polyline 
                    positions={latlngs} 
                    color={teamData.color} 
                    weight={3} 
                    opacity={0.7} 
                    dashArray="5, 5"
                  />
                )}

                {/* Markers */}
                {teamData.points.map((pt, idx) => (
                  <Marker 
                    key={`${teamData.equipe}-${idx}`} 
                    position={[pt.lat, pt.lng]}
                    icon={createTeamMarkerIcon(teamData.color, pt.count, teamData.equipe)}
                  >
                    <Popup className="custom-popup">
                      <div className="flex flex-col gap-1 p-1 min-w-[200px]">
                        <h4 className="font-bold text-sm mb-1 border-b pb-1 truncate flex items-center justify-between" style={{ color: teamData.color }}>
                          <span>{teamData.equipe}</span>
                          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Passo {pt.num}</span>
                        </h4>
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-500">Município:</span>
                          <span className="font-bold text-slate-900">{pt.municipio}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-500">Data Chegada:</span>
                          <span className="font-medium text-slate-900">{format(pt.date, 'dd/MM/yyyy')}</span>
                        </div>
                        <div className="flex justify-between text-xs border-b pb-1">
                          <span className="font-semibold text-slate-500">Qtd. Obras:</span>
                          <span className="font-bold text-slate-900">{pt.count}</span>
                        </div>
                        <div className="flex flex-col text-[10px] mt-1 max-h-[80px] overflow-y-auto custom-scrollbar">
                          <span className="font-semibold text-slate-500 mb-0.5">Projetos:</span>
                          <span className="text-slate-700 leading-tight">
                            {pt.projetos.length > 3 
                              ? `${pt.projetos.slice(0, 3).join(', ')} e mais ${pt.projetos.length - 3}` 
                              : pt.projetos.join(', ')}
                          </span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </React.Fragment>
            );
          })}
        </MapContainer>
        </div>

        {/* Legend / Filter Overlay */}
        <div className="absolute top-4 right-4 z-[1000] bg-background/95 backdrop-blur-sm p-3 rounded-lg shadow-md border border-border w-[220px]">
          <h4 className="font-bold text-xs mb-2 flex items-center justify-between border-b border-border pb-2">
            <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-primary" /> Equipes no Mapa</span>
            <span className="text-[9px] font-normal text-muted-foreground cursor-pointer hover:underline" onClick={toggleAll}>
              {activeTeams.size === mapData.length ? 'Ocultar Todas' : 'Mostrar Todas'}
            </span>
          </h4>
          
          <ScrollArea className="h-[200px] pr-3">
            <div className="space-y-2">
              {mapData.length === 0 && (
                <div className="text-[10px] text-muted-foreground text-center py-4">
                  Nenhuma obra com coordenadas encontrada no período.
                </div>
              )}
              {mapData.map(d => (
                <div key={d.equipe} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`map-filter-${d.equipe}`} 
                    checked={activeTeams.has(d.equipe)} 
                    onCheckedChange={() => toggleTeam(d.equipe)}
                    className="w-3.5 h-3.5"
                  />
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }}></div>
                  <label 
                    htmlFor={`map-filter-${d.equipe}`}
                    className="text-[10px] font-medium leading-none cursor-pointer truncate"
                    title={d.equipe}
                  >
                    {d.equipe}
                  </label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col overflow-hidden">
        {mapContent}
      </div>
    );
  }

  return (
    <div className="w-[1400px] h-full relative flex-shrink-0 border-l border-border bg-card flex flex-col">
      {mapContent}
    </div>
  );
};
