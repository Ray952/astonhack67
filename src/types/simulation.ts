export type AgentState = 'at_home' | 'walking_to_stop' | 'waiting' | 'riding' | 'walking_to_dest' | 'at_destination';

export interface ScheduleEntry {
  departureMinute: number; // minute of day (0-1439)
  destination: [number, number]; // [lat, lng]
  type: 'work' | 'education' | 'shopping' | 'social' | 'home';
  label: string;
}

export interface Agent {
  id: string;
  homeLocation: [number, number];
  currentLocation: [number, number];
  targetLocation: [number, number] | null;
  nearestStopId: string | null;
  destinationStopId: string | null;
  age: number;
  ageGroup: string;
  state: AgentState;
  schedule: ScheduleEntry[];
  currentScheduleIndex: number;
  carbonEmitted: number;
  totalTimeSpent: number;
  walkingTime: number;
  waitingTime: number;
  ridingTime: number;
  distanceTraveled: number;
  currentRouteId: string | null;
}

export interface BusStop {
  id: string;
  name: string;
  location: [number, number];
}

export interface BusRoute {
  id: string;
  name: string;
  stopIds: string[];
  frequency: number; // minutes between departures
  vehicleCapacity: number;
  color: string;
  geometry: [number, number][]; // polyline points
}

export interface Vehicle {
  id: string;
  routeId: string;
  currentStopIndex: number;
  nextStopIndex: number;
  passengers: string[];
  capacity: number;
  position: [number, number];
  progress: number; // 0-1 between current and next stop
  direction: 1 | -1; // 1 = forward, -1 = reverse
}

export interface SimulationMetrics {
  totalAgents: number;
  activeAgents: number;
  walkingAgents: number;
  waitingAgents: number;
  ridingAgents: number;
  arrivedAgents: number;
  averageTravelTime: number;
  averageWaitTime: number;
  totalCO2: number;
  co2PerCapita: number;
  co2Saved: number;
  totalDistance: number;
  averageAge: number;
  accessibilityCoverage: number;
}

export interface SimulationState {
  isRunning: boolean;
  isPaused: boolean;
  currentMinute: number; // 0-1439 (minutes in a day)
  speed: number; // multiplier
  agents: Agent[];
  vehicles: Vehicle[];
  metrics: SimulationMetrics;
  generatedRoutes: BusRoute[];
  showRoutes: boolean;
  selectedAgentId: string | null;
}

export interface POI {
  id: string;
  name: string;
  location: [number, number];
  type: 'education' | 'healthcare' | 'retail' | 'employment' | 'social' | 'transport';
}
