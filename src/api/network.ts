export type ApiStop = { id: string; name: string; lat: number; lng: number };
export type ApiRoute = {
  id: string;
  shortName?: string;
  longName?: string;
  color?: string;
  stopIds: string[];
  shape: [number, number][]; // [lat,lng]
  headwayMins?: number | null;
};

export type ApiNetwork = {
  stops: ApiStop[];
  routes: ApiRoute[];
  meta: Record<string, any>;
};

export async function fetchNetwork(bufferMeters = 1500): Promise<ApiNetwork> {
  const res = await fetch(`http://127.0.0.1:8000/api/network?bufferMeters=${bufferMeters}`);
  if (!res.ok) throw new Error(`Network fetch failed: ${res.status}`);
  return res.json();
}
