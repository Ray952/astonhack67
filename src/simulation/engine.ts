import type { Agent, Vehicle, SimulationMetrics, BusRoute, ScheduleEntry } from '@/types/simulation';
import {
  ASTON_CENSUS,
  BUS_STOPS,
  BUS_ROUTES,
  POIS,
  CARBON_FACTORS,
  randomPointInAston,
  haversineDistance,
  findNearestStop,
  findDestinationStop,
} from '@/data/astonData';

// Generate a random age based on census distribution
function generateAge(): number {
  const bands = ASTON_CENSUS.ageBands;
  const total = bands.reduce((s, b) => s + b.count, 0);
  let r = Math.random() * total;

  for (const band of bands) {
    r -= band.count;
    if (r <= 0) {
      const [minStr, maxStr] = band.band.split('-');
      const min = parseInt(minStr) || 0;
      const max = maxStr ? parseInt(maxStr) : (band.band.includes('+') ? 95 : min + 4);
      return min + Math.floor(Math.random() * (max - min + 1));
    }
  }
  return 30;
}

function getAgeGroup(age: number): string {
  if (age < 5) return '0-4';
  if (age < 16) return '5-15';
  if (age < 25) return '16-24';
  if (age < 45) return '25-44';
  if (age < 65) return '45-64';
  return '65+';
}

// Generate a daily schedule based on age group
function generateSchedule(age: number, homeLocation: [number, number]): ScheduleEntry[] {
  const ageGroup = getAgeGroup(age);
  const schedule: ScheduleEntry[] = [];

  // Filter POIs by relevance
  const educationPois = POIS.filter(p => p.type === 'education');
  const employmentPois = POIS.filter(p => p.type === 'employment');
  const retailPois = POIS.filter(p => p.type === 'retail');
  const socialPois = POIS.filter(p => p.type === 'social');
  const healthPois = POIS.filter(p => p.type === 'healthcare');

  const randomPoi = (pois: typeof POIS) => pois[Math.floor(Math.random() * pois.length)];

  if (ageGroup === '5-15') {
    // School children
    const school = randomPoi(educationPois);
    schedule.push({
      departureMinute: 450 + Math.floor(Math.random() * 30), // 7:30-8:00
      destination: school.location,
      type: 'education',
      label: school.name,
    });
    schedule.push({
      departureMinute: 930 + Math.floor(Math.random() * 30), // 15:30-16:00
      destination: homeLocation,
      type: 'home',
      label: 'Home',
    });
  } else if (ageGroup === '16-24') {
    // Mix of education and early career
    if (Math.random() < 0.6) {
      const uni = randomPoi(educationPois);
      schedule.push({
        departureMinute: 480 + Math.floor(Math.random() * 60), // 8:00-9:00
        destination: uni.location,
        type: 'education',
        label: uni.name,
      });
    } else {
      const work = randomPoi(employmentPois);
      schedule.push({
        departureMinute: 420 + Math.floor(Math.random() * 60), // 7:00-8:00
        destination: work.location,
        type: 'work',
        label: work.name,
      });
    }
    // Maybe go shopping
    if (Math.random() < 0.3) {
      const shop = randomPoi(retailPois);
      schedule.push({
        departureMinute: 1020 + Math.floor(Math.random() * 60), // 17:00-18:00
        destination: shop.location,
        type: 'shopping',
        label: shop.name,
      });
    }
    schedule.push({
      departureMinute: 1080 + Math.floor(Math.random() * 120), // 18:00-20:00
      destination: homeLocation,
      type: 'home',
      label: 'Home',
    });
  } else if (ageGroup === '25-44' || ageGroup === '45-64') {
    // Working adults
    if (Math.random() < ASTON_CENSUS.employmentRate) {
      const work = randomPoi(employmentPois);
      schedule.push({
        departureMinute: 390 + Math.floor(Math.random() * 90), // 6:30-8:00
        destination: work.location,
        type: 'work',
        label: work.name,
      });
      // Some go shopping after work
      if (Math.random() < 0.25) {
        const shop = randomPoi(retailPois);
        schedule.push({
          departureMinute: 1020 + Math.floor(Math.random() * 30),
          destination: shop.location,
          type: 'shopping',
          label: shop.name,
        });
      }
      schedule.push({
        departureMinute: 1050 + Math.floor(Math.random() * 120),
        destination: homeLocation,
        type: 'home',
        label: 'Home',
      });
    } else {
      // Unemployed / stay at home - fewer trips
      if (Math.random() < 0.5) {
        const dest = randomPoi([...retailPois, ...socialPois, ...healthPois]);
        schedule.push({
          departureMinute: 600 + Math.floor(Math.random() * 180),
          destination: dest.location,
          type: dest.type as ScheduleEntry['type'],
          label: dest.name,
        });
        schedule.push({
          departureMinute: 780 + Math.floor(Math.random() * 180),
          destination: homeLocation,
          type: 'home',
          label: 'Home',
        });
      }
    }
  } else if (ageGroup === '65+') {
    // Elderly - fewer, shorter trips
    if (Math.random() < 0.4) {
      const dest = randomPoi([...healthPois, ...socialPois, ...retailPois]);
      schedule.push({
        departureMinute: 600 + Math.floor(Math.random() * 120),
        destination: dest.location,
        type: dest.type as ScheduleEntry['type'],
        label: dest.name,
      });
      schedule.push({
        departureMinute: 780 + Math.floor(Math.random() * 120),
        destination: homeLocation,
        type: 'home',
        label: 'Home',
      });
    }
  }

  // Sort by departure time
  schedule.sort((a, b) => a.departureMinute - b.departureMinute);
  return schedule;
}

