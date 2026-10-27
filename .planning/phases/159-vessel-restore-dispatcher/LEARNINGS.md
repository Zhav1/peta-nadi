# LEARNINGS — Phase 159: Vessel Restore (Dispatcher)

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Modality-split tenancy** — `matches_tenant(...) or modality in
   (maritime, air)`: trucks isolated, vessels public. Restores
   pre-Phase-81 Kapal/Udara pills without reopening cross-tenant GPS.
2. **Badge/count split** — pills show the combined drawable slice;
   Perusahaan badge shows `liveTenantVehicles` only, so tenant honesty
   survives the restore.
3. **Test contract update** — dispatcher test now asserts trucks-scoped
   AND vessels-present (not all-tenant), locking the split.

## 2. Concerns (open, evidenced)

1. Any new modality defaults to tenant-scoped unless explicitly listed —
   correct safe default; document when adding modalities.
2. `situationalVessels` excludes trucks by construction; a refactor that
   reorders the filter must keep that invariant.

## 3. Constraints (observed this window)

- Tenant scoping: JWT `company_id` claim authoritative; `?company_id=`
  never widens (Phase 81, kept).
- No `FALLBACK_FLEET` for scoped roles; no claim → honest empty.

## 4. Conditions (user-stated this window)

- Dispatcher needs situational ships/planes back; tenant truck privacy
  non-negotiable.

## 5. Issues found (do not repeat)

1. Blanket `tenant_only` on all modalities zeroed the Kapal/Udara pills
   — scope by modality, not by endpoint.
2. Counting vessels in the Perusahaan badge would overstate tenant
   assets — badge and pills count different slices by design.
