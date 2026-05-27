import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { CarteiraRow } from '@/hooks/useCarteiraDashboardData';

export const NativeMarkers = ({ 
  obras, 
  alojamentos, 
  createMarkerIcon, 
  createAlojamentoIcon,
  onObraClick,
  onAlojClick
}: { 
  obras: CarteiraRow[], 
  alojamentos: any[],
  createMarkerIcon: (status: string, postes: number) => L.DivIcon,
  createAlojamentoIcon: (isBase: boolean) => L.DivIcon,
  onObraClick: (obra: CarteiraRow) => void,
  onAlojClick: (aloj: any) => void
}) => {
  const map = useMap();

  useEffect(() => {
    const layerGroup = L.layerGroup().addTo(map);

    alojamentos.forEach(aloj => {
      const isBase = aloj.nome.toLowerCase().includes('base');
      const marker = L.marker([aloj.latitude, aloj.longitude], {
        icon: createAlojamentoIcon(isBase)
      });
      marker.on('click', () => onAlojClick(aloj));
      layerGroup.addLayer(marker);
    });

    obras.slice(0, 300).forEach(obra => {
      if (!obra.latitude || !obra.longitude) return;
      const marker = L.marker([obra.latitude, obra.longitude], {
        icon: createMarkerIcon(obra.statusExecucao || '', obra.postesDisponiveis || 0)
      });
      marker.on('click', () => onObraClick(obra));
      layerGroup.addLayer(marker);
    });

    return () => {
      layerGroup.clearLayers();
      if (map.hasLayer(layerGroup)) {
        map.removeLayer(layerGroup);
      }
    };
  }, [map, obras, alojamentos, createMarkerIcon, createAlojamentoIcon, onObraClick, onAlojClick]);

  return null;
};