// Create agents based on census data
export function createAgents(count: number): Agent[] {
  const agents: Agent[] = [];
  for (let i = 0; i < count; i++) {
    const home = randomPointInAston();
    const age = generateAge();
    agents.push({
      id: `agent_${i}`,
      homeLocation: home,
      currentLocation: [...home],
      targetLocation: null,
      nearestStopId: null,
      destinationStopId: null,
      age,
      ageGroup: getAgeGroup(age),
      state: 'at_home',
      schedule: generateSchedule(age, home),
      currentScheduleIndex: 0,
      carbonEmitted: 0,
      totalTimeSpent: 0,
      walkingTime: 0,
      waitingTime: 0,
      ridingTime: 0,
      distanceTraveled: 0,
      currentRouteId: null,
    });
  }
  return agents;
}

// Create initial vehicles for routes
export function createVehicles(routes: BusRoute[]): Vehicle[] {
  const vehicles: Vehicle[] = [];
  let vid = 0;

  for (const route of routes) {
    // Create vehicles based on frequency (more frequent = more vehicles)
    const numVehicles = Math.max(2, Math.ceil(30 / route.frequency));
    for (let i = 0; i < numVehicles; i++) {
      const startIndex = Math.floor((i / numVehicles) * route.stopIds.length);
      const stop = BUS_STOPS.find(s => s.id === route.stopIds[startIndex]);
      if (stop) {
        vehicles.push({
          id: `vehicle_${vid++}`,
          routeId: route.id,
          currentStopIndex: startIndex,
          nextStopIndex: Math.min(startIndex + 1, route.stopIds.length - 1),
          passengers: [],
          capacity: route.vehicleCapacity,
          position: [...stop.location],
          progress: 0,
          direction: 1,
        });
      }
    }
  }
  return vehicles;
}

// Walking speed: ~5km/h = ~83m/min
const WALKING_SPEED_KM_PER_MIN = 5 / 60;
// Bus speed: ~20km/h in urban = ~333m/min
const BUS_SPEED_KM_PER_MIN = 20 / 60;

// Interpolate between two points
function lerp(a: [number, number], b: [number, number], t: number): [number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
}

// Move a point toward a target, return new position and whether arrived
function moveToward(
  current: [number, number],
  target: [number, number],
  speedKmPerMin: number,
): { position: [number, number]; arrived: boolean; distanceKm: number } {
  const dist = haversineDistance(current, target);
  if (dist <= speedKmPerMin) {
    return { position: [...target], arrived: true, distanceKm: dist };
  }
  const t = speedKmPerMin / dist;
  return { position: lerp(current, target, t), arrived: false, distanceKm: speedKmPerMin };
}

