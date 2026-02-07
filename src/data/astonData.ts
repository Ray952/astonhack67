// src/data/astonData.ts
// Real-data foundation + legacy compatibility exports (so existing files don't break)

import type { BusStop, BusRoute } from '@/types/simulation';

// --------------------
// Types
// --------------------

export type POIType =
  | 'education'
  | 'employment'
  | 'retail'
  | 'healthcare'
  | 'social'
  | 'leisure'
  | 'religious'
  | 'transport';

export interface POI {
  id: string;
  name: string;
  type: POIType;
  location: [number, number]; // [lat, lng]
}

// --------------------
// Aston census (Census 2021)
// --------------------

export const ASTON_CENSUS = {
  wardName: 'Aston',
  wardCode: 'E05011121',
  totalPopulation: 24446,
  employmentRate: 0.459,
  ageBands: [
    { band: '0-4', count: 2418 },
    { band: '5-15', count: 4043 },
    { band: '16-24', count: 5156 },
    { band: '25-44', count: 6847 },
    { band: '45-64', count: 4076 },
    { band: '65+', count: 1906 },
  ],
};

// --------------------
// Geography
// --------------------

// Aston bbox (approx; good enough for Overpass + simulation)
export const ASTON_BBOX: [number, number, number, number] = [
  52.488, // south
  -1.915, // west
  52.525, // north
  -1.865, // east
];

// Default map zoom for Aston (used by map + UI)
export const ASTON_ZOOM = 14;


// Midpoint used by map centering / backend filtering
export const ASTON_CENTER: [number, number] = [
  (ASTON_BBOX[0] + ASTON_BBOX[2]) / 2,
  (ASTON_BBOX[1] + ASTON_BBOX[3]) / 2,
];

// A simple polygon boundary (rectangle) so your map overlay doesn’t break.
// If you later want the official ward polygon, we can replace this.
export const ASTON_BOUNDARY: [number, number][] = [
  [ASTON_BBOX[0], ASTON_BBOX[1]],
  [ASTON_BBOX[0], ASTON_BBOX[3]],
  [ASTON_BBOX[2], ASTON_BBOX[3]],
  [ASTON_BBOX[2], ASTON_BBOX[1]],
  [ASTON_BBOX[0], ASTON_BBOX[1]],
];

export function randomPointInAston(): [number, number] {
  const [south, west, north, east] = ASTON_BBOX;
  return [
    south + Math.random() * (north - south),
    west + Math.random() * (east - west),
  ];
}

// --------------------
// Distance helpers
// --------------------

