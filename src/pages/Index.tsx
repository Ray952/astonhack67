// src/pages/Index.tsx

import { useCallback, useEffect } from 'react';
import SimulationMap from '@/components/SimulationMap';
import ControlPanel from '@/components/ControlPanel';
import { useSimulation } from '@/hooks/useSimulation';

export default function Index() {
  const {
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
  } = useSimulation();

  // Auto-load TfWM stops on page load (optional)
  useEffect(() => {
    loadTfwmNetwork(3500).catch(err => console.error('Failed to load TfWM network:', err));
  }, [loadTfwmNetwork]);

  const handleGenerateRoute = useCallback(() => {
    generateFromFlow();
  }, [generateFromFlow]);

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
          baseRoutes={[]}                 // Skyline: no preset bus lines
          stops={state.networkStops as any} // show TfWM stops
        />
      </div>

      <ControlPanel
        state={state as any}
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