// Step one simulation tick (1 minute)
export function stepSimulation(
  agents: Agent[],
  vehicles: Vehicle[],
  currentMinute: number,
  routes: BusRoute[],
): { agents: Agent[]; vehicles: Vehicle[]; } {
  // Step vehicles
  for (const vehicle of vehicles) {
    const route = routes.find(r => r.id === vehicle.routeId);
    if (!route) continue;

    const currentStopId = route.stopIds[vehicle.currentStopIndex];
    const nextStopId = route.stopIds[vehicle.nextStopIndex];
    const currentStop = BUS_STOPS.find(s => s.id === currentStopId);
    const nextStop = BUS_STOPS.find(s => s.id === nextStopId);

    if (!currentStop || !nextStop) continue;

    // Move vehicle toward next stop
    const dist = haversineDistance(currentStop.location, nextStop.location);
    const stepProgress = dist > 0 ? BUS_SPEED_KM_PER_MIN / dist : 1;
    vehicle.progress += stepProgress;

    if (vehicle.progress >= 1) {
      // Arrived at next stop
      vehicle.currentStopIndex = vehicle.nextStopIndex;
      vehicle.progress = 0;

      // Calculate next stop index (ping-pong)
      const nextIdx = vehicle.currentStopIndex + vehicle.direction;
      if (nextIdx >= route.stopIds.length || nextIdx < 0) {
        vehicle.direction = (vehicle.direction * -1) as 1 | -1;
        vehicle.nextStopIndex = vehicle.currentStopIndex + vehicle.direction;
      } else {
        vehicle.nextStopIndex = nextIdx;
      }
      vehicle.nextStopIndex = Math.max(0, Math.min(route.stopIds.length - 1, vehicle.nextStopIndex));

      // Let passengers off at this stop
      const arrivedStop = BUS_STOPS.find(s => s.id === route.stopIds[vehicle.currentStopIndex]);
      if (arrivedStop) {
        vehicle.passengers = vehicle.passengers.filter(agentId => {
          const agent = agents.find(a => a.id === agentId);
          if (!agent) return false;
          if (agent.destinationStopId === arrivedStop.id) {
            agent.state = 'walking_to_dest';
            agent.currentLocation = [...arrivedStop.location];
            agent.currentRouteId = null;
            return false;
          }
          return true;
        });

        // Board waiting agents
        const waitingAgents = agents.filter(a =>
          a.state === 'waiting' &&
          a.nearestStopId === arrivedStop.id &&
          vehicle.passengers.length < vehicle.capacity
        );
        for (const agent of waitingAgents) {
          if (vehicle.passengers.length >= vehicle.capacity) break;
          // Check if this route serves the agent's destination area
          if (agent.destinationStopId && route.stopIds.includes(agent.destinationStopId)) {
            agent.state = 'riding';
            agent.currentRouteId = vehicle.routeId;
            vehicle.passengers.push(agent.id);
          }
        }
      }
    }

    // Update vehicle position via interpolation
    const cs = BUS_STOPS.find(s => s.id === route.stopIds[vehicle.currentStopIndex]);
    const ns = BUS_STOPS.find(s => s.id === route.stopIds[vehicle.nextStopIndex]);
    if (cs && ns) {
      vehicle.position = lerp(cs.location, ns.location, Math.min(vehicle.progress, 1));
    }

    // Update riding passengers position
    for (const agentId of vehicle.passengers) {
      const agent = agents.find(a => a.id === agentId);
      if (agent) {
        agent.currentLocation = [...vehicle.position];
        agent.ridingTime += 1;
        agent.distanceTraveled += BUS_SPEED_KM_PER_MIN;
        // Carbon: shared among passengers
        const passengerCO2 = (CARBON_FACTORS.bus_base_per_km * BUS_SPEED_KM_PER_MIN) /
          Math.max(vehicle.passengers.length, 1) / 1000; // convert to kg
        agent.carbonEmitted += passengerCO2;
      }
    }
  }

  // Step agents
  for (const agent of agents) {
    switch (agent.state) {
      case 'at_home':
      case 'at_destination': {
        // Check if it's time to leave for next destination
        if (agent.currentScheduleIndex < agent.schedule.length) {
          const entry = agent.schedule[agent.currentScheduleIndex];
          if (currentMinute >= entry.departureMinute) {
            agent.targetLocation = entry.destination;
            const nearestStop = findNearestStop(agent.currentLocation);
            agent.nearestStopId = nearestStop.id;
            const destStop = findDestinationStop(nearestStop.id, entry.destination);
            agent.destinationStopId = destStop?.id || null;

            // If destination is close enough, just walk directly
            const directDist = haversineDistance(agent.currentLocation, entry.destination);
            if (directDist < 0.3) {
              agent.state = 'walking_to_dest';
            } else {
              agent.state = 'walking_to_stop';
            }
            agent.currentScheduleIndex++;
          }
        }
        break;
      }

      case 'walking_to_stop': {
        if (!agent.nearestStopId) {
          agent.state = 'at_home';
          break;
        }
        const stop = BUS_STOPS.find(s => s.id === agent.nearestStopId);
        if (!stop) break;

        const result = moveToward(agent.currentLocation, stop.location, WALKING_SPEED_KM_PER_MIN);
        agent.currentLocation = result.position;
        agent.walkingTime += 1;
        agent.distanceTraveled += result.distanceKm;

        if (result.arrived) {
          agent.state = 'waiting';
        }
        break;
      }

      case 'waiting': {
        agent.waitingTime += 1;
        // If waited too long (>15 min), try walking directly
        if (agent.waitingTime > 15 && agent.targetLocation) {
          agent.state = 'walking_to_dest';
        }
        break;
      }

      case 'riding': {
        // Position updated by vehicle step above
        break;
      }

      case 'walking_to_dest': {
        if (!agent.targetLocation) {
          agent.state = 'at_destination';
          break;
        }
        const result = moveToward(agent.currentLocation, agent.targetLocation, WALKING_SPEED_KM_PER_MIN);
        agent.currentLocation = result.position;
        agent.walkingTime += 1;
        agent.distanceTraveled += result.distanceKm;

        if (result.arrived) {
          agent.state = 'at_destination';
          agent.targetLocation = null;
          agent.nearestStopId = null;
          agent.destinationStopId = null;
        }
        break;
      }
    }

    agent.totalTimeSpent = agent.walkingTime + agent.waitingTime + agent.ridingTime;
  }

  return { agents, vehicles };
}

