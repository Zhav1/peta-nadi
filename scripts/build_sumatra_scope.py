"""Build Sumatra geographic scope mask for aircraft + FIRMS filtering.

Source: gods-eye-view/src/data/local_data/natural_earth/states_provinces.json
  (Natural Earth admin-1, packed delta encoding, public domain).
  meta.schema: each feature has name/country/polygons; each ring is a flat
  int list in 1e-decimals degrees; first vertex absolute [x,y], then [dLon,dLat]
  deltas. meta.decimals is 3 (per-feature `d` overrides when present).

Output:
  backend/app/fixtures/sumatra_scope_mask.json  (runtime asset)
  backend/app/fixtures/sumatra_scope.geojson    (audit/debug only)

Grid: bbox [94,-7,109,7], res 0.01deg, W=1500, H=1400. Cell ~1.11km.
  row = floor((lat-lat_min)/res), col = floor((lon-lon_min)/res).
Flags: bit0 = fire land (Sumatra land dilated 1 cell, minus foreign land),
       bit1 = air island (satellite components dilated 5 cells, minus foreign),
       bit2 = air mainland (mainland dilated 23 cells, minus foreign).
"""
import base64
import hashlib
import json
import math
import os
import sys
import zlib
from datetime import datetime, timezone

import numpy as np
from scipy.ndimage import label, binary_dilation

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_PATH = os.path.join(
    REPO_ROOT, "gods-eye-view", "src", "data", "local_data",
    "natural_earth", "states_provinces.json",
)
OUT_MASK = os.path.join(
    REPO_ROOT, "backend", "app", "fixtures", "sumatra_scope_mask.json"
)
OUT_GEOJSON = os.path.join(
    REPO_ROOT, "backend", "app", "fixtures", "sumatra_scope.geojson"
)

BBOX = [94.0, -7.0, 109.0, 7.0]
LON_MIN, LAT_MIN, LON_MAX, LAT_MAX = BBOX
RES = 0.01
W, H = 1500, 1400

SUMATRA_NAMES = {
    "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau",
    "Jambi", "Sumatera Selatan", "Bangka-Belitung", "Bengkulu", "Lampung",
}

TEST_POINTS = [
    ("Kuala Lumpur", 101.6869, 3.1390, "air", False),
    ("Singapore", 103.8198, 1.3521, "air", False),
    ("South China Sea", 105.0, 5.0, "fire", False),
    ("Belawan", 98.6776, 3.7922, "air", True),
    ("Belawan-fire", 98.6776, 3.7922, "fire", True),
    ("Nias", 97.6, 1.1, "air", True),
    ("Batam", 104.03, 1.13, "air", True),
    ("Natuna land", 108.2, 3.9, "fire", True),
    ("Natuna water", 108.0, 4.5, "fire", False),
    ("Jakarta", 106.8456, -6.2088, "air", False),
    ("Medan", 98.6722, 3.5952, "air", True),
]


def decode_ring(ring, decimals):
    a = np.array(ring, dtype=np.int32)
    xs = a[0::2].astype(np.float64)
    ys = a[1::2].astype(np.float64)
    xs = np.cumsum(xs) / (10 ** decimals)
    ys = np.cumsum(ys) / (10 ** decimals)
    return xs, ys


