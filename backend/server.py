from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from gtfs.fetch import download_gtfs_zip, extract_gtfs_zip
from gtfs.parse import load_gtfs
from gtfs.build_network import build_aston_network
# ====== ASTON FILTER HELPERS (Cmd+F: ASTON FILTER HELPERS) ======
import math
from typing import Dict, Any, List, Tuple, Set
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent

# Aston-ish center (tweak if you want)
ASTON_CENTER = (52.4975, -1.8890)  # (lat, lng)

def haversine_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """Distance in meters between (lat, lng) points."""
    lat1, lon1 = a
    lat2, lon2 = b
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    h = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def filter_network_by_radius(
    net: Dict[str, Any],
    center: Tuple[float, float],
    buffer_m: float,
    min_stops_in_area: int = 3,
    clip_shapes: bool = True,
) -> Dict[str, Any]:
    """
    net expected shape:
      {
        "stops": [{"id":..., "name":..., "lat":..., "lng":...}, ...],
        "routes": [{"id":..., "stopIds":[...], "shape":[[lat,lng], ...], ...}, ...],
        ...
      }
    Returns filtered network.
    """
    stops = net.get("stops", [])
    routes = net.get("routes", [])

    # 1) Stops within radius
    keep_stop_ids: Set[str] = set()
    filtered_stops: List[Dict[str, Any]] = []
    for s in stops:
        try:
            lat = float(s["lat"])
            lng = float(s["lng"])
        except Exception:
            continue
        d = haversine_m(center, (lat, lng))
        if d <= buffer_m:
            sid = str(s["id"])
            keep_stop_ids.add(sid)
            filtered_stops.append(s)

    # 2) Keep only routes with enough stops in area
    filtered_routes: List[Dict[str, Any]] = []
    for r in routes:
        stop_ids = [str(x) for x in (r.get("stopIds") or [])]
        in_area = [sid for sid in stop_ids if sid in keep_stop_ids]
        if len(in_area) < min_stops_in_area:
            continue

        rr = dict(r)
        rr["stopIds"] = stop_ids  # normalize

        # 3) Optionally clip shapes to the same radius (prevents huge outside lines)
        if clip_shapes and rr.get("shape"):
            clipped = []
            for pt in rr["shape"]:
                # pt is [lat, lng]
                try:
                    plat = float(pt[0])
                    plng = float(pt[1])
                except Exception:
                    continue
                if haversine_m(center, (plat, plng)) <= buffer_m:
                    clipped.append([plat, plng])

            # If clipping produced a usable polyline, use it; otherwise keep original
            if len(clipped) >= 2:
                rr["shape"] = clipped

        filtered_routes.append(rr)

    out = dict(net)
    out["stops"] = filtered_stops
    out["routes"] = filtered_routes
    out["meta"] = dict(out.get("meta", {}))
    out["meta"].update({
        "filter": {
            "type": "radius",
            "center": {"lat": center[0], "lng": center[1]},
            "bufferMeters": buffer_m,
            "minStopsInArea": min_stops_in_area,
            "clipShapes": clip_shapes,
        }
    })
    return out
# ====== END ASTON FILTER HELPERS ======


load_dotenv()

TFWM_APP_ID = os.getenv("TFWM_APP_ID")
TFWM_APP_KEY = os.getenv("TFWM_APP_KEY")



app = FastAPI(title="Aston Transport Simulation Backend")

# Allow frontend to talk to backend during dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
],
 # Vite default
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/network")
def get_network(bufferMeters: int = 900, minStopsInArea: int = 3):
    gtfs_dir = str(BASE_DIR / "gtfs_data")
    stops, routes, trips, stop_times, shapes = load_gtfs(gtfs_dir)

    # Build full network (your existing function)
    net = build_aston_network(
        stops, routes, trips, stop_times, shapes,
        buffer_meters=bufferMeters
    )

    # IMPORTANT: build_aston_network currently uses buffer_meters for *collection*.
    # We additionally filter + clip so the returned shapes don't sprawl across Birmingham.
    net_filtered = filter_network_by_radius(
    net,
    center=ASTON_CENTER,
    buffer_m=float(bufferMeters),
    min_stops_in_area=int(minStopsInArea),
    clip_shapes=True,
)


    return net_filtered


@app.get("/api/gtfs/status")
def gtfs_status():
    return {
        "has_keys": bool(TFWM_APP_ID and TFWM_APP_KEY),
        "cache_zip_exists": os.path.exists("cache/tfwm_gtfs.zip"),
        "gtfs_dir_exists": os.path.exists("gtfs_data"),
    }

@app.post("/api/gtfs/refresh")
def refresh_gtfs():
    if not TFWM_APP_ID or not TFWM_APP_KEY:
        return {"ok": False, "error": "Missing TFWM_APP_ID/TFWM_APP_KEY in backend/.env"}

    zip_path = "cache/tfwm_gtfs.zip"
    data_dir = "gtfs_data"

    download_gtfs_zip(TFWM_APP_ID, TFWM_APP_KEY, zip_path)
    extract_gtfs_zip(zip_path, data_dir)

    files = sorted([f for f in os.listdir(data_dir) if f.endswith(".txt")])
    return {"ok": True, "files": files}
