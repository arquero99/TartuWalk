#!/usr/bin/env python3
"""
Fetches CAMS European Air Quality surface concentrations for the Estonia/Baltic region.
Outputs JSON to stdout:
  {"timestamp":"YYYY-MM-DD", "pm25":[[lat,lon,val],...], "no2":[...], "co":[...]}
On error: {"error":"message"}
"""
import sys
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone


def die(msg):
    print(json.dumps({"error": msg}))
    sys.exit(0)  # exit 0 so Node.js reads stdout


try:
    import cdsapi
except ImportError:
    die("cdsapi not installed. Run: pip install cdsapi")

try:
    import xarray as xr
    import numpy as np
except ImportError:
    die("Missing dependencies. Run: pip install xarray netcdf4 numpy")


URL = "https://ads.atmosphere.copernicus.eu/api"
KEY = "6843b8a4-7a8c-4800-a9e1-8f58fa7a0c21"

# Wide bounding box: Estonia + neighbours for spatial context
# [North, West, South, East]
AREA = [61.5, 21.5, 56.5, 31.0]

# Variables available in the ensemble model
CAMS_VARS_ENSEMBLE = [
    "particulate_matter_2.5um",
    "nitrogen_dioxide",
]
# CO is only available from individual models, not the ensemble
CAMS_VARS_CO = ["carbon_monoxide"]
CO_MODEL = "chimere"

# Candidate NetCDF variable names per pollutant
NC_NAMES = {
    "pm25": ["pm2p5", "pm2p5_conc", "pm2.5", "particulate_matter_2.5um"],
    "no2":  ["no2",   "no2_conc"],
    "co":   ["co",    "co_conc"],
}


def get_date():
    """Use today's forecast (00 UTC run); fall back to yesterday if before 06:00 UTC."""
    now = datetime.now(timezone.utc)
    if now.hour < 6:
        return (now - timedelta(days=1)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")


def find_var(ds, candidates):
    for name in candidates:
        if name in ds.data_vars:
            return ds[name]
    # Case-insensitive prefix search
    for name in candidates:
        prefix = name.lower()[:4]
        for k in ds.data_vars:
            if k.lower().startswith(prefix):
                return ds[k]
    return None


def extract_points(da):
    """Return [[lat, lon, value], ...] from a 2-D DataArray."""
    da = da.squeeze(drop=True)

    lat_dim = next((n for n in ["latitude", "lat", "y"] if n in da.dims), None)
    lon_dim = next((n for n in ["longitude", "lon", "x"] if n in da.dims), None)
    if lat_dim is None or lon_dim is None:
        return []

    lats = da[lat_dim].values
    lons = da[lon_dim].values
    vals = da.values

    if vals.ndim != 2:
        return []

    # Replace fill / mask
    if hasattr(vals, "filled"):
        vals = vals.filled(np.nan)

    pts = []
    for i, lat in enumerate(lats):
        for j, lon in enumerate(lons):
            v = float(vals[i, j])
            if np.isfinite(v) and v >= 0:
                pts.append([round(float(lat), 3), round(float(lon), 3), round(v, 4)])
    return pts


BASE_PARAMS = {
    "level":         "0",
    "type":          "forecast",
    "time":          "00:00",
    "leadtime_hour": ["0"],
    "area":          AREA,
    "format":        "netcdf",
}


def fetch_nc(c, variables, model, date, tmpfile):
    if os.path.exists(tmpfile):
        return
    params = {**BASE_PARAMS, "variable": variables, "model": model, "date": date}
    c.retrieve("cams-europe-air-quality-forecasts", params, tmpfile)


def main():
    date = get_date()
    c = cdsapi.Client(url=URL, key=KEY, quiet=True, progress=False)

    tmp_main = os.path.join(tempfile.gettempdir(), f"tartu_cams_{date}.nc")
    tmp_co   = os.path.join(tempfile.gettempdir(), f"tartu_cams_co_{date}.nc")

    # Fetch PM2.5 + NO2 (ensemble model)
    try:
        fetch_nc(c, CAMS_VARS_ENSEMBLE, "ensemble", date, tmp_main)
    except Exception as e:
        die(f"CAMS request failed (ensemble): {e}")

    # Fetch CO (individual model)
    try:
        fetch_nc(c, CAMS_VARS_CO, CO_MODEL, date, tmp_co)
    except Exception as e:
        # CO failure is non-fatal — continue without it
        tmp_co = None

    result = {"timestamp": date, "pm25": [], "no2": [], "co": []}

    try:
        ds = xr.open_dataset(tmp_main)
        for key in ["pm25", "no2"]:
            da = find_var(ds, NC_NAMES[key])
            if da is not None:
                result[key] = extract_points(da)
        ds.close()
    except Exception as e:
        try: os.remove(tmp_main)
        except OSError: pass
        die(f"Failed to read ensemble dataset: {e}")

    if tmp_co and os.path.exists(tmp_co):
        try:
            ds_co = xr.open_dataset(tmp_co)
            da = find_var(ds_co, NC_NAMES["co"])
            if da is not None:
                result["co"] = extract_points(da)
            ds_co.close()
        except Exception:
            pass

    print(json.dumps(result))


main()