def load_rings():
    with open(SRC_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    dec_default = int(data.get("meta", {}).get("decimals", 3))
    sumatra_rings = []
    foreign_rings = []
    for feat in data.get("features", []):
        dec = int(feat.get("d", dec_default))
        is_sumatra = (
            feat.get("country") == "Indonesia" and feat.get("name") in SUMATRA_NAMES
        )
        for poly in feat.get("polygons", []):
            for ring in poly:
                xs, ys = decode_ring(ring, dec)
                # Per-ring bbox reject (handles antimeridian features: their
                # rings simply never intersect the Sumatra bbox).
                if (
                    xs.max() < LON_MIN
                    or xs.min() >= LON_MAX
                    or ys.max() < LAT_MIN
                    or ys.min() >= LAT_MAX
                ):
                    continue
                if is_sumatra:
                    sumatra_rings.append((xs, ys))
                else:
                    foreign_rings.append((xs, ys))
    return sumatra_rings, foreign_rings, data.get("meta", {})


def rasterize(rings):
    """Vectorized scanline fill with numpy. Even-odd across all rings."""
    y_centers = LAT_MIN + (np.arange(H) + 0.5) * RES
    row_xs = [[] for _ in range(H)]
    for xs, ys in rings:
        if xs[0] != xs[-1] or ys[0] != ys[-1]:
            xs = np.append(xs, xs[0])
            ys = np.append(ys, ys[0])
        x1 = xs[:-1]
        x2 = xs[1:]
        y1 = ys[:-1]
        y2 = ys[1:]
        if y1.max() < LAT_MIN or y1.min() >= LAT_MAX:
            continue
        if x1.max() < LON_MIN or x1.min() >= LON_MAX:
            continue
        cross = (
            ((y1[:, None] <= y_centers[None, :]) & (y_centers[None, :] < y2[:, None]))
            | ((y2[:, None] <= y_centers[None, :]) & (y_centers[None, :] < y1[:, None]))
        )
        has = cross.any(axis=1)
        idx = np.where(has)[0]
        if idx.size == 0:
            continue
        denom = y2 - y1
        for ei in idx:
            rows = np.where(cross[ei])[0]
            ycs = y_centers[rows]
            xinters = x1[ei] + (ycs - y1[ei]) * (x2[ei] - x1[ei]) / denom[ei]
            for r, xi in zip(rows, xinters):
                row_xs[r].append(float(xi))
    grid = np.zeros((H, W), dtype=bool)
    for r in range(H):
        lst = row_xs[r]
        if not lst:
            continue
        lst.sort()
        for i in range(0, len(lst) - 1, 2):
            x0 = lst[i]
            x1v = lst[i + 1]
            cs = int(math.ceil((x0 - LON_MIN) / RES - 0.5))
            ce = int(math.floor((x1v - LON_MIN) / RES - 0.5))
            if ce < cs:
                continue
            cs = max(cs, 0)
            ce = min(ce, W - 1)
            if cs <= ce:
                grid[r, cs:ce + 1] = True
    return grid


def disk_struct(radius_cells):
    y, x = np.ogrid[-radius_cells:radius_cells + 1, -radius_cells:radius_cells + 1]
    return (x * x + y * y) <= radius_cells * radius_cells


def main():
    sumatra_rings, foreign_rings, meta = load_rings()
    print(f"Sumatra rings kept: {len(sumatra_rings)}")
    print(f"Foreign rings kept: {len(foreign_rings)}")

    sumatra_land = rasterize(sumatra_rings)
    foreign_land = rasterize(foreign_rings)
    print(f"Sumatra land cells: {int(sumatra_land.sum())}")
    print(f"Foreign land cells: {int(foreign_land.sum())}")

    labelled, ncomp = label(sumatra_land, structure=np.ones((3, 3), dtype=int))
    print(f"Connected components (8-conn): {ncomp}")
    sizes = np.bincount(labelled.ravel())
    # sizes[0] is background
    order = np.argsort(sizes[1:])[::-1] + 1
    print("Top component sizes:", [int(sizes[i]) for i in order[:8]])
    mainland_id = int(np.argmax(sizes[1:]) + 1)
    mainland = labelled == mainland_id
    satellites = sumatra_land & (labelled != mainland_id)
    print(f"Mainland cells: {int(mainland.sum())}")
    print(f"Satellite cells: {int(satellites.sum())}")

    # Dilation: 1 cell ~= 1.11km (fire), 5 cells ~= 5.5km (islands),
    # 23 cells ~= 25.5km (mainland). Foreign land subtracted from all three.
    fire_land = binary_dilation(sumatra_land, structure=disk_struct(1)) & (~foreign_land)
    air_island = binary_dilation(satellites, structure=disk_struct(5)) & (~foreign_land)
    air_mainland = binary_dilation(mainland, structure=disk_struct(23)) & (~foreign_land)
    print(f"Fire cells: {int(fire_land.sum())}")
    print(f"Air-island cells: {int(air_island.sum())}")
    print(f"Air-mainland cells: {int(air_mainland.sum())}")

    flags = (
        fire_land.astype(np.uint8)
        | (air_island.astype(np.uint8) << 1)
        | (air_mainland.astype(np.uint8) << 2)
    )
    raw = flags.astype(np.uint8).tobytes()
    sha = hashlib.sha256(raw).hexdigest()
    compressed = zlib.compress(raw, 9)
    b64 = base64.b64encode(compressed).decode("ascii")
    print(f"Mask bytes: {len(raw)} raw, {len(compressed)} zlib, {len(b64)} base64")

    generated_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "bbox": BBOX,
        "resolution": RES,
        "width": W,
        "height": H,
        "encoding": "zlib+base64",
        "data": b64,
        "source": "gods-eye-view/src/data/local_data/natural_earth/states_provinces.json (Natural Earth admin-1)",
        "license": "Public domain (https://www.naturalearthdata.com/about/terms-of-use/)",
        "generated_at": generated_at,
        "sha256": sha,
    }
    os.makedirs(os.path.dirname(OUT_MASK), exist_ok=True)
    with open(OUT_MASK, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    print(f"Wrote {OUT_MASK} ({os.path.getsize(OUT_MASK)} bytes)")

    # Compact audit GeoJSON (not used at runtime): Sumatra land polygons,
    # coordinates rounded to 3 decimals.
    features = []
    # Re-decode per-province for clean properties. Reuse already-decoded
    # rings is not grouped, so decode again grouped by province here.
    with open(SRC_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    dec_default = int(data.get("meta", {}).get("decimals", 3))
    for feat in data.get("features", []):
        if not (feat.get("country") == "Indonesia" and feat.get("name") in SUMATRA_NAMES):
            continue
        dec = int(feat.get("d", dec_default))
        multipoly = []
        for poly in feat.get("polygons", []):
            rings_out = []
            for ring in poly:
                xs, ys = decode_ring(ring, dec)
                coords = [[round(float(x), 3), round(float(y), 3)] for x, y in zip(xs, ys)]
                # Close ring for GeoJSON.
                if coords and coords[0] != coords[-1]:
                    coords.append(coords[0])
                # Decimate only if needed later; keep full fidelity for now.
                rings_out.append(coords)
            if rings_out:
                multipoly.append(rings_out)
        features.append(
            {
                "type": "Feature",
                "properties": {"name": feat.get("name")},
                "geometry": {"type": "MultiPolygon", "coordinates": multipoly},
            }
        )
    geojson = {"type": "FeatureCollection", "features": features}
    # Decimate if over budget (~1MB): stride 2, then 3, ... until small.
    stride = 1
    blob = json.dumps(geojson, separators=(",", ":"))
    while len(blob.encode("utf-8")) > 950_000 and stride < 10:
        stride += 1
        for feat_out in features:
            decimated = []
            for poly in feat_out["geometry"]["coordinates"]:
                rings_d = []
                for ring in poly:
                    if len(ring) > 4:
                        core = ring[:-1][::stride] + [ring[-1]]
                        rings_d.append(core)
                    else:
                        rings_d.append(ring)
                decimated.append(rings_d)
            feat_out["geometry"]["coordinates"] = decimated
        blob = json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"))
    with open(OUT_GEOJSON, "w", encoding="utf-8") as f:
        f.write(blob if len(blob.encode("utf-8")) <= 950_000 else json.dumps(geojson, separators=(",", ":")))
    print(f"Wrote {OUT_GEOJSON} ({os.path.getsize(OUT_GEOJSON)} bytes, stride={stride})")

    # Test points against the in-memory flags.
    def query(lon, lat):
        c = int(math.floor((lon - LON_MIN) / RES))
        r = int(math.floor((lat - LAT_MIN) / RES))
        if not (0 <= c < W and 0 <= r < H):
            return 0
        return int(flags[r, c])

    print("Test points (flag bit0=fire bit1=island bit2=mainland):")
    failures = 0
    for name, lon, lat, profile, expected in TEST_POINTS:
        fl = query(lon, lat)
        if profile in ("fire", "fire_land"):
            got = bool(fl & 1)
        elif profile in ("air_island",):
            got = bool(fl & 2)
        elif profile in ("air_mainland",):
            got = bool(fl & 4)
        else:
            got = bool(fl & 6)
        status = "OK" if got == expected else "FAIL"
        if got != expected:
            failures += 1
        print(f"  {status} {name} ({lon},{lat}) [{profile}]: flag={fl} got={got} want={expected}")
    if failures:
        print(f"{failures} test-point failures", file=sys.stderr)
        sys.exit(1)
    print("All test points pass.")


if __name__ == "__main__":
    main()
