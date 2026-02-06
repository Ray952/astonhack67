import { useCallback } from 'react';
import SimulationMap from '@/components/SimulationMap';
import ControlPanel from '@/components/ControlPanel';
import { useSimulation } from '@/hooks/useSimulation';
import { BUS_STOPS, haversineDistance } from '@/data/astonData';
import type { BusRoute } from '@/types/simulation';

function generateOptimizedRoute(agents: { currentLocation: [number, number]; state: string }[]): BusRoute {
  const activeAgents = agents.filter(a =>
    a.state === 'waiting' || a.state === 'walking_to_stop' || a.state === 'walking_to_dest'
  );

  const gridSize = 0.003;
  const grid = new Map<string, { lat: number; lng: number; count: number }>();
  for (const agent of activeAgents) {
    const key = `${Math.floor(agent.currentLocation[0] / gridSize)}_${Math.floor(agent.currentLocation[1] / gridSize)}`;
    const existing = grid.get(key);
    if (existing) { existing.lat += agent.currentLocation[0]; existing.lng += agent.currentLocation[1]; existing.count++; }
    else { grid.set(key, { lat: agent.currentLocation[0], lng: agent.currentLocation[1], count: 1 }); }
  }

  const sorted = Array.from(grid.values())
    .map(g => [g.lat / g.count, g.lng / g.count] as [number, number])
    .slice(0, 6);

  const routeStops: string[] = [];
  for (const point of sorted) {
    let nearest = BUS_STOPS[0];
    let minDist = Infinity;
    for (const stop of BUS_STOPS) {
      const d = haversineDistance(point, stop.location);
      if (d < minDist && !routeStops.includes(stop.id)) { minDist = d; nearest = stop; }
    }
    if (!routeStops.includes(nearest.id)) routeStops.push(nearest.id);
  }
  while (routeStops.length < 4) {
    const rs = BUS_STOPS[Math.floor(Math.random() * BUS_STOPS.length)];
    if (!routeStops.includes(rs.id)) routeStops.push(rs.id);
  }

  const colors = ['hsl(280, 70%, 60%)', 'hsl(50, 90%, 55%)', 'hsl(320, 70%, 55%)', 'hsl(180, 70%, 50%)'];
  const geometry = routeStops.map(id => {
    const stop = BUS_STOPS.find(s => s.id === id);
    return stop ? stop.location : [0, 0] as [number, number];
  });

  return {
    id: `gen_route_${Date.now()}`,
    name: `Opt-${Math.floor(Math.random() * 900) + 100} (Generated)`,
    stopIds: routeStops,
    frequency: 10,
    vehicleCapacity: 80,
    color: colors[Math.floor(Math.random() * colors.length)],
    geometry,
  };
}

export default function Index() {
  const { state, start, pause, resume, reset, setSpeed, toggleRoutes, selectAgent, addGeneratedRoute, clearGeneratedRoutes } = useSimulation();

  const handleGenerateRoute = useCallback(() => {
    const route = generateOptimizedRoute(state.agents);
    addGeneratedRoute(route);
  }, [state.agents, addGeneratedRoute]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="flex-1 relative">
        <SimulationMap
          agents={state.agents}
          vehicles={state.vehicles}
          showRoutes={state.showRoutes}
          generatedRoutes={state.generatedRoutes}
          selectedAgentId={state.selectedAgentId}
          onSelectAgent={selectAgent}
        />
      </div>
      <ControlPanel
        state={state}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onReset={reset}
        onSetSpeed={setSpeed}
        onToggleRoutes={toggleRoutes}
        onGenerateRoute={handleGenerateRoute}
        onClearRoutes={clearGeneratedRoutes}
      />
    </div>
  );
}
