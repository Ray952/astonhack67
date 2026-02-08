// src/hooks/useSimulation.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent, SimulationMetrics, BusRoute, POI, BusStop } from '@/types/simulation';
import { ASTON_CENSUS, buildCity, randomHomeLocation, BUS_STOPS,BUS_ROUTES, POIS as FALLBACK_POIS } from '@/data/astonData';
import {
  createAgents,
  stepSimulation,
  calculateMetrics,
  generateRoutesFromFlow,
  clearFlow,
  getFlowEdges,
} from '@/simulation/engine';
import { fetchAstonPOIs } from '@/api/osm';
import { enrichRoutesWithOsrmGeometry } from '@/simulation/osrmGeometry';

const EMPTY_METRICS: SimulationMetrics = {
  totalAgents: 0,
  activeAgents: 0,
  walkingAgents: 0,
  waitingAgents: 0,
  ridingAgents: 0,
  arrivedAgents: 0,
  averageTravelTime: 0,
  averageWaitTime: 0,
  totalCO2: 0,
  co2PerCapita: 0,
  co2Saved: 0,
  totalDistance: 0,
  averageAge: 0,
  accessibilityCoverage: 0,
};

type AnalysisSnapshot = {
  minute: number;
  edges: number;
  totalTraversals: number;
  peakHour: number;
  totalCO2: number;
  totalDistanceKm: number;
};

type ProposalSnapshot = {
  minute: number;
  routesCount: number;
  routeKm: number;
  demandCapturedPct: number;
  demandCapturedTraversals: number;
  efficiency: number;
};

function computeFlowSummary() {
  const edges = getFlowEdges();
  const hourly = Array(24).fill(0);
  let totalTraversals = 0;

  for (const e of edges) {
    totalTraversals += e.count;
    for (let h = 0; h < 24; h++) hourly[h] += e.hourly[h] || 0;
  }

  const peakHour = hourly.reduce((bestH, v, h) => (v > hourly[bestH] ? h : bestH), 0);
  return { edgesCount: edges.length, totalTraversals, peakHour };
}

function routeLengthKm(geometry: [number, number][]) {
  let sum = 0;
  for (let i = 0; i < geometry.length - 1; i++) {
    const [lat1, lon1] = geometry[i];
    const [lat2, lon2] = geometry[i + 1];
    const R = 6371;
    const x = ((lon2 - lon1) * Math.PI / 180) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    const y = ((lat2 - lat1) * Math.PI / 180);
    sum += Math.sqrt(x * x + y * y) * R;
  }
  return sum;
}

function computeDemandCapturedByRoutes(generatedRoutes: BusRoute[]) {
  const flows = getFlowEdges();
  const flowByEdge = new Map<string, number>();
  let totalTraversals = 0;

  for (const f of flows) {
    flowByEdge.set(`${f.from}→${f.to}`, f.count);
    totalTraversals += f.count;
  }

  let captured = 0;
  for (const r of generatedRoutes) {
    if (!r.stopIds || r.stopIds.length < 2) continue;
    for (let i = 0; i < r.stopIds.length - 1; i++) {
      captured += flowByEdge.get(`${r.stopIds[i]}→${r.stopIds[i + 1]}`) ?? 0;
    }
  }

  captured = Math.min(captured, totalTraversals);
  const pct = totalTraversals > 0 ? (captured / totalTraversals) * 100 : 0;
  return { capturedTraversals: captured, totalTraversals, capturedPct: pct };
}

