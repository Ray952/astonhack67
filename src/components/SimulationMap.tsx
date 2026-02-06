import { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Agent, Vehicle } from '@/types/simulation';
import { ASTON_BOUNDARY, ASTON_CENTER, ASTON_ZOOM, BUS_STOPS, BUS_ROUTES } from '@/data/astonData';
import type { BusRoute } from '@/types/simulation';

// Age to color interpolation (yellow-green to emerald)
function ageToColor(age: number): string {
  const t = Math.min(age / 90, 1);
  const h = 80 + t * 72; // 80 (yellow-green) to 152 (emerald)
  const s = 70;
  const l = 55 - t * 10; // slightly darker for older
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Agent state to opacity
function stateToOpacity(state: Agent['state']): number {
  switch (state) {
    case 'at_home': return 0.4;
    case 'walking_to_stop': return 0.8;
    case 'waiting': return 0.9;
    case 'riding': return 1;
    case 'walking_to_dest': return 0.8;
    case 'at_destination': return 0.3;
    default: return 0.5;
  }
}

// Agent state to radius
function stateToRadius(state: Agent['state']): number {
  switch (state) {
    case 'riding': return 5;
    case 'waiting': return 4.5;
    case 'walking_to_stop':
    case 'walking_to_dest': return 4;
    default: return 3;
  }
}

interface SimulationMapProps {
  agents: Agent[];
  vehicles: Vehicle[];
  showRoutes: boolean;
  generatedRoutes: BusRoute[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
}

export default function SimulationMap({
  agents,
  vehicles,
  showRoutes,
  generatedRoutes,
  selectedAgentId,
  onSelectAgent,
}: SimulationMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const agentLayerRef = useRef<L.LayerGroup | null>(null);
  const vehicleLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const boundaryLayerRef = useRef<L.Polygon | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: ASTON_CENTER,
      zoom: ASTON_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    // Dark CartoDB tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Add Aston boundary
    const boundary = L.polygon(
      ASTON_BOUNDARY.map(([lat, lng]) => [lat, lng] as L.LatLngTuple),
      {
        color: 'hsl(152, 70%, 45%)',
        weight: 1.5,
        opacity: 0.4,
        fillColor: 'hsl(152, 70%, 45%)',
        fillOpacity: 0.03,
        dashArray: '5, 5',
      }
    ).addTo(map);
    boundaryLayerRef.current = boundary;

    // Create layers
    agentLayerRef.current = L.layerGroup().addTo(map);
    vehicleLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    stopsLayerRef.current = L.layerGroup().addTo(map);

    // Add bus stops
    for (const stop of BUS_STOPS) {
      L.circleMarker(stop.location, {
        radius: 5,
        color: 'hsl(210, 15%, 50%)',
        weight: 1,
        fillColor: 'hsl(210, 15%, 30%)',
        fillOpacity: 0.8,
      })
        .bindTooltip(stop.name, {
          className: 'stop-tooltip',
          direction: 'top',
          offset: [0, -8],
        })
        .addTo(stopsLayerRef.current!);
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update routes
  useEffect(() => {
    if (!routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();

    if (!showRoutes) return;

    const allRoutes = [...BUS_ROUTES, ...generatedRoutes];
    for (const route of allRoutes) {
      L.polyline(route.geometry, {
        color: route.color,
        weight: 3,
        opacity: 0.6,
        dashArray: generatedRoutes.includes(route) ? '8, 4' : undefined,
      })
        .bindTooltip(route.name, { sticky: true })
        .addTo(routeLayerRef.current!);
    }
  }, [showRoutes, generatedRoutes]);

  // Update agents (using canvas-like approach with circle markers)
  const agentMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  useEffect(() => {
    if (!agentLayerRef.current) return;

    const existingMarkers = agentMarkersRef.current;
    const currentAgentIds = new Set(agents.map(a => a.id));

    // Remove markers for agents that no longer exist
    for (const [id, marker] of existingMarkers) {
      if (!currentAgentIds.has(id)) {
        agentLayerRef.current.removeLayer(marker);
        existingMarkers.delete(id);
      }
    }

    // Update or create markers
    for (const agent of agents) {
      const color = ageToColor(agent.age);
      const opacity = stateToOpacity(agent.state);
      const radius = stateToRadius(agent.state);
      const isSelected = agent.id === selectedAgentId;

      let marker = existingMarkers.get(agent.id);
      if (marker) {
        marker.setLatLng(agent.currentLocation);
        marker.setStyle({
          fillColor: isSelected ? '#ffffff' : color,
          fillOpacity: isSelected ? 1 : opacity,
          radius: isSelected ? 8 : radius,
          weight: isSelected ? 2 : 0,
          color: isSelected ? '#ffffff' : color,
        });
      } else {
        marker = L.circleMarker(agent.currentLocation, {
          radius: isSelected ? 8 : radius,
          fillColor: isSelected ? '#ffffff' : color,
          fillOpacity: isSelected ? 1 : opacity,
          weight: isSelected ? 2 : 0,
          color: isSelected ? '#ffffff' : color,
        });
        marker.on('click', () => onSelectAgent(agent.id));
        marker.addTo(agentLayerRef.current!);
        existingMarkers.set(agent.id, marker);
      }
    }
  }, [agents, selectedAgentId, onSelectAgent]);

  // Update vehicles
  useEffect(() => {
    if (!vehicleLayerRef.current) return;
    vehicleLayerRef.current.clearLayers();

    for (const vehicle of vehicles) {
      const route = [...BUS_ROUTES, ...generatedRoutes].find(r => r.id === vehicle.routeId);
      if (!route) continue;

      L.circleMarker(vehicle.position, {
        radius: 7,
        fillColor: route.color,
        fillOpacity: 0.9,
        weight: 2,
        color: '#ffffff',
        opacity: 0.5,
      })
        .bindTooltip(
          `${route.name}<br/>${vehicle.passengers.length}/${vehicle.capacity} passengers`,
          { direction: 'top' }
        )
        .addTo(vehicleLayerRef.current!);
    }
  }, [vehicles, generatedRoutes]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full"
      style={{ minHeight: '100vh' }}
    />
  );
}
