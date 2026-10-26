"""TomTom issue diagnostic: key, Redis, latch, live health/fetch, 403 classifier."""
import asyncio
import sys

sys.path.insert(0, "backend")

from app.config import get_settings
from app.adapters.tomtom_adapter import TomTomAdapter
from app.services import redis_client as rc


def mask(key: str) -> str:
    if not key:
        return "(missing)"
    if len(key) <= 8:
        return "****"
    return key[:4] + "****" + key[-4:]


def check_classifier():
    A = TomTomAdapter
    cases = [
        (403, {"detailedError": {"code": "InsufficientFunds"}}, "", True),
        (403, {"code": "OVER_QUOTA"}, "", True),
        (403, {}, "quota exceeded", True),
        (403, {"error": "Forbidden bad key"}, "invalid key", False),
        (403, {}, "", False),
        (200, {}, "", False),
    ]
    ok = True
    for status, payload, text, expect in cases:
        got = A._is_credit_exhaustion(status, payload, text)
        mark = "OK" if got == expect else "FAIL"
        if got != expect:
            ok = False
        print(f"  classifier {status} {str(payload)[:60]!r} -> {got} (expect {expect}) [{mark}]")
    return ok


async def main():
    s = get_settings()
    print(f"1. API key: {mask(s.tomtom_api_key or '')} set={bool(s.tomtom_api_key)}")
    print(f"   redis_url: {(s.redis_url.split('@')[-1] if '@' in s.redis_url else s.redis_url)[:60]}")

    try:
        r = rc.get_redis()
        print(f"2. Redis ping: {r.ping()}")
        r.set("lrip:health:probe:tomtom-check", "ok", ex=60)
        print(f"   Redis write/read: {r.get('lrip:health:probe:tomtom-check')}")
        print("   Redis backend-direct fallback available: yes (memory mirror on exception)")
    except Exception as e:
        print(f"2. Redis DOWN: {e}")
        print("   Fallback: memory mirror active, backend keeps working (dedup/health/cache)")

    a = TomTomAdapter()
    print(f"3. Latch now: exhausted={a.is_credit_exhausted()} reason={a.credit_exhausted_reason()!r} until={a.credit_exhausted_until_iso()!r}")

    print("4. Classifier (no network):")
    clf_ok = check_classifier()

    if not s.tomtom_api_key:
        print("5. Live health_check: SKIPPED (no key) -> fetch would return degraded=tomtom_api_key_missing")
        print("6. Live fetch: SKIPPED (no key)")
        print(f"\nVERDICT: key-missing (classifier={'ok' if clf_ok else 'BROKEN'})")
        return

    try:
        healthy = await a.health_check()
        print(f"5. Live health_check: {healthy} latch_after={a.is_credit_exhausted()} reason={a.credit_exhausted_reason()!r}")
    except Exception as e:
        print(f"5. Live health_check ERROR: {e}")

    try:
        raw = await a.fetch()
        print(f"6. Live fetch: status={raw.get('status')} credit={raw.get('credit_exhausted')} until={raw.get('credit_exhausted_until')}")
        print(f"   degraded_reason={raw.get('degraded_reason')!r}")
        print(f"   flow={len(raw.get('flow', []))} incidents={len(raw.get('incidents', []))} tiles={raw.get('tiles_total')}/{raw.get('tiles_queried')}q/{raw.get('tiles_failed')}f")
        if raw.get("status") == "degraded" and raw.get("credit_exhausted"):
            print("   => credit latch ACTIVE (quota). Fix: top-up TomTom / wait until ISO / POST /traffic/tomtom/reset-latch")
        elif raw.get("status") == "down":
            print("   => API reachable but all flow failed (network/params, NOT latch). Check key + connectivity.")
        elif raw.get("status") == "degraded":
            print("   => partial failure, no latch. Non-credit 403s or tile errors — see degraded_reason.")
        else:
            print("   => TomTom LIVE ok.")
    except Exception as e:
        print(f"6. Live fetch ERROR: {e}")

    print(f"\nVERDICT: classifier={'ok' if clf_ok else 'BROKEN'} latch={a.is_credit_exhausted()} until={a.credit_exhausted_until_iso()!r}")


if __name__ == "__main__":
    asyncio.run(main())
