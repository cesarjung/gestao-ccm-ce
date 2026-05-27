import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMapEvents, Polyline, GeoJSON, CircleMarker, LayerGroup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { LatLng } from 'leaflet';
import { CarteiraRow } from '@/hooks/useCarteiraDashboardData';
import { NativeMarkers } from './NativeMarkers';

import { useAlojamentos } from '@/hooks/useAlojamentos';
import { useState, useEffect } from 'react';
import { Ruler, Navigation, Trash2, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Fix for default marker icons in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CarteiraMapViewProps {
  obras: CarteiraRow[];
}

const STATUS_COLORS: Record<string, string> = {
  'CONCLUÍD': 'bg-green-600',
  'CONCLUID': 'bg-green-600',
  'ENERGIZAD': 'bg-yellow-500',
  'PROGRAMAD': 'bg-blue-500',
  'EM ANDAMENTO': 'bg-purple-500',
  'EXECUÇÃO': 'bg-purple-500',
  'VISTORIAD': 'bg-cyan-500',
  'INAPT': 'bg-red-500',
  'SEM ORÇAMENTO': 'bg-orange-500',
  'default': 'bg-slate-400'
};

const getStatusColor = (s: string) => {
  if (!s) return STATUS_COLORS.default;
  const upperS = s.toUpperCase();
  for (const key in STATUS_COLORS) {
    if (upperS.includes(key)) return STATUS_COLORS[key];
  }
  return STATUS_COLORS.default;
};

const getPostesTextColor = (postes: number) => {
  if (postes <= 10) return '#ffffff'; // White
  if (postes <= 20) return '#67e8f9'; // Cyan-300
  if (postes <= 30) return '#fde047'; // Yellow-300
  if (postes <= 100) return '#fdba74'; // Orange-300
  return '#fca5a5'; // Red-300
};

const createMarkerIcon = (status: string, postes: number) => {
  const colorClass = getStatusColor(status);
  const textColor = getPostesTextColor(postes);
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="${colorClass} w-8 h-8 rounded-full border-[2px] border-white shadow-md flex items-center justify-center text-[11px] font-bold leading-none tracking-tighter" style="color: ${textColor}; text-shadow: 1px 1px 3px rgba(0,0,0,0.9);">${postes}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};


const createAlojamentoIcon = (isBase: boolean) => {
  const bgColor = isBase ? 'bg-blue-600' : 'bg-green-600';
  const svgIcon = isBase 
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building-2 text-white"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home text-white"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
  
  return L.divIcon({
    className: 'custom-alojamento-icon',
    html: `<div class="${bgColor} w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center">${svgIcon}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

type MeasureMode = 'none' | 'straight' | 'route';

interface RouteData {
  distance: number;
  duration: number;
  geometry: any;
}

const MapMeasureEvents = ({ 
  mode, 
  points, 
  setPoints 
}: { 
  mode: MeasureMode; 
  points: LatLng[]; 
  setPoints: React.Dispatch<React.SetStateAction<LatLng[]>> 
}) => {
  useMapEvents({
    click(e) {
      if (mode !== 'none') {
        setPoints(prev => [...prev, e.latlng]);
      }
    },
    contextmenu(e) {
      if (mode !== 'none') {
        setPoints(prev => prev.slice(0, -1));
      }
    }
  });
  return null;
};

const NativeRoutes = ({ 
  measureMode, 
  measurePoints, 
  routeData
}: { 
  measureMode: MeasureMode; 
  measurePoints: LatLng[]; 
  routeData: RouteData | null;
}) => {
  const map = useMap();

  useEffect(() => {
    const layerGroup = L.layerGroup().addTo(map);

    if (measureMode !== 'none') {
      measurePoints.forEach((pt, idx) => {
        const marker = L.circleMarker(pt, {
          radius: 4,
          color: '#3b82f6',
          fillColor: '#ffffff',
          fillOpacity: 1,
          weight: 2
        }).bindTooltip(`Ponto ${idx + 1}`);
        layerGroup.addLayer(marker);
      });
    }

    if (measureMode === 'straight' && measurePoints.length > 1) {
      const polyline = L.polyline(measurePoints, {
        color: '#f59e0b',
        weight: 3,
        dashArray: '5, 10'
      });
      layerGroup.addLayer(polyline);
    }

    if (measureMode === 'route' && routeData && routeData.geometry) {
      const geoJsonLayer = L.geoJSON(routeData.geometry, {
        style: {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.8
        }
      });
      layerGroup.addLayer(geoJsonLayer);
    }

    return () => {
      layerGroup.clearLayers();
      if (map.hasLayer(layerGroup)) {
        map.removeLayer(layerGroup);
      }
    };
  }, [map, measureMode, measurePoints, routeData]);

  return null;
};

const HighlightMarker = ({ activePopupObra, activePopupAloj }: { activePopupObra: any, activePopupAloj: any }) => {
  const map = useMap();
  
  useEffect(() => {
    const layerGroup = L.layerGroup().addTo(map);
    
    if (activePopupObra && activePopupObra.latitude) {
      const circle = L.circleMarker([activePopupObra.latitude, activePopupObra.longitude], {
        radius: 22,
        color: '#ef4444', // red-500
        fillColor: '#ef4444',
        fillOpacity: 0.25,
        weight: 3,
        dashArray: '5, 5'
      });
      layerGroup.addLayer(circle);
    }
    
    if (activePopupAloj && activePopupAloj.latitude) {
      const circle = L.circleMarker([activePopupAloj.latitude, activePopupAloj.longitude], {
        radius: 22,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.25,
        weight: 3,
        dashArray: '5, 5'
      });
      layerGroup.addLayer(circle);
    }
    
    return () => {
      layerGroup.clearLayers();
      if (map.hasLayer(layerGroup)) {
        map.removeLayer(layerGroup);
      }
    };
  }, [map, activePopupObra, activePopupAloj]);
  
  return null;
};

export const CarteiraMapView = ({ obras }: CarteiraMapViewProps) => {
  // Posição padrão (Ceará) se nenhuma obra tiver coordenadas
  const defaultCenter: [number, number] = [-7.2372, -39.3222];
  
  const obrasComCoords = obras.filter(o => o.latitude !== null && o.longitude !== null);
  
  const center = obrasComCoords.length > 0 
    ? [obrasComCoords[0].latitude!, obrasComCoords[0].longitude!] as [number, number]
    : defaultCenter;

  const { alojamentos } = useAlojamentos();
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none');
  const [measurePoints, setMeasurePoints] = useState<LatLng[]>([]);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [activePopupObra, setActivePopupObra] = useState<CarteiraRow | null>(null);
  const [activePopupAloj, setActivePopupAloj] = useState<any | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  
  // Extract unique Unidade Nomes from current filtered obras
  const unidadesNoMapa = Array.from(new Set(obras.map(o => o.unidadeNome))).filter(Boolean);
  
  // Only show alojamentos that belong to the filtered units
  const alojamentosAtivos = alojamentos.filter(a => unidadesNoMapa.includes(a.unidadeNome));

  // Limpa os popups ativos (e seus círculos de destaque) caso o item seja ocultado pelos filtros
  useEffect(() => {
    if (activePopupObra) {
      const stillExists = obras.some(o => o.id === activePopupObra.id);
      if (!stillExists) setActivePopupObra(null);
    }
  }, [obras, activePopupObra]);

  useEffect(() => {
    if (activePopupAloj) {
      const stillExists = alojamentosAtivos.some(a => a.id === activePopupAloj.id);
      if (!stillExists) setActivePopupAloj(null);
    }
  }, [alojamentosAtivos, activePopupAloj]);

  const straightDistance = measurePoints.reduce((acc, pt, idx, arr) => {
    if (idx === 0) return acc;
    return acc + pt.distanceTo(arr[idx - 1]);
  }, 0);

  useEffect(() => {
    const fetchRoute = async () => {
      if (measureMode !== 'route' || measurePoints.length < 2) {
        setRouteData(null);
        return;
      }
      setIsRouting(true);
      try {
        const coords = measurePoints.map(p => `${p.lng},${p.lat}`).join(';');
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
        const data = await res.json();
        if (data.code === 'Ok' && data.routes.length > 0) {
          setRouteData({
            distance: data.routes[0].distance,
            duration: data.routes[0].duration,
            geometry: data.routes[0].geometry
          });
        }
      } catch (err) {
        console.error("Erro ao buscar rota:", err);
      } finally {
        setIsRouting(false);
      }
    };
    
    const timer = setTimeout(fetchRoute, 500);
    return () => clearTimeout(timer);
  }, [measurePoints, measureMode]);

  const clearMeasurement = () => {
    setMeasurePoints([]);
    setRouteData(null);
  };

  const toggleMode = (mode: MeasureMode) => {
    if (measureMode === mode) {
      setMeasureMode('none');
    } else {
      setMeasureMode(mode);
    }
  };

  const formatDistance = (meters: number) => {
    return (meters / 1000).toFixed(1) + ' km';
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="w-full h-full min-h-[500px] rounded-xl overflow-hidden border border-border shadow-sm z-0 relative">
      <MapContainer 
        center={center} 
        zoom={6} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%', zIndex: 1, cursor: measureMode !== 'none' ? 'crosshair' : 'grab' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapMeasureEvents mode={measureMode} points={measurePoints} setPoints={setMeasurePoints} />
        <NativeRoutes measureMode={measureMode} measurePoints={measurePoints} routeData={routeData} />
        <HighlightMarker activePopupObra={activePopupObra} activePopupAloj={activePopupAloj} />
        <NativeMarkers 
          obras={obrasComCoords}
          alojamentos={alojamentosAtivos}
          createMarkerIcon={createMarkerIcon}
          createAlojamentoIcon={createAlojamentoIcon}
          onObraClick={(obra) => {
            setActivePopupObra(obra);
            if (measureMode !== 'none') {
              setMeasurePoints(prev => [...prev, L.latLng(obra.latitude!, obra.longitude!)]);
            }
          }}
          onAlojClick={(aloj) => {
            setActivePopupAloj(aloj);
            if (measureMode !== 'none') {
              setMeasurePoints(prev => [...prev, L.latLng(aloj.latitude, aloj.longitude)]);
            }
          }}
        />
        
        {activePopupAloj && (
          <Popup position={[activePopupAloj.latitude, activePopupAloj.longitude]} onClose={() => setActivePopupAloj(null)} offset={[0, -10]} className="custom-popup">
            <div className="flex flex-col gap-1 p-1 min-w-[150px]">
              <h4 className="font-bold text-sm text-slate-800 mb-1 border-b pb-1">{activePopupAloj.nome}</h4>
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-500">Unidade:</span>
                <span className="font-medium text-slate-900">{activePopupAloj.unidadeNome}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-500">Capacidade:</span>
                <span className="font-medium text-slate-900">{activePopupAloj.capacidade} pessoas</span>
              </div>
            </div>
          </Popup>
        )}

        {activePopupObra && (
          <Popup position={[activePopupObra.latitude!, activePopupObra.longitude!]} onClose={() => setActivePopupObra(null)} offset={[0, -10]} className="custom-popup">
            <div className="flex flex-col gap-1 p-1 min-w-[200px]">
              <h4 className="font-bold text-sm text-orange-600 mb-1 border-b pb-1 truncate max-w-[250px]" title={`${activePopupObra.projeto} - ${activePopupObra.titulo}`}>{activePopupObra.projeto} - {activePopupObra.titulo}</h4>
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-500">Unidade:</span>
                <span className="font-medium text-slate-900">{activePopupObra.unidadeNome}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-500">Status:</span>
                <span className="font-medium text-slate-900">{activePopupObra.statusExecucao || 'Não informado'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-500">Postes:</span>
                <span className="font-medium text-slate-900">{activePopupObra.postesDisponiveis}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-500">Valor:</span>
                <span className="font-medium text-slate-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(activePopupObra.capacidadeFaturamento)}
                </span>
              </div>
            </div>
          </Popup>
        )}
      </MapContainer>
      
      {/* Control Panel (Top Right) */}
      <div className="absolute top-4 right-4 z-[1000] bg-background/95 backdrop-blur-sm p-3 rounded-lg shadow-md border border-border w-[280px]">
        <h4 className="font-bold text-sm mb-3 flex items-center gap-2 border-b border-border pb-2">
          <Ruler className="w-4 h-4 text-primary" /> Ferramenta de Medição
        </h4>
        
        <div className="flex gap-2 mb-3">
          <Button 
            variant={measureMode === 'straight' ? 'default' : 'outline'} 
            size="sm" 
            className={`flex-1 text-xs h-8 ${measureMode === 'straight' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
            onClick={() => toggleMode('straight')}
          >
            <Move className="w-3 h-3 mr-1" />
            Linha Reta
          </Button>
          <Button 
            variant={measureMode === 'route' ? 'default' : 'outline'} 
            size="sm" 
            className={`flex-1 text-xs h-8 ${measureMode === 'route' ? 'bg-blue-500 hover:bg-blue-600 text-white' : ''}`}
            onClick={() => toggleMode('route')}
          >
            <Navigation className="w-3 h-3 mr-1" />
            Estradas
          </Button>
        </div>

        {measureMode !== 'none' && (
          <div className="bg-secondary/30 rounded-md p-2 text-xs mb-3 space-y-2 border border-border">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Pontos:</span>
              <span className="font-bold bg-background px-2 py-0.5 rounded border border-border">{measurePoints.length}</span>
            </div>
            
            {measureMode === 'straight' && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-medium">Distância:</span>
                <span className="font-bold text-amber-500">{formatDistance(straightDistance)}</span>
              </div>
            )}
            
            {measureMode === 'route' && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Dist. Rodoviária:</span>
                  <span className="font-bold text-blue-500">{routeData ? formatDistance(routeData.distance) : isRouting ? 'Calculando...' : '0.0 km'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Tempo Estimado:</span>
                  <span className="font-bold">{routeData ? formatDuration(routeData.duration) : isRouting ? 'Calculando...' : '0m'}</span>
                </div>
              </>
            )}
            
            {measurePoints.length === 0 && (
              <div className="text-center text-[10px] text-muted-foreground italic pt-1">
                Clique no mapa para marcar pontos.
              </div>
            )}
          </div>
        )}

        <Button 
          variant="destructive" 
          size="sm" 
          className="w-full text-xs h-8"
          disabled={measurePoints.length === 0}
          onClick={clearMeasurement}
        >
          <Trash2 className="w-3 h-3 mr-2" />
          Limpar Pontos
        </Button>
      </div>

      {/* Legenda (Bottom Right) */}
      <div className="absolute bottom-6 right-6 z-[1000] bg-background/95 backdrop-blur-sm p-3 rounded-lg shadow-md border border-border text-xs">
        <h4 className="font-bold mb-2">Legenda (Status)</h4>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-600 border border-white"></div> CONCLUÍDA</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500 border border-white"></div> ENERGIZADA</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500 border border-white"></div> PROGRAMADA</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500 border border-white"></div> EM ANDAMENTO</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-cyan-500 border border-white"></div> VISTORIADA</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500 border border-white"></div> SEM ORÇAMENTO</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 border border-white"></div> INAPTA</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-400 border border-white"></div> OUTROS / S/ INF.</div>
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <h4 className="font-bold mb-2">Qtd. Postes</h4>
          <div className="space-y-1.5 font-bold tracking-tight">
            <div className="flex items-center gap-2"><span style={{ color: '#ffffff', textShadow: '1px 1px 2px #000' }}>Até 10</span></div>
            <div className="flex items-center gap-2"><span style={{ color: '#67e8f9', textShadow: '1px 1px 2px #000' }}>11 a 20</span></div>
            <div className="flex items-center gap-2"><span style={{ color: '#fde047', textShadow: '1px 1px 2px #000' }}>21 a 30</span></div>
            <div className="flex items-center gap-2"><span style={{ color: '#fdba74', textShadow: '1px 1px 2px #000' }}>31 a 100</span></div>
            <div className="flex items-center gap-2"><span style={{ color: '#fca5a5', textShadow: '1px 1px 2px #000' }}>Acima de 100</span></div>
          </div>
        </div>

          <div className="mt-3 pt-3 border-t border-border">
            <h4 className="font-bold mb-2">Locais e Bases</h4>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-green-600 border border-white flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
                Alojamentos
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-600 border border-white flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg></div>
                Bases / Indústria
              </div>
            </div>
          </div>
      </div>
    </div>
  );
};
