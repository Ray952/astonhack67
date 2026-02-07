// src/simulation/engine.ts
// Step 7: Skyline-like schedules + dwell + boundary-safe destinations
// Still: flow recording + generate proposed routes from flow

import type { Agent, SimulationMetrics, BusStop, BusRoute } from '@/types/simulation';
import {
  CARBON_FACTORS,
  randomPointInAston,
  haversineDistance,
  ASTON_BOUNDARY,
} from '@/data/astonData';

// ----------------------------------
// Safety
// ----------------------------------

function isValidLocation(loc: any): loc is [number, number] {
  return (
    Array.isArray(loc) &&
    loc.length === 2 &&
    typeof loc[0] === 'number' &&
    typeof loc[1] === 'number' &&
    Number.isFinite(loc[0]) &&
    Number.isFinite(loc[1])
  );
}

function sanitizeStops(stops: BusStop[]): BusStop[] {
  return stops.filter(s => s && s.id && isValidLocation((s as any).location));
}

// ----------------------------------
// Point in polygon (Aston boundary)
// ----------------------------------

function pointInPolygon(point: [number, number], polygon: [number, number][]) {
  const [x, y] = point; // lat, lng treated as x,y for ray casting
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

function randomPointInAstonSafe(): [number, number] {
  // Your existing randomPointInAston likely already respects boundary,
  // but we harden it just in case.
  for (let i = 0; i < 50; i++) {
    const p = randomPointInAston();
    if (pointInPolygon(p, ASTON_BOUNDARY as any)) return p;
  }
  return randomPointInAston();
}

// ----------------------------------
// Movement
// ----------------------------------

const WALK_KM_PER_MIN = 5 / 60;
const TRANSIT_KM_PER_MIN = 25 / 60;

function moveToward(
  current: [number, number],
  target: [number, number],
  stepKm: number
): { next: [number, number]; arrived: boolean; movedKm: number } {
  const d = haversineDistance(current, target);
  if (!Number.isFinite(d) || d <= 0) return { next: [...target], arrived: true, movedKm: 0 };
  if (d <= stepKm) return { next: [...target], arrived: true, movedKm: d };
  const t = stepKm / d;
  return {
    next: [
      current[0] + (target[0] - current[0]) * t,
      current[1] + (target[1] - current[1]) * t,
    ],
    arrived: false,
    movedKm: stepKm,
  };
}

// ----------------------------------
// Graph (undirected kNN) + cache
// ----------------------------------

interface GraphEdge {
  to: string;
  distanceKm: number;
}

function addEdge(edges: Map<string, GraphEdge[]>, from: string, to: string, dist: number) {
  const list = edges.get(from);
  if (!list) return;
  if (list.some(e => e.to === to)) return;
  list.push({ to, distanceKm: dist });
}

function buildTransitGraph(stops: BusStop[], k = 14) {
  const edges = new Map<string, GraphEdge[]>();
  for (const s of stops) edges.set(s.id, []);

  for (const a of stops) {
    const neighbours = stops
      .filter(b => b.id !== a.id)
      .map(b => ({ id: b.id, dist: haversineDistance(a.location, b.location) }))
      .filter(x => Number.isFinite(x.dist))
      .sort((x, y) => x.dist - y.dist)
      .slice(0, k);

    for (const n of neighbours) {
      addEdge(edges, a.id, n.id, n.dist);
      addEdge(edges, n.id, a.id, n.dist);
    }
  }
  return edges;
}

let GRAPH_KEY: string | null = null;
let GRAPH_CACHE: Map<string, GraphEdge[]> | null = null;
let PATH_CACHE = new Map<string, string[] | null>();

function stopsKey(stops: BusStop[]) {
  const n = stops.length;
  const s0 = stops[0]?.id ?? '';
  const s1 = stops[Math.min(10, n - 1)]?.id ?? '';
  return `${n}:${s0}:${s1}`;
}

function getGraph(stops: BusStop[]) {
  const key = stopsKey(stops);
  if (key === GRAPH_KEY && GRAPH_CACHE) return GRAPH_CACHE;

  GRAPH_KEY = key;
  GRAPH_CACHE = buildTransitGraph(stops, 14);
  PATH_CACHE = new Map();
  return GRAPH_CACHE;
}

function shortestPath(graph: Map<string, GraphEdge[]>, from: string, to: string): string[] | null {
  const ck = `${from}→${to}`;
  if (PATH_CACHE.has(ck)) return PATH_CACHE.get(ck)!;
  if (from === to) {
    PATH_CACHE.set(ck, [from]);
    return [from];
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const q = new Set<string>();

  for (const k of graph.keys()) {
    dist.set(k, Infinity);
    prev.set(k, null);
    q.add(k);
  }
  if (!dist.has(from) || !dist.has(to)) {
    PATH_CACHE.set(ck, null);
    return null;
  }

  dist.set(from, 0);

  while (q.size) {
    let u: string | null = null;
    let best = Infinity;
    for (const k of q) {
      const d = dist.get(k)!;
      if (d < best) {
        best = d;
        u = k;
      }
    }
    if (!u) break;
    q.delete(u);
    if (u === to) break;

    for (const e of graph.get(u) || []) {
      const alt = dist.get(u)! + e.distanceKm;
      if (alt < dist.get(e.to)!) {
        dist.set(e.to, alt);
        prev.set(e.to, u);
      }
    }
  }

  if (!prev.get(to)) {
    PATH_CACHE.set(ck, null);
    return null;
  }

  const path: string[] = [];
  let cur: string | null = to;
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur)!;
  }

  PATH_CACHE.set(ck, path);
  return path;
}

