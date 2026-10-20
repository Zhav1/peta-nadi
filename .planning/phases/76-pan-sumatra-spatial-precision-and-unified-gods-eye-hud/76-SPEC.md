# SPEC: Phase 76 - Pan-Sumatra Spatial Precision, Multi-Agent Consensus Escalation & Unified God's-Eye HUD

## 1. Problem Statement
1. Lexical collision in NLP gazetteer: standalone word `"panjang"` registered as a Tier-1 port node mapped news containing `"antrean panjang"`, `"kemacetan panjang"`, or `"berdurasi panjang"` to Pelabuhan Panjang Lampung `(-5.4744, 105.3183)` even when reporting events in Aceh Barat Daya (Abdya) or North Sumatra.
2. Missing pan-Sumatra subdistrict and regency coverage: 13 Aceh regencies/capitals and major logistics subdistricts were absent from `PAN_SUMATRA_GAZETTEER`.
3. Inverted substring matching in `geocode()`: `"padang panjang"` matched `"panjang"` first due to substring containment checks.
4. Coarse hazard bounding: synthetic 16–20 km circles painted entire cities red for localized road obstructions or subdistrict floods.
5. Ingestion gap: live production news ingestion lacked cross-agent consensus gate validation prior to generating critical road blockades.
6. HUD clutter & occlusion: floating elements (`FILTER ZONA PETA`, search bar, telemetry modal) collided and sat underneath the left news sidebar.

## 2. Technical Invariants & Scope
- **Deterministic CPU Router**: `NetworkX + OR-Tools / 2-Opt` preserved; parallel bypass routes inside districts must remain routable during road blockages.
- **Micro-Spatial Bounding**:
  - *Tier A (`corridor_point`)*: 0.6–1.2 km anisotropic highway ellipse with `semi_minor <= 0.5 km`.
  - *Tier B (`kecamatan_kelurahan`)*: 1.5–2.2 km ADM3 subdistrict boundary polygon.
  - *Tier C (`kabupaten_kota` / `province_only`)*: 3.2–4.5 km subtle advisory zone; hard invariant: capped at `YELLOW_CLARIFY`.
- **4-Channel Consensus Gate**:
  - Channel $W$: BMKG Weather Radar + Open-Meteo precipitation.
  - Channel $T$: TomTom Traffic Flow speed deltas.
  - Channel $I$: Official OSINT press authority tier.
  - Channel $E$: PIHPS strategic food commodity price sensitivity.
- **Bounded Flexbox Viewport Shell**: Map controls live strictly inside the bounded map canvas to the right of the Left Berita Sidebar with dynamic resize triggers.

## 3. Schema & Persistence
- `EXTRACTION_SCHEMA_VERSION = 5` in `news_extractor.py`.
- Automated startup remediation `remediate_contaminated_incidents()` in `unified_news_ingestor.py` and one-off remediation script `backend/scripts/remediate_panjang_incidents.py`.
