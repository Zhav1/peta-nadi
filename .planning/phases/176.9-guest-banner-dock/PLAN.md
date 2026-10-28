# PLAN — Phase 176.9: Guest Banner Dock

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commits recorded:** `92b2adc` — `fix(m9-176.9): dock guest banner in news panel, fix mobile sheet overflow`
· merge `6db893a` — `fix: M9 final layout - docked guest banner, mobile sheet overflow`
· gate `fa2edc9`
**Diff size (verified):** `92b2adc` — 8 files, +163/−17

## Objective

Phase 176.8 reserved clearance by measuring. The measurement was taken
from the viewport while the mobile sheet extended past it, so the guest
banner still overlapped content by **17.6px** and the footer clipped.
Stop measuring; make overlap structurally impossible.

## Scope IN

- The banner is **no longer floated**.
- Berita becomes a **flex column** on desktop *and* inside the mobile
  sheet: header → filters → `min-h-0` scroll list → docked banner →
  footer.
- The `ResizeObserver` / clearance-padding machinery is **deleted**.
  Verified: `GuestEvaluationBanner.tsx:19` records that
  "`--guest-banner-clearance` measurement (ResizeObserver + padding) is
  gone."

## Scope OUT

- No change to the banner's content, copy, or CTA.
- No change to feed supply or card anatomy.
- No JS measurement of any kind replacing the deleted machinery — that
  is the point of the phase.

## Decisions locked

1. **Overlap is prevented by layout structure, not by measured padding.**
   A `min-h-0` scroll region between fixed siblings cannot overflow into
   its neighbours.
2. **One column definition, two containers.** The desktop panel and the
   mobile sheet use the same ordering, so a fix in one cannot diverge
   from the other.
3. **Delete the workaround, do not disable it.** The measurement code is
   removed rather than left inert; dead clearance logic would be
   re-enabled by a future reader.
4. **The scroll region is the only flexible child.** Header, banner, and
   footer keep their intrinsic height at every viewport.

## Risk notes

- `min-h-0` is required for the flex child to actually shrink; omitting
  it recreates the exact overflow this phase removes.
- A future element inserted between the scroll list and the banner
  changes the arithmetic implicitly, so the ordering is the contract.