export function useSimulation() {
  const [state, setState] = useState<any>({
    agents: [],
    vehicles: [],
    generatedRoutes: [],
    scenario: 'baseline', // 'baseline' | 'proposal'
initialAgents: null,
baseRoutes: BUS_ROUTES,


    networkStops: BUS_STOPS,
    networkLoaded: false,

    pois: FALLBACK_POIS as POI[],
    poiLoaded: false,

    currentMinute: 0,
    isRunning: false,
    isPaused: false,
    speed: 1,

    showFlow: true,
    showCorridors: true,
    showPOIs: true,

    selectedAgentId: null,

    metrics: EMPTY_METRICS,

    simStartMinute: 6 * 60,
    simDurationMinutes: 16 * 60,

    analysis: {
      baseline: null as AnalysisSnapshot | null,
      proposal: null as ProposalSnapshot | null,
    },
  });

  // Keep the latest state for async helpers (like OSRM enrichment)
  const stateRef = useRef<any>(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const timerRef = useRef<number | null>(null);

  const start = useCallback(async () => {
    const seed = 1337;
    const agentCount = Math.min(800, ASTON_CENSUS.totalPopulation);

    let realPois: POI[] = [];
    try {
      realPois = (await fetchAstonPOIs({ maxPois: 600 })) as any;
      console.log('[OSM] POIs loaded:', realPois.length);
    } catch (e) {
      console.warn('[OSM] POI fetch failed, using fallback POIs:', e);
      realPois = [];
    }

    const city = buildCity(seed, { poiCount: 500, stopCount: 80 });
    const pois = (realPois && realPois.length > 20 ? realPois : city.pois) as POI[];
    const stops = city.stops;

    console.log('[SIM] city seed', seed, 'POIs', pois.length, 'Stops', stops.length);

    const agents = createAgents(agentCount, pois, () => randomHomeLocation(seed));
    const initialAgents = JSON.parse(JSON.stringify(agents));


    clearFlow();

    setState((prev: any) => ({
      ...prev,
      networkStops: stops,
      networkLoaded: true,
      

      pois,
      poiLoaded: true,

      agents,
      vehicles: [],
      generatedRoutes: [],
      currentMinute: prev.simStartMinute,
      isRunning: true,
      isPaused: false,
      metrics: EMPTY_METRICS,
      analysis: { baseline: null, proposal: null },
      initialAgents,
      scenario: 'baseline',
      
    }));
  }, []);

  const pause = useCallback(() => setState((prev: any) => ({ ...prev, isPaused: true })), []);
  const resume = useCallback(() => setState((prev: any) => ({ ...prev, isPaused: false })), []);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    clearFlow();
    setState((prev: any) => ({
      ...prev,
      agents: [],
      vehicles: [],
      generatedRoutes: [],
      currentMinute: 0,
      isRunning: false,
      isPaused: false,
      metrics: EMPTY_METRICS,
      analysis: { baseline: null, proposal: null },
    }));
  }, []);

  useEffect(() => {
    if (!state.isRunning || state.isPaused) return;

    timerRef.current = window.setInterval(() => {
      setState((prev: any) => {
        const endMinute = prev.simStartMinute + prev.simDurationMinutes;

        if (prev.currentMinute >= endMinute) {
          if (!prev.analysis?.baseline) {
            const flow = computeFlowSummary();
            const baseline: AnalysisSnapshot = {
              minute: prev.currentMinute,
              edges: flow.edgesCount,
              totalTraversals: flow.totalTraversals,
              peakHour: flow.peakHour,
              totalCO2: prev.metrics.totalCO2,
              totalDistanceKm: prev.metrics.totalDistance,
            };
            return { ...prev, isPaused: true, analysis: { ...prev.analysis, baseline } };
          }
          return { ...prev, isPaused: true };
        }

// decide which world we are simulating
// baseline = demand (no buses, generate flows)
// proposal = assignment (buses + waiting)

// baseline = demand only (walk-only) — no routes
const simMode = prev.scenario === 'proposal' ? 'assignment' : 'demand';

// proposal = allow both baseline routes + generated corridors
const activeRoutes =
  simMode === 'assignment'
    ? [...(prev.baseRoutes ?? []), ...(prev.generatedRoutes ?? [])]
    : [];



const result = stepSimulation(
  prev.agents,
  [],
  prev.currentMinute,
  activeRoutes,
  prev.networkStops,
  simMode
);


        const agents: Agent[] = result.agents.map((a: Agent) => ({
          ...a,
          currentLocation: [a.currentLocation[0], a.currentLocation[1]] as [number, number],
        }));

        const metrics = calculateMetrics(agents);

        return {
          ...prev,
          agents,
          currentMinute: prev.currentMinute + 1,
          metrics,
        };
      });
    }, Math.max(20, 100 / state.speed));

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.isRunning, state.isPaused, state.speed, state.networkStops]);

  const setSpeed = useCallback((speed: number) => setState((prev: any) => ({ ...prev, speed })), []);
  const toggleCorridors = useCallback(() => setState((prev: any) => ({ ...prev, showCorridors: !prev.showCorridors })), []);
  const toggleFlow = useCallback(() => setState((prev: any) => ({ ...prev, showFlow: !prev.showFlow })), []);
  const togglePOIs = useCallback(() => setState((prev: any) => ({ ...prev, showPOIs: !prev.showPOIs })), []);
  const selectAgent = useCallback((id: string | null) => setState((prev: any) => ({ ...prev, selectedAgentId: id })), []);

  const clearGeneratedRoutes = useCallback(() => {
    setState((prev: any) => ({
      ...prev,
      generatedRoutes: [],
      analysis: { ...prev.analysis, proposal: null },
    }));
  }, []);

  // ✅ OSRM-enriched Generate
  const generateFromFlow = useCallback(async () => {
    const prev = stateRef.current;
    const stops: BusStop[] = prev.networkStops;

    const routes = generateRoutesFromFlow(stops, {
      topEdges: 120,
      minCount: 8,
      maxRoutes: 8,
      maxStopsPerRoute: 18,
    });

    // Enrich with OSRM road-following geometry
    const enriched = await enrichRoutesWithOsrmGeometry(routes, stops, 'driving');


    const { capturedTraversals, capturedPct } = computeDemandCapturedByRoutes(enriched);
    const routeKm = enriched.reduce(
      (s: number, r: BusRoute) => s + (r.geometry ? routeLengthKm(r.geometry as any) : 0),
      0
    );
    const efficiency = routeKm > 0 ? capturedTraversals / routeKm : 0;

    const proposal: ProposalSnapshot = {
      minute: prev.currentMinute,
      routesCount: enriched.length,
      routeKm: Math.round(routeKm * 100) / 100,
      demandCapturedPct: Math.round(capturedPct * 10) / 10,
      demandCapturedTraversals: capturedTraversals,
      efficiency: Math.round(efficiency * 10) / 10,
    };

setState((s: any) => {
  // reset agents back to their original initial state
  const resetAgents = s.initialAgents
    ? JSON.parse(JSON.stringify(s.initialAgents))
    : s.agents;

  // optional but recommended: keep baseline flows separate from proposal run
  clearFlow();

  return {
    ...s,
    generatedRoutes: enriched,
    analysis: { ...s.analysis, proposal },

    agents: resetAgents,
    currentMinute: s.simStartMinute,

    isRunning: true,
    isPaused: false,

    scenario: 'proposal',
    metrics: EMPTY_METRICS,
    selectedAgentId: null,
  };
});
  }, []);

  return {
    state,
    start,
    pause,
    resume,
    reset,
    setSpeed,
    selectAgent,
    clearGeneratedRoutes,
    generateFromFlow,
    toggleFlow,
    toggleCorridors,
    togglePOIs,
  };
}
