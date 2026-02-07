// src/hooks/useSimulation.ts
// Step 9: Before/After analysis snapshots (Skyline demo narrative)

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent, SimulationMetrics, BusRoute, BusStop } from '@/types/simulation';
import { BUS_STOPS, ASTON_CENSUS } from '@/data/astonData';
import {
  createAgents,
  stepSimulation,
  calculateMetrics,
  generateRoutesFromFlow,
  clearFlow,
  getFlowEdges,
} from '@/simulation/engine';

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

async function fetchTfwmNetwork(bufferMeters = 3500) {
  const res = await fetch(`http://127.0.0.1:8000/api/network?bufferMeters=${bufferMeters}`);
  if (!res.ok) throw new Error('Failed to load TfWM network');
  return res.json();
}

const DEFAULT_SIM_MINUTES = 6 * 60; // 06:00 -> 12:00 window

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
  demandCapturedPct: number; // 0..100
  demandCapturedTraversals: number;
  efficiency: number; // traversals per route-km
};

function computeFlowSummary(minute: number) {
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
    // We can’t import haversine from data here safely without causing circulars,
    // so approximate using a cheap fallback: treat as haversine-ish via engine’s existing flow graph
    // BUT we *can* do a simple equirectangular approximation in degrees.
    const [lat1, lon1] = geometry[i];
    const [lat2, lon2] = geometry[i + 1];
    const R = 6371; // km
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

  // Captured can double-count if routes overlap; clamp at total
  captured = Math.min(captured, totalTraversals);

  const pct = totalTraversals > 0 ? (captured / totalTraversals) * 100 : 0;

  return { capturedTraversals: captured, totalTraversals, capturedPct: pct };
}

export function useSimulation() {
  const [state, setState] = useState<any>({
    agents: [],
    vehicles: [],
    generatedRoutes: [],

    networkStops: BUS_STOPS,
    networkLoaded: false,

    currentMinute: 0,
    isRunning: false,
    isPaused: false,
    speed: 1,
    showRoutes: true,
    selectedAgentId: null,

    metrics: EMPTY_METRICS,

    simStartMinute: 6 * 60,
    simDurationMinutes: DEFAULT_SIM_MINUTES,

    // Step 9 analysis snapshots
    analysis: {
      baseline: null as AnalysisSnapshot | null,
      proposal: null as ProposalSnapshot | null,
    },
  });

  const timerRef = useRef<number | null>(null);

  const loadTfwmNetwork = useCallback(async (bufferMeters = 3500) => {
    const net = await fetchTfwmNetwork(bufferMeters);

    const stops: BusStop[] = (net.stops ?? [])
      .map((s: any) => ({
        id: String(s.id),
        name: String(s.name ?? s.id),
        location: [Number(s.lat), Number(s.lng)] as [number, number],
      }))
      .filter(s => Number.isFinite(s.location[0]) && Number.isFinite(s.location[1]));

    setState((prev: any) => ({
      ...prev,
      networkStops: stops.length ? stops : BUS_STOPS,
      networkLoaded: stops.length > 0,
    }));
  }, []);

  const start = useCallback(() => {
    const agentCount = Math.min(800, ASTON_CENSUS.totalPopulation);
    const agents = createAgents(agentCount);

    clearFlow();

    setState((prev: any) => ({
      ...prev,
      agents,
      vehicles: [],
      generatedRoutes: [],
      currentMinute: prev.simStartMinute,
      isRunning: true,
      isPaused: false,
      metrics: EMPTY_METRICS,
      analysis: { baseline: null, proposal: null },
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

        // Auto-pause + snapshot baseline once
        if (prev.currentMinute >= endMinute) {
          if (!prev.analysis?.baseline) {
            const flow = computeFlowSummary(prev.currentMinute);
            const baseline: AnalysisSnapshot = {
              minute: prev.currentMinute,
              edges: flow.edgesCount,
              totalTraversals: flow.totalTraversals,
              peakHour: flow.peakHour,
              totalCO2: prev.metrics.totalCO2,
              totalDistanceKm: prev.metrics.totalDistance,
            };
            return {
              ...prev,
              isPaused: true,
              analysis: { ...prev.analysis, baseline },
            };
          }
          return { ...prev, isPaused: true };
        }

        const result = stepSimulation(prev.agents, [], prev.currentMinute, [], prev.networkStops);

        const agents: Agent[] = result.agents.map(a => ({
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
  const toggleRoutes = useCallback(() => setState((prev: any) => ({ ...prev, showRoutes: !prev.showRoutes })), []);
  const selectAgent = useCallback((id: string | null) => setState((prev: any) => ({ ...prev, selectedAgentId: id })), []);

  const clearGeneratedRoutes = useCallback(() => {
    setState((prev: any) => ({
      ...prev,
      generatedRoutes: [],
      analysis: { ...prev.analysis, proposal: null },
    }));
  }, []);

  // ✅ Step 6 + Step 9: Generate + compute proposal snapshot
  const generateFromFlow = useCallback(() => {
    setState((prev: any) => {
      const routes = generateRoutesFromFlow(prev.networkStops, {
        topEdges: 120,
        minCount: 8,
        maxRoutes: 8,
        maxStopsPerRoute: 18,
      });

      const { capturedTraversals, totalTraversals, capturedPct } = computeDemandCapturedByRoutes(routes);

      const routeKm = routes.reduce((s, r) => s + (r.geometry ? routeLengthKm(r.geometry as any) : 0), 0);
      const efficiency = routeKm > 0 ? capturedTraversals / routeKm : 0;

      const proposal: ProposalSnapshot = {
        minute: prev.currentMinute,
        routesCount: routes.length,
        routeKm: Math.round(routeKm * 100) / 100,
        demandCapturedPct: Math.round(capturedPct * 10) / 10,
        demandCapturedTraversals: capturedTraversals,
        efficiency: Math.round(efficiency * 10) / 10,
      };

      return {
        ...prev,
        generatedRoutes: routes,
        analysis: { ...prev.analysis, proposal },
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
    toggleRoutes,
    selectAgent,
    clearGeneratedRoutes,
    loadTfwmNetwork,
    generateFromFlow,
  };
}
