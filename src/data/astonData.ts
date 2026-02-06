import type { BusStop, BusRoute, POI } from '@/types/simulation';

// Aston ward boundary (simplified polygon) - [lat, lng]
export const ASTON_BOUNDARY: [number, number][] = [
  [52.5095, -1.8960],
  [52.5080, -1.8855],
  [52.5055, -1.8790],
  [52.5025, -1.8745],
  [52.4990, -1.8720],
  [52.4955, -1.8710],
  [52.4920, -1.8730],
  [52.4885, -1.8770],
  [52.4870, -1.8840],
  [52.4868, -1.8900],
  [52.4880, -1.8960],
  [52.4905, -1.9010],
  [52.4940, -1.9040],
  [52.4975, -1.9050],
  [52.5010, -1.9040],
  [52.5045, -1.9015],
  [52.5075, -1.8985],
  [52.5095, -1.8960],
];

export const ASTON_CENTER: [number, number] = [52.4975, -1.8890];
export const ASTON_ZOOM = 14;

// Census 2021 age distribution for Aston ward
// Total population: ~24,449
export const ASTON_CENSUS = {
  wardName: 'Aston',
  wardCode: 'E05011121',
  totalPopulation: 24449,
  ageBands: [
    { band: '0-4', count: 2043, percentage: 8.36 },
    { band: '5-9', count: 1875, percentage: 7.67 },
    { band: '10-14', count: 1672, percentage: 6.84 },
    { band: '15-19', count: 2797, percentage: 11.44 },
    { band: '20-24', count: 2489, percentage: 10.18 },
    { band: '25-29', count: 1420, percentage: 5.81 },
    { band: '30-34', count: 1844, percentage: 7.54 },
    { band: '35-39', count: 1787, percentage: 7.31 },
    { band: '40-44', count: 1690, percentage: 6.91 },
    { band: '45-49', count: 1629, percentage: 6.66 },
    { band: '50-54', count: 1379, percentage: 5.64 },
    { band: '55-59', count: 983, percentage: 4.02 },
    { band: '60-64', count: 762, percentage: 3.12 },
    { band: '65-69', count: 673, percentage: 2.75 },
    { band: '70-74', count: 468, percentage: 1.91 },
    { band: '75-79', count: 304, percentage: 1.24 },
    { band: '80+', count: 634, percentage: 2.59 },
  ],
  employmentRate: 0.459,
  deprivationRank: 14, // out of 69 wards
};

// Real bus stops in/around Aston ward
export const BUS_STOPS: BusStop[] = [
  { id: 'stop_01', name: 'Aston University', location: [52.4871, -1.8870] },
  { id: 'stop_02', name: 'Aston Cross', location: [52.4925, -1.8835] },
  { id: 'stop_03', name: 'Six Ways Aston', location: [52.4960, -1.8910] },
  { id: 'stop_04', name: 'Witton Road', location: [52.5005, -1.8885] },
  { id: 'stop_05', name: 'Witton Island', location: [52.5040, -1.8870] },
  { id: 'stop_06', name: 'Salford Circus', location: [52.4940, -1.8795] },
  { id: 'stop_07', name: 'Lichfield Road', location: [52.4985, -1.8770] },
  { id: 'stop_08', name: 'Park Lane', location: [52.5010, -1.8820] },
  { id: 'stop_09', name: 'Aston Hall Road', location: [52.5020, -1.8940] },
  { id: 'stop_10', name: 'Birchfield Road', location: [52.5000, -1.8980] },
  { id: 'stop_11', name: 'Trinity Road', location: [52.5060, -1.8855] },
  { id: 'stop_12', name: 'Aston Lane', location: [52.4945, -1.8870] },
  { id: 'stop_13', name: 'Lozells Road', location: [52.4970, -1.9020] },
  { id: 'stop_14', name: 'Newtown Row', location: [52.4905, -1.8920] },
  { id: 'stop_15', name: 'Corporation Street', location: [52.4890, -1.8860] },
];

