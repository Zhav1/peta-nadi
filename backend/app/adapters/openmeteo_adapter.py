"""Backwards-compatibility shim — canonical implementation lives in
``app.adapters.open_meteo_adapter`` (Phase 59 gap batch A: single OpenMeteoAdapter).

All importers should migrate to::

    from app.adapters.open_meteo_adapter import OpenMeteoAdapter
"""
from app.adapters.open_meteo_adapter import OpenMeteoAdapter

__all__ = ["OpenMeteoAdapter"]