export function haversineDistance(
  a: [number, number],
  b: [number, number]
): number {
  const R = 6371; // km
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// --------------------
// Carbon factors
// --------------------

export const CARBON_FACTORS = {
  car_per_km: 171, // g CO2 / km
  bus_base_per_km: 822, // g CO2 / km (planning proxy)
};

// --------------------
// Overpass POI loader
// --------------------

export const POI_CATEGORY_WEIGHTS: Record<POIType, number> = {
  education: 1.0,
  employment: 1.0,
  retail: 0.7,
  healthcare: 0.8,
  social: 0.6,
  leisure: 0.5,
  religious: 0.4,
  transport: 0.9,
};

let POI_CACHE: POI[] | null = null;

export async function loadAstonPOIs(): Promise<POI[]> {
  if (POI_CACHE) return POI_CACHE;

  const [south, west, north, east] = ASTON_BBOX;

  const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"school|college|university|hospital|clinic|doctors|pharmacy|place_of_worship|community_centre"]( ${south}, ${west}, ${north}, ${east} );
      node["shop"]( ${south}, ${west}, ${north}, ${east} );
      node["office"]( ${south}, ${west}, ${north}, ${east} );
      node["leisure"]( ${south}, ${west}, ${north}, ${east} );
      node["tourism"]( ${south}, ${west}, ${north}, ${east} );
      node["public_transport"]( ${south}, ${west}, ${north}, ${east} );
    );
    out body;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });

    const data = await res.json();

    const pois: POI[] = (data.elements || [])
      .filter((el: any) => el.lat && el.lon)
      .map((el: any) => {
        const tags = el.tags || {};
        const name = tags.name || 'Unnamed';

        let type: POIType = 'social';

        if (tags.amenity) {
          if (['school', 'college', 'university'].includes(tags.amenity))
            type = 'education';
          else if (['hospital', 'clinic', 'doctors', 'pharmacy'].includes(tags.amenity))
            type = 'healthcare';
          else if (tags.amenity === 'place_of_worship')
            type = 'religious';
          else if (tags.amenity === 'community_centre')
            type = 'social';
        }

        if (tags.shop) type = 'retail';
        if (tags.office) type = 'employment';
        if (tags.leisure || tags.tourism) type = 'leisure';
        if (tags.public_transport) type = 'transport';

        return {
          id: `poi_${el.id}`,
          name,
          type,
          location: [el.lat, el.lon],
        };
      });

    POI_CACHE = pois;
    console.log(`[POI] Loaded ${pois.length} POIs from OpenStreetMap`);
    return pois;
  } catch (err) {
    console.error('[POI] Overpass failed, using fallback POIs', err);
    POI_CACHE = FALLBACK_POIS;
    return FALLBACK_POIS;
  }
}

// --------------------
// Legacy compatibility exports
// --------------------

// Minimal real landmark POIs as fallback (also exported as POIS so old imports work)
export const FALLBACK_POIS: POI[] = [
  { id: 'aston_university', name: 'Aston University', type: 'education', location: [52.4862, -1.8904] },
  { id: 'villa_park', name: 'Villa Park', type: 'leisure', location: [52.5091, -1.8848] },
  { id: 'star_city', name: 'Star City', type: 'leisure', location: [52.5016, -1.8523] },
  { id: 'aston_hall', name: 'Aston Hall', type: 'leisure', location: [52.5055, -1.8717] },
];

// Old code imports POIS synchronously — keep it as fallback set.
// (New Skyline engine will use loadAstonPOIs() when we wire it in.)
export const POIS: POI[] = FALLBACK_POIS;

// Old prototype fallback stops so the UI doesn’t crash if TfWM isn’t loaded.
// These are deliberately sparse but valid.
export const BUS_STOPS: BusStop[] = [
  { id: 'fallback_stop_1', name: 'Aston (Fallback Stop 1)', location: [52.507, -1.89] },
  { id: 'fallback_stop_2', name: 'Aston (Fallback Stop 2)', location: [52.5, -1.88] },
  { id: 'fallback_stop_3', name: 'Aston (Fallback Stop 3)', location: [52.515, -1.875] },
  { id: 'fallback_stop_4', name: 'Aston (Fallback Stop 4)', location: [52.495, -1.9] },
];

// Old prototype routes — keep as empty (or minimal) to satisfy imports.
// Once TfWM network is loaded, these are unused.
export const BUS_ROUTES: BusRoute[] = [
  {
    id: 'fallback_route_1',
    name: 'Fallback Route',
    stopIds: BUS_STOPS.map(s => s.id),
    frequency: 10,
    vehicleCapacity: 60,
    color: '#4CAF50',
    geometry: BUS_STOPS.map(s => s.location),
  },
];

// Legacy helpers used in older engine/UI
export function findNearestStop(location: [number, number]): BusStop {
  return nearestStopFrom(BUS_STOPS, location);
}

export function findDestinationStop(
  _originStopId: string,
  destination: [number, number]
): BusStop {
  return nearestStopFrom(BUS_STOPS, destination);
}

function nearestStopFrom(stops: BusStop[], location: [number, number]): BusStop {
  let best = stops[0];
  let bestDist = Infinity;
  for (const s of stops) {
    const d = haversineDistance(location, s.location);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}