// Bus routes through Aston (based on real TfWM routes)
export const BUS_ROUTES: BusRoute[] = [
  {
    id: 'route_7',
    name: '7 - Perry Barr',
    stopIds: ['stop_15', 'stop_01', 'stop_02', 'stop_12', 'stop_03', 'stop_04', 'stop_08', 'stop_11'],
    frequency: 12,
    vehicleCapacity: 75,
    color: 'hsl(0, 80%, 60%)',
    geometry: [
      [52.4890, -1.8860], [52.4871, -1.8870], [52.4925, -1.8835],
      [52.4945, -1.8870], [52.4960, -1.8910], [52.5005, -1.8885],
      [52.5010, -1.8820], [52.5060, -1.8855],
    ],
  },
  {
    id: 'route_65',
    name: '65 - Erdington',
    stopIds: ['stop_01', 'stop_06', 'stop_07', 'stop_05', 'stop_11'],
    frequency: 15,
    vehicleCapacity: 75,
    color: 'hsl(200, 80%, 55%)',
    geometry: [
      [52.4871, -1.8870], [52.4940, -1.8795], [52.4985, -1.8770],
      [52.5040, -1.8870], [52.5060, -1.8855],
    ],
  },
  {
    id: 'route_67',
    name: '67 - Aston',
    stopIds: ['stop_15', 'stop_14', 'stop_03', 'stop_09', 'stop_10', 'stop_13'],
    frequency: 20,
    vehicleCapacity: 60,
    color: 'hsl(30, 90%, 55%)',
    geometry: [
      [52.4890, -1.8860], [52.4905, -1.8920], [52.4960, -1.8910],
      [52.5020, -1.8940], [52.5000, -1.8980], [52.4970, -1.9020],
    ],
  },
  {
    id: 'route_11',
    name: '11 - Outer Circle',
    stopIds: ['stop_06', 'stop_02', 'stop_12', 'stop_14', 'stop_13', 'stop_10'],
    frequency: 8,
    vehicleCapacity: 90,
    color: 'hsl(152, 70%, 50%)',
    geometry: [
      [52.4940, -1.8795], [52.4925, -1.8835], [52.4945, -1.8870],
      [52.4905, -1.8920], [52.4970, -1.9020], [52.5000, -1.8980],
    ],
  },
];

// Points of Interest in Aston
export const POIS: POI[] = [
  { id: 'poi_01', name: 'Aston University', location: [52.4871, -1.8870], type: 'education' },
  { id: 'poi_02', name: 'Villa Park', location: [52.5093, -1.8847], type: 'social' },
  { id: 'poi_03', name: 'Aston Hall', location: [52.5018, -1.8939], type: 'social' },
  { id: 'poi_04', name: 'Star City', location: [52.4985, -1.8730], type: 'retail' },
  { id: 'poi_05', name: 'Aston Manor Academy', location: [52.4970, -1.8900], type: 'education' },
  { id: 'poi_06', name: 'Aston Medical Centre', location: [52.4940, -1.8880], type: 'healthcare' },
  { id: 'poi_07', name: 'Newtown Shopping Centre', location: [52.4910, -1.8940], type: 'retail' },
  { id: 'poi_08', name: 'Aston Job Centre', location: [52.4930, -1.8860], type: 'employment' },
  { id: 'poi_09', name: 'Lozells Community Centre', location: [52.4970, -1.9015], type: 'social' },
  { id: 'poi_10', name: 'Aston Library', location: [52.4955, -1.8905], type: 'social' },
  { id: 'poi_11', name: 'Aston Industrial Estate', location: [52.4995, -1.8800], type: 'employment' },
  { id: 'poi_12', name: 'HP Sauce Site (Redevelopment)', location: [52.4935, -1.8830], type: 'employment' },
];

// Carbon emission factors (gCO2 per km)
export const CARBON_FACTORS = {
  bus_per_km: 89, // gCO2 per passenger-km (average UK bus)
  car_per_km: 171, // gCO2 per km (average UK car)
  walking_per_km: 0,
  bus_base_per_km: 820, // total bus emissions per km (shared among passengers)
};

// Helper: check if a point is inside the Aston boundary polygon
export function isInsideBoundary(lat: number, lng: number): boolean {
  const poly = ASTON_BOUNDARY;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Helper: generate a random point inside the Aston boundary
export function randomPointInAston(): [number, number] {
  const minLat = 52.4868, maxLat = 52.5095;
  const minLng = -1.9050, maxLng = -1.8710;

  let attempts = 0;
  while (attempts < 100) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lng = minLng + Math.random() * (maxLng - minLng);
    if (isInsideBoundary(lat, lng)) {
      return [lat, lng];
    }
    attempts++;
  }
  return ASTON_CENTER;
}

// Helper: distance between two points in km (Haversine)
export function haversineDistance(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Helper: find nearest bus stop to a location
export function findNearestStop(location: [number, number]): BusStop {
  let nearest = BUS_STOPS[0];
  let minDist = Infinity;
  for (const stop of BUS_STOPS) {
    const d = haversineDistance(location, stop.location);
    if (d < minDist) {
      minDist = d;
      nearest = stop;
    }
  }
  return nearest;
}

// Helper: find nearest stop to a destination that is on a route passing through origin stop
export function findDestinationStop(originStopId: string, destination: [number, number]): BusStop | null {
  // Find routes that pass through the origin stop
  const availableRoutes = BUS_ROUTES.filter(r => r.stopIds.includes(originStopId));
  if (availableRoutes.length === 0) return findNearestStop(destination);

  // Find the stop on those routes that is closest to the destination
  let bestStop: BusStop | null = null;
  let minDist = Infinity;

  for (const route of availableRoutes) {
    for (const stopId of route.stopIds) {
      const stop = BUS_STOPS.find(s => s.id === stopId);
      if (stop && stop.id !== originStopId) {
        const d = haversineDistance(stop.location, destination);
        if (d < minDist) {
          minDist = d;
          bestStop = stop;
        }
      }
    }
  }

  return bestStop || findNearestStop(destination);
}
