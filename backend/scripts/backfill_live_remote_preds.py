"""Backfill stored-forecast preds onto remote Supabase demo outcomes.

Context: migration 021 (infra/supabase/migrations/021_pred_tersimpan.sql)
adds pred_prob/raw_prob/p_max/weights_version/active_sources/
forecast_created_at to ground_truth_outcomes. Projects created before 021
was applied sync outcome rows SLIM (pred bundle stripped by the PGRST204
fallback in outcomes_router) — the live aggregate then counts them as
missing_pred and Vercel prod stays at N=0 behind the batch baseline.

Apply 021 first (Supabase dashboard SQL editor, or `supabase db push`),
then run:  cd backend && python scripts/backfill_live_remote_preds.py

Idempotent: only touches INC-LIVE-DEMO-* rows, only fills pred columns
that are NULL, and reuses the exact SEED_ROWS forecast bundle from
seed_live_demo.py. Uses backend config (no hardcoded secrets).
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from seed_live_demo import SEED_ROWS, WORKFLOW_INCIDENT  # noqa: E402

FORECAST_DEFAULTS = {
    "p_max": 0.688,
    "weights_version": "ECONOMIC_ACTIVE",
    "active_sources": ["BMKG_RADAR", "TOMTOM_FLOW"],
    "forecast_created_at": None,
}

# incident_suffix -> full forecast bundle (mirrors the POST /outcomes payload
# seed_live_demo.py sends; workflow row 001 auto-joins the approval forecast).
FORECASTS = {
    "001": {"pred_prob": 0.91, "raw_prob": 0.83, **FORECAST_DEFAULTS,
            "forecast_created_at": "2026-10-26T10:00:00+00:00"},
}
for suffix, pred, _delay, _spike, _src, _ver, _note in SEED_ROWS:
    if suffix == "006":  # workflow row; covered by "001" above
        continue
    FORECASTS[suffix] = {"pred_prob": pred,
                         "raw_prob": round(max(0.05, pred - 0.08), 4),
                         **FORECAST_DEFAULTS}


def main() -> None:
    from app.db.supabase_client import get_write_client

    sb = get_write_client()

    # 0. Prove 021 is applied before touching data.
    try:
        sb.table("ground_truth_outcomes").select("pred_prob").limit(1).execute()
    except Exception as e:
        print(f"ABORT: remote ground_truth_outcomes lacks migration 021 pred columns ({str(e)[:160]})")
        print("Apply infra/supabase/migrations/021_pred_tersimpan.sql in the Supabase SQL editor, then re-run.")
        sys.exit(2)

    updated = skipped = 0
    for suffix, bundle in sorted(FORECASTS.items()):
        incident_id = f"INC-LIVE-DEMO-{suffix}" if suffix != "001" else WORKFLOW_INCIDENT
        try:
            got = sb.table("ground_truth_outcomes").select("id,pred_prob").eq(
                "incident_id", incident_id).execute()
        except Exception as e:
            print(f"{incident_id}: read failed ({str(e)[:120]})")
            continue
        rows = getattr(got, "data", None) or []
        if not rows:
            print(f"{incident_id}: no remote row (seed_live_demo.py has not synced it yet)")
            continue
        for row in rows:
            if row.get("pred_prob") is not None:
                skipped += 1
                continue
            try:
                sb.table("ground_truth_outcomes").update(bundle).eq("id", row["id"]).execute()
                updated += 1
                print(f"{incident_id}: backfilled pred_prob={bundle['pred_prob']}")
            except Exception as e:
                print(f"{incident_id}: update failed ({str(e)[:160]})")
    print(f"BACKFILL DONE updated={updated} already_filled={skipped}")


if __name__ == "__main__":
    main()