// Calculate simulation metrics
export function calculateMetrics(agents: Agent[]): SimulationMetrics {
  const activeAgents = agents.filter(a => a.state !== 'at_home' && a.state !== 'at_destination');
  const traveledAgents = agents.filter(a => a.totalTimeSpent > 0);

  const totalCO2 = agents.reduce((s, a) => s + a.carbonEmitted, 0);
  const avgTravelTime = traveledAgents.length > 0
    ? traveledAgents.reduce((s, a) => s + a.totalTimeSpent, 0) / traveledAgents.length
    : 0;
  const avgWaitTime = traveledAgents.length > 0
    ? traveledAgents.reduce((s, a) => s + a.waitingTime, 0) / traveledAgents.length
    : 0;
  const avgAge = agents.reduce((s, a) => s + a.age, 0) / agents.length;
  const totalDist = agents.reduce((s, a) => s + a.distanceTraveled, 0);

  // Baseline: if everyone drove (car CO2)
  const baselineCO2 = totalDist * CARBON_FACTORS.car_per_km / 1000;
  const co2Saved = Math.max(0, baselineCO2 - totalCO2);

  // Accessibility: % of agents within 400m of a bus stop
  const accessibleAgents = agents.filter(a => {
    const nearest = findNearestStop(a.homeLocation);
    return haversineDistance(a.homeLocation, nearest.location) < 0.4;
  });

  return {
    totalAgents: agents.length,
    activeAgents: activeAgents.length,
    walkingAgents: agents.filter(a => a.state === 'walking_to_stop' || a.state === 'walking_to_dest').length,
    waitingAgents: agents.filter(a => a.state === 'waiting').length,
    ridingAgents: agents.filter(a => a.state === 'riding').length,
    arrivedAgents: agents.filter(a => a.state === 'at_destination').length,
    averageTravelTime: Math.round(avgTravelTime * 10) / 10,
    averageWaitTime: Math.round(avgWaitTime * 10) / 10,
    totalCO2: Math.round(totalCO2 * 100) / 100,
    co2PerCapita: agents.length > 0 ? Math.round((totalCO2 / agents.length) * 1000) / 1000 : 0,
    co2Saved: Math.round(co2Saved * 100) / 100,
    totalDistance: Math.round(totalDist * 100) / 100,
    averageAge: Math.round(avgAge * 100) / 100,
    accessibilityCoverage: Math.round((accessibleAgents.length / agents.length) * 10000) / 100,
  };
}
