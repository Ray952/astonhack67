from pathlib import Path
import zipfile
import requests

TFWM_GTFS_URL = "http://api.tfwm.org.uk/gtfs/tfwm_gtfs.zip"

def download_gtfs_zip(app_id: str, app_key: str, out_zip_path: str) -> str:
    r = requests.get(
        TFWM_GTFS_URL,
        params={"app_id": app_id, "app_key": app_key},
        timeout=120,
    )
    r.raise_for_status()

    Path(out_zip_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_zip_path, "wb") as f:
        f.write(r.content)

    return out_zip_path

def extract_gtfs_zip(zip_path: str, out_dir: str) -> str:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(out_dir)

    return out_dir
