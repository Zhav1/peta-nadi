"""Sumatra geographic scope gate (no numpy, stdlib only).

Runtime asset: backend/app/fixtures/sumatra_scope_mask.json
  bbox [94,-7,109,7], res 0.01deg, W=1500, H=1400, flags uint8:
    bit0 = fire land, bit1 = air island, bit2 = air mainland.
  Grid indexing: row=floor((lat-lat_min)/res), col=floor((lon-lon_min)/res).

Fail-closed: outside bbox => False; missing/corrupt asset => False.
"""
import base64
import hashlib
import json
import logging
import os
import zlib

logger = logging.getLogger(__name__)

_BBOX = [94.0, -7.0, 109.0, 7.0]
_RES = 0.01
_W, _H = 1500, 1400

_MASK = None  # bytes of uint8 flags, length W*H
_META = {"ok": False, "reason": "not loaded", "bbox": list(_BBOX), "resolution": _RES}
_LOADED = False


def _asset_path():
    return os.path.join(os.path.dirname(__file__), "..", "fixtures", "sumatra_scope_mask.json")


def _load():
    global _MASK, _META, _LOADED
    if _LOADED:
        return
    _LOADED = True
    path = os.path.abspath(_asset_path())
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        bbox = payload.get("bbox") or list(_BBOX)
        res = float(payload.get("resolution", _RES))
        w = int(payload.get("width", _W))
        h = int(payload.get("height", _H))
        enc = payload.get("encoding", "")
        data_b64 = payload.get("data", "")
        want_sha = payload.get("sha256", "")
        if enc != "zlib+base64" or not data_b64:
            raise ValueError(f"unsupported encoding: {enc!r}")
        raw = zlib.decompress(base64.b64decode(data_b64))
        if len(raw) != w * h:
            raise ValueError(f"mask size {len(raw)} != {w*h}")
        if want_sha and hashlib.sha256(raw).hexdigest() != want_sha:
            raise ValueError("sha256 mismatch")
        _MASK = raw
        _META = {
            "ok": True,
            "reason": "loaded",
            "bbox": [float(v) for v in bbox],
            "resolution": res,
            "width": w,
            "height": h,
            "generated_at": payload.get("generated_at"),
        }
    except FileNotFoundError:
        _MASK = None
        _META = {
            "ok": False,
            "reason": "scope asset missing",
            "bbox": list(_BBOX),
            "resolution": _RES,
        }
        logger.error("Sumatra scope asset missing: %s (fail closed)", path)
    except Exception as e:
        _MASK = None
        _META = {
            "ok": False,
            "reason": f"scope asset corrupt: {e}",
            "bbox": list(_BBOX),
            "resolution": _RES,
        }
        logger.error("Sumatra scope asset corrupt (%s): %s (fail closed)", path, e)


def scope_asset_status():
    """Health for filtered layers: {ok, reason, bbox, resolution}."""
    _load()
    return dict(_META)


def _profile_mask(profile):
    p = str(profile or "air").lower().replace("-", "_")
    if p in ("fire", "fire_land", "fireland"):
        return 0x01
    if p in ("air_island", "island", "airisland"):
        return 0x02
    if p in ("air_mainland", "mainland", "airmainland"):
        return 0x04
    # air / aircraft / default: either air buffer
    return 0x06


def is_in_sumatra_scope(lon, lat, profile="air"):
    """True when (lon,lat) is inside the Sumatra scope for the profile."""
    _load()
    if _MASK is None:
        return False
    try:
        lon_f = float(lon)
        lat_f = float(lat)
    except (TypeError, ValueError):
        return False
    bbox = _META.get("bbox") or _BBOX
    res = float(_META.get("resolution") or _RES)
    w = int(_META.get("width") or _W)
    h = int(_META.get("height") or _H)
    lon_min, lat_min, lon_max, lat_max = (float(v) for v in bbox)
    if not (lon_min <= lon_f < lon_max and lat_min <= lat_f < lat_max):
        # Edge: exactly on max border belongs to last cell.
        if not (lon_min <= lon_f <= lon_max and lat_min <= lat_f <= lat_max):
            return False
        if lon_f >= lon_max or lat_f >= lat_max:
            # Clamp max-edge points into the last cell.
            lon_f = min(lon_f, lon_max - 1e-9)
            lat_f = min(lat_f, lat_max - 1e-9)
        else:
            return False
    import math as _math

    col = int(_math.floor((lon_f - lon_min) / res))
    row = int(_math.floor((lat_f - lat_min) / res))
    if not (0 <= col < w and 0 <= row < h):
        return False
    flag = _MASK[row * w + col]
    want = _profile_mask(profile)
    if want == 0x06:
        return bool(flag & 0x06)
    return bool(flag & want)
