"""Retention contract — stale-while-revalidate windows (SPEC M9 decision 4).

Single source of truth for every freshness number the backend publishes:

* **weather** (BMKG + Open-Meteo fusion): 10-minute refresh, 6 h validity,
  24 h stale ceiling (last-known-good may be served up to 24 h).
* **FIRMS** (Titik Panas): 1 h refresh, 6 h validity, 6 h stale ceiling.
* **traffic** (TomTom flow + incidents): 30-minute refresh, validity == cadence.

The router imports these names; nothing else may declare its own copy. Changing
a number here changes the cache TTL, the stale threshold and the human-readable
age string in ``reason`` in one place.
"""
from typing import Optional

# --- Weather (BMKG + Open-Meteo NWP fusion) --------------------------------
WEATHER_REFRESH_S = 600  # 10-min poll window (decision 4)
WEATHER_VALIDITY_HOURS = 6  # a fusion snapshot describes the next 6 h
WEATHER_STALE_CEILING_HOURS = 24  # stop serving last-known-good after 24 h

# --- Titik Panas (NASA FIRMS) ----------------------------------------------
FIRMS_REFRESH_S = 3600  # 1 h poll window
FIRMS_VALIDITY_HOURS = 6  # detection window validity
FIRMS_STALE_CEILING_HOURS = 6  # 6 h stale ceiling

# --- Traffic (TomTom flow segments + incidents) ----------------------------
# Cadence and published validity are deliberately the SAME number: a 600 s TTL
# behind a 3600 s cadence made ``traffic_flow_segments`` / ``corridor_context``
# honestly "stale" for 50 of every 60 minutes by construction (production
# 2026-11-10: observed_at 06:47:32, valid_until 06:57:32, expired by 2515 s).
# With TTL == cadence a section can only go stale when a refresh is actually
# missed, never because the arithmetic was wrong.
TOMTOM_REFRESH_S = 1800  # 30-min poll window (was 3600)
TOMTOM_VALIDITY_S = 1800  # published validity window, == TOMTOM_REFRESH_S (was 600)


def human_age_id(seconds: Optional[float]) -> str:
    """Indonesian age string for ``reason`` fields: "4 menit", "2.5 jam", "3 hari".

    Never returns an empty string: an unparseable/absent timestamp becomes
    "waktu tidak diketahui" so a stale payload can never read as fresh.
    """
    if seconds is None:
        return "waktu tidak diketahui"
    try:
        value = max(0.0, float(seconds))
    except (TypeError, ValueError):
        return "waktu tidak diketahui"
    if value < 60:
        return "kurang dari 1 menit"
    if value < 3600:
        return f"{int(value // 60)} menit"
    if value < 86400:
        hours = round(value / 3600.0, 1)
        text = f"{hours:g}"
        return f"{text} jam"
    days = round(value / 86400.0, 1)
    return f"{days:g} hari"


__all__ = [
    "WEATHER_REFRESH_S",
    "WEATHER_VALIDITY_HOURS",
    "WEATHER_STALE_CEILING_HOURS",
    "FIRMS_REFRESH_S",
    "FIRMS_VALIDITY_HOURS",
    "FIRMS_STALE_CEILING_HOURS",
    "TOMTOM_REFRESH_S",
    "TOMTOM_VALIDITY_S",
    "human_age_id",
]