// ----------------------------------
// Nearest stop
// ----------------------------------

function nearestStop(stops: BusStop[], loc: [number, number]): BusStop {
  let best = stops[0];
  let bestDist = Infinity;
  for (const s of stops) {
    const d = haversineDistance(loc, s.location);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

// ----------------------------------
// FLOW (Skyline core) + Generate routes (Step 6)
// ----------------------------------

export type FlowEdge = {
  from: string;
  to: string;
  count: number;
  hourly: number[];
};

const FLOW = new Map<string, FlowEdge>();

function recordFlow(from: string, to: string, minute: number) {
  const hour = Math.floor(((minute % 1440) + 1440) % 1440 / 60);
  const key = `${from}→${to}`;
  let e = FLOW.get(key);
  if (!e) {
    e = { from, to, count: 0, hourly: Array(24).fill(0) };
    FLOW.set(key, e);
  }
  e.count += 1;
  e.hourly[hour] += 1;
}

export function getFlowEdges(): FlowEdge[] {
  return Array.from(FLOW.values());
}

export function clearFlow() {
  FLOW.clear();
}

type GenerateOptions = {
  topEdges?: number;
  minCount?: number;
  maxRoutes?: number;
  maxStopsPerRoute?: number;
};

function pickColor(i: number) {
  const palette = [
    'hsl(280, 70%, 60%)',
    'hsl(50, 90%, 55%)',
    'hsl(190, 80%, 55%)',
    'hsl(320, 70%, 55%)',
    'hsl(150, 70%, 50%)',
    'hsl(30, 90%, 55%)',
  ];
  return palette[i % palette.length];
}

export function generateRoutesFromFlow(stops: BusStop[], opts: GenerateOptions = {}): BusRoute[] {
  const stopById = new Map(stops.map(s => [s.id, s]));
  const {
    topEdges = 120,
    minCount = 8,
    maxRoutes = 8,
    maxStopsPerRoute = 18,
  } = opts;

  const edges = getFlowEdges()
    .filter(e => e.count >= minCount && stopById.has(e.from) && stopById.has(e.to))
    .sort((a, b) => b.count - a.count)
    .slice(0, topEdges);

  if (!edges.length) return [];

  const out = new Map<string, FlowEdge[]>();
  const inp = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    if (!inp.has(e.to)) inp.set(e.to, []);
    out.get(e.from)!.push(e);
    inp.get(e.to)!.push(e);
  }
  for (const [k, list] of out) list.sort((a, b) => b.count - a.count);
  for (const [k, list] of inp) list.sort((a, b) => b.count - a.count);

  const used = new Set<string>();
  const routes: BusRoute[] = [];
  const edgeKey = (e: FlowEdge) => `${e.from}→${e.to}`;

  function bestUnusedOutgoing(node: string) {
    const list = out.get(node) || [];
    for (const e of list) if (!used.has(edgeKey(e))) return e;
    return null;
  }
  function bestUnusedIncoming(node: string) {
    const list = inp.get(node) || [];
    for (const e of list) if (!used.has(edgeKey(e))) return e;
    return null;
  }

  for (const seed of edges) {
    if (routes.length >= maxRoutes) break;
    if (used.has(edgeKey(seed))) continue;

    const forward: string[] = [seed.from, seed.to];
    used.add(edgeKey(seed));

    while (forward.length < maxStopsPerRoute) {
      const last = forward[forward.length - 1];
      const next = bestUnusedOutgoing(last);
      if (!next) break;
      if (forward.includes(next.to)) {
        used.add(edgeKey(next));
        break;
      }
      forward.push(next.to);
      used.add(edgeKey(next));
    }

    const backward: string[] = [];
    while (backward.length + forward.length < maxStopsPerRoute) {
      const first = backward.length ? backward[0] : forward[0];
      const prev = bestUnusedIncoming(first);
      if (!prev) break;
      if (backward.includes(prev.from) || forward.includes(prev.from)) {
        used.add(edgeKey(prev));
        break;
      }
      backward.unshift(prev.from);
      used.add(edgeKey(prev));
    }

    const stopIds = [...backward, ...forward];
    const geometry = stopIds
      .map(id => stopById.get(id)?.location)
      .filter((p): p is [number, number] => !!p);

    if (stopIds.length >= 3 && geometry.length === stopIds.length) {
      routes.push({
        id: `flow_route_${Date.now()}_${routes.length}`,
        name: `Proposed Corridor ${routes.length + 1}`,
        stopIds,
        frequency: 10,
        vehicleCapacity: 0,
        color: pickColor(routes.length),
        geometry,
      });
    }
  }

  return routes;
}

// ----------------------------------
// Step 7: Daily schedules (minimal, type-safe)
// ----------------------------------

type Trip = {
  depart: number; // minute of day
  destination: [number, number];
};

const DAY = 24 * 60;

function randInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function makeSchedule(agent: Agent): Trip[] {
  const home = agent.homeLocation;
  const schedule: Trip[] = [];

  // Students
  if (agent.age < 18) {
    schedule.push({ depart: 8 * 60 + randInt(-20, 30), destination: randomPointInAstonSafe() });
    schedule.push({ depart: 15 * 60 + randInt(-15, 45), destination: home });
  }
  // Working adults (most)
  else if (agent.age < 65 && Math.random() < 0.65) {
    schedule.push({ depart: 7 * 60 + randInt(-40, 70), destination: randomPointInAstonSafe() }); // “work”
    schedule.push({ depart: 17 * 60 + randInt(-20, 80), destination: home });
    // occasional shopping after work
    if (Math.random() < 0.25) {
      schedule.splice(1, 0, { depart: 18 * 60 + randInt(0, 60), destination: randomPointInAstonSafe() });
      schedule.push({ depart: 19 * 60 + randInt(0, 90), destination: home });
    }
  }
  // Others / retired
  else {
    if (Math.random() < 0.7) {
      schedule.push({ depart: 11 * 60 + randInt(-30, 60), destination: randomPointInAstonSafe() });
      schedule.push({ depart: 13 * 60 + randInt(0, 120), destination: home });
    }
  }

  schedule.sort((a, b) => a.depart - b.depart);
  return schedule;
}

// ----------------------------------
// Agents
// ----------------------------------

export function createAgents(count: number): Agent[] {
  const agents: Agent[] = [];

  for (let i = 0; i < count; i++) {
    const home = randomPointInAstonSafe();
    const age = Math.floor(Math.random() * 80) + 5;

    const agent: Agent = {
      id: `agent_${i}`,
      homeLocation: home,
      currentLocation: [...home],
      targetLocation: null,
      nearestStopId: null,
      destinationStopId: null,
      age,
      ageGroup: age < 18 ? 'child' : age < 65 ? 'adult' : 'senior',
      state: 'at_home',
      schedule: [],
      currentScheduleIndex: 0,
      carbonEmitted: 0,
      totalTimeSpent: 0,
      walkingTime: 0,
      waitingTime: 0,
      ridingTime: 0,
      distanceTraveled: 0,
      currentRouteId: null,
    };

    // Store schedule on the agent without touching your types
    (agent as any)._daily = makeSchedule(agent);
    (agent as any)._mode = 'idle';

    agents.push(agent);
  }

  return agents;
}

// ----------------------------------
// Simulation step (schedule-driven)
// ----------------------------------

export function stepSimulation(
  agents: Agent[],
  _vehicles: any[],
  minute: number,
  _routes: BusRoute[],
  rawStops?: BusStop[]
) {
  if (!rawStops || rawStops.length < 2) return { agents, vehicles: [] };

  const stops = sanitizeStops(rawStops);
  if (stops.length < 2) return { agents, vehicles: [] };

  const graph = getGraph(stops);
  const t = ((minute % DAY) + DAY) % DAY;

  for (const agent of agents) {
    const a = agent as any;
    const daily: Trip[] = a._daily || [];
    const idx: number = a._tripIndex ?? 0;

    // If idle: only depart when schedule says so
    if (!a._mode || a._mode === 'idle') {
      const next = daily[idx];
      if (!next) {
        agent.state = 'at_home';
        agent.targetLocation = null;
        continue;
      }

      if (t < next.depart) {
        // wait / dwell
        agent.state = idx === 0 ? 'at_home' : 'at_destination';
        agent.targetLocation = null;
        continue;
      }

      // depart now
      agent.targetLocation = next.destination;

      const origin = nearestStop(stops, agent.currentLocation);
      const dest = nearestStop(stops, agent.targetLocation);

      agent.nearestStopId = origin.id;
      agent.destinationStopId = dest.id;

      a._path = shortestPath(graph, origin.id, dest.id);
      a._pathIndex = 0;
      a._mode = a._path ? 'transit' : 'walk_direct';
      agent.state = a._path ? 'riding' : 'walking_to_dest';
    }

    // Transit (records flow)
    if (a._mode === 'transit' && a._path) {
      const path = a._path as string[];
      if (a._pathIndex >= path.length - 1) {
        // reached last stop → final walk to destination
        a._mode = 'walk_final';
        agent.state = 'walking_to_dest';
        continue;
      }

      const fromId = path[a._pathIndex];
      const toId = path[a._pathIndex + 1];
      const toStop = stops.find(s => s.id === toId);
      if (!toStop) {
        a._mode = 'walk_direct';
        continue;
      }

      const m = moveToward(agent.currentLocation, toStop.location, TRANSIT_KM_PER_MIN);
      agent.currentLocation = m.next;
      agent.ridingTime++;
      agent.distanceTraveled += m.movedKm;
      agent.carbonEmitted += (CARBON_FACTORS.bus_base_per_km * m.movedKm) / 1000;
      agent.state = 'riding';

      recordFlow(fromId, toId, minute);

      if (m.arrived) a._pathIndex++;
      agent.totalTimeSpent = agent.walkingTime + agent.ridingTime;
      continue;
    }

    // Final walk after transit
    if (a._mode === 'walk_final' && agent.targetLocation) {
      const m = moveToward(agent.currentLocation, agent.targetLocation, WALK_KM_PER_MIN);
      agent.currentLocation = m.next;
      agent.walkingTime++;
      agent.distanceTraveled += m.movedKm;
      agent.state = 'walking_to_dest';

      if (m.arrived) {
        agent.targetLocation = null;
        a._mode = 'idle';
        a._tripIndex = (a._tripIndex ?? 0) + 1;
        agent.state = 'at_destination';
      }
      agent.totalTimeSpent = agent.walkingTime + agent.ridingTime;
      continue;
    }

    // Direct walking fallback
    if (a._mode === 'walk_direct' && agent.targetLocation) {
      const m = moveToward(agent.currentLocation, agent.targetLocation, WALK_KM_PER_MIN);
      agent.currentLocation = m.next;
      agent.walkingTime++;
      agent.distanceTraveled += m.movedKm;
      agent.state = 'walking_to_dest';

      if (m.arrived) {
        agent.targetLocation = null;
        a._mode = 'idle';
        a._tripIndex = (a._tripIndex ?? 0) + 1;
        agent.state = 'at_destination';
      }
      agent.totalTimeSpent = agent.walkingTime + agent.ridingTime;
      continue;
    }
  }

  return { agents, vehicles: [] };
}

// ----------------------------------
// Metrics
// ----------------------------------

export function calculateMetrics(agents: Agent[]): SimulationMetrics {
  const totalCO2 = agents.reduce((s, a) => s + a.carbonEmitted, 0);
  const totalDist = agents.reduce((s, a) => s + a.distanceTraveled, 0);

  const riding = agents.filter(a => a.state === 'riding').length;
  const walking = agents.filter(a => a.state === 'walking_to_stop' || a.state === 'walking_to_dest').length;
  const arrived = agents.filter(a => a.state === 'at_destination').length;

  return {
    totalAgents: agents.length,
    activeAgents: agents.length - arrived,
    walkingAgents: walking,
    waitingAgents: 0,
    ridingAgents: riding,
    arrivedAgents: arrived,
    averageTravelTime: agents.length ? agents.reduce((s, a) => s + a.totalTimeSpent, 0) / agents.length : 0,
    averageWaitTime: 0,
    totalCO2: Math.round(totalCO2 * 100) / 100,
    co2PerCapita: agents.length ? Math.round((totalCO2 / agents.length) * 1000) / 1000 : 0,
    co2Saved: 0,
    totalDistance: Math.round(totalDist * 100) / 100,
    averageAge: agents.length ? agents.reduce((s, a) => s + a.age, 0) / agents.length : 0,
    accessibilityCoverage: 100,
  };
}
