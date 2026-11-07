"""Phase 179 D2: Honest fallbacks - synthetic maritime baselines purged."""
import pytest
from app.adapters.aisstream_adapter import generate_sumatra_maritime_fallback, FALLBACK_VESSEL_BASELINES


def test_maritime_vessels_have_coordinates_and_belawan_port():
    """Phase 179 D2: generate_sumatra_maritime_fallback returns [] when no live AIS feed is connected."""
    vessels = generate_sumatra_maritime_fallback()
    assert vessels == [], "Phase 179 D2 invariant: maritime fallback must return [] to prevent synthetic ghost vessels"

    # Static catalog is preserved for historical baseline reference only
    assert len(FALLBACK_VESSEL_BASELINES) > 0
    belawan_ships = [v for v in FALLBACK_VESSEL_BASELINES if "belawan" in str(v.get("origin", "")).lower()]
    assert len(belawan_ships) > 0
    for ship in belawan_ships:
        assert -6.5 <= ship["lat"] <= 6.5
        assert 94.5 <= ship["lon"] <= 109.0
