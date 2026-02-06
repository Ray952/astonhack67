import { useState, useCallback, useRef, useEffect } from 'react';
import type { SimulationState, BusRoute } from '@/types/simulation';
import { BUS_ROUTES } from '@/data/astonData';
import { createAgents, createVehicles, stepSimulation, calculateMetrics } from '@/simulation/engine';

const INITIAL_AGENT_COUNT = 500;

const initialMetrics = {
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

export function useSimulation() {
  const [state, setState] = useState<SimulationState>({
    isRunning: false,
    isPaused: false,
    currentMinute: 360, // Start at 6:00 AM
    speed: 1,
    agents: [],
    vehicles: [],
    metrics: initialMetrics,
    generatedRoutes: [],
    showRoutes: true,
    selectedAgentId: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const initialize = useCallback(() => {
    const agents = createAgents(INITIAL_AGENT_COUNT);
    const vehicles = createVehicles(BUS_ROUTES);
    const metrics = calculateMetrics(agents);

    setState({
      isRunning: false,
      isPaused: false,
      currentMinute: 360,
      speed: 1,
      agents,
      vehicles,
      metrics,
      generatedRoutes: [],
      showRoutes: true,
      selectedAgentId: null,
    });
  }, []);

  const tick = useCallback(() => {
    setState(prev => {
      if (!prev.isRunning || prev.isPaused) return prev;

      const allRoutes = [...BUS_ROUTES, ...prev.generatedRoutes];
      const { agents, vehicles } = stepSimulation(
        [...prev.agents],
        [...prev.vehicles],
        prev.currentMinute,
        allRoutes,
      );

      const newMinute = prev.currentMinute + 1;

      // Calculate metrics every 5 ticks for performance
      const metrics = newMinute % 5 === 0 ? calculateMetrics(agents) : prev.metrics;

      // Stop at end of day (23:59)
      if (newMinute >= 1440) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return {
          ...prev,
          agents,
          vehicles,
          currentMinute: 1440,
          metrics: calculateMetrics(agents),
          isRunning: false,
        };
      }

      return {
        ...prev,
        agents,
        vehicles,
        currentMinute: newMinute,
        metrics,
      };
    });
  }, []);

  const start = useCallback(() => {
    if (stateRef.current.agents.length === 0) {
      initialize();
    }

    setState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
    }));

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 100); // ~10fps base
  }, [initialize, tick]);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: true }));
  }, []);

  const resume = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: false }));
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    initialize();
  }, [initialize]);

  const setSpeed = useCallback((speed: number) => {
    setState(prev => ({ ...prev, speed }));
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(tick, Math.max(20, 100 / speed));
    }
  }, [tick]);

  const toggleRoutes = useCallback(() => {
    setState(prev => ({ ...prev, showRoutes: !prev.showRoutes }));
  }, []);

  const selectAgent = useCallback((agentId: string | null) => {
    setState(prev => ({ ...prev, selectedAgentId: agentId }));
  }, []);

  const addGeneratedRoute = useCallback((route: BusRoute) => {
    setState(prev => ({
      ...prev,
      generatedRoutes: [...prev.generatedRoutes, route],
      vehicles: [...prev.vehicles, ...createVehicles([route])],
    }));
  }, []);

  const clearGeneratedRoutes = useCallback(() => {
    setState(prev => ({
      ...prev,
      generatedRoutes: [],
      vehicles: prev.vehicles.filter(v =>
        BUS_ROUTES.some(r => r.id === v.routeId)
      ),
    }));
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    state,
    start,
    pause,
    resume,
    reset,
    setSpeed,
    toggleRoutes,
    selectAgent,
    addGeneratedRoute,
    clearGeneratedRoutes,
  };
}
