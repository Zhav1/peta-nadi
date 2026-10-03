# PreHub UI Slop Audit

Read-only. No project files were changed. Scratch scripts and screenshots live under `scratch/` in this artifact folder.

## How this was audited

- **Rendered, not just read.** I ran the Next.js app on a separate port and captured it with Playwright Chromium: landing at 1440x900 and 390x844 (every viewport down the page), and five dashboard tabs at 1440x900. I also pulled computed-style statistics from the live DOM and counted class patterns across 46 component files (13.5k lines).
- **Trap worth knowing:** on this machine `localhost:3000` is a **Grafana** instance (the observability stack), not this app. [`playwright.config.ts`](file:///d:/College/Pidi.id/frontend/playwright.config.ts) uses `baseURL: 3000` with `reuseExistingServer: true`, so any e2e/screenshot run while Docker is up will silently capture Grafana. I discarded my first captures for this reason.
- **Limits.** Dev-mode render, no backend, so live-data states were not seen (TomTom/BMKG dropdowns showed `...`). Not audited: the auth and fleet-onboarding modals, the sidebar Evidence/Mitigation tabs, `/demo-remote`, and the dashboard on mobile. The impeccable detector script was not present at `.agent/skills/impeccable/scripts`, so no automated detector findings are included. The contrast figure below is my own calculation from the color values.
- **No design contract exists.** There is no `PRODUCT.md`, `DESIGN.md`, or `design-system/MASTER.md` (the last one is referenced by `.agents/AGENTS.md` but missing). I audited against your stated direction in the request.
- **Two surfaces, two standards.** The landing page is a *Persuade* surface, so your editorial/restrained direction applies in full. The dashboard is an *Operate* surface: density and monospaced numerals are legitimate there. I only flag dashboard issues that are unrelated to density.

![Hero at 1440x900](C:/Users/VICTUS/.gemini/antigravity/brain/ab41683f-e22c-4dbd-ae17-0ecac0a99c96/home-desktop-00.png)

## Verdict

**Fails the stated direction.** The landing page is a near-textbook 2024-25 "dark AI product" template: navy ground, cyan-to-emerald neon, glass cards, mono eyebrow pills, highlighted-word headline, 3x2 icon-card grids, a four-color stats strip, tech-stack chips, and a giant ghost wordmark in the footer. The footer even labels itself `Anti-AI-Slop • Glassmorphism 2.0 • 60 FPS Canvas`.

The part that is not slop is buried: a specific, local causal story (Belawan Port closes, then cooking-oil trucks stall, then Medan supply drops, then shallot prices rise 18.5%). It appears only as 12px tinted chips in the dashboard and one line in a feature card. That is your editorial content, and the layout hides it.

Severity scale: **P0** blocks the task or destroys trust, **P1** major, **P2** minor, **P3** polish. **Findings: 0 P0, 19 P1, 12 P2, 2 P3** (C7 has a P1 and a P3 part and is counted once, as P1). Most P1s are subtraction work, not new design. Fix first: B3 (stock photo presented as the product), C1 (contradictory invented numbers), C7 (footer self-label), D2 (fonts not rendering), A4 (no reduced-motion).

---

## 1. Findings

### A. Visual overload

**A1. Highlighter-chip headlines**
- **Element / location:** hero h1 ([OnboardHero.tsx L52-62](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardHero.tsx#L52-L62)); section h2s in [KineticFeatureGrid L108](file:///d:/College/Pidi.id/frontend/components/onboard/KineticFeatureGrid.tsx#L108), [InteractiveDemoShowcase L102](file:///d:/College/Pidi.id/frontend/components/onboard/InteractiveDemoShowcase.tsx#L102), [LiveTelemetryShowcase L89](file:///d:/College/Pidi.id/frontend/components/onboard/LiveTelemetryShowcase.tsx#L89).
- **Problem:** Key words sit in solid cyan/emerald chips, rotated +/-1 degree, with border, neon glow, and `cursor-pointer` (they are not interactive). One heading splits a word: "shape" + chip "ing". Same trick in 4 of 4 headings.
- **Why it feels like AI slop:** Highlighted-word-in-a-pill is the most recognizable generated-landing gesture. The split "shape|ing" is a gimmick that hurts reading and screen readers. Repetition turns emphasis into wallpaper.
- **Severity:** P1
- **Action:** Delete the chips. Let size, weight, and one clear sentence carry the hierarchy.

**A2. Glow and shadow stack**
- **Element / location:** hero halos ([L36-37](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardHero.tsx#L36-L37): 800x400 and 600x300 blur-[160px/140px] blobs), `drop-shadow` on text, neon `shadow-[0_0_35px...]` on chips and CTAs, glowing progress bar, glowing scrollbar hover ([globals.css L56-59](file:///d:/College/Pidi.id/frontend/app/globals.css#L56-L59)).
- **Problem:** 26 arbitrary neon shadows, 104 `shadow-lg/xl/2xl`, 9 text drop-shadows, 104 `backdrop-blur`. The rendered dashboard map has 111 elements carrying box-shadows and 48 with blur or filter.
- **Why it feels like AI slop:** Glow is used as a substitute for hierarchy. When everything glows, nothing is emphasised, and the effect reads as "futuristic" rather than as information.
- **Severity:** P1
- **Action:** Remove all neon glows and text shadows. Keep at most one soft elevation level for genuinely floating UI (menus, toasts).

**A3. Accent explosion with no semantics**
- **Element / location:** hero metric strip ([L99-132](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardHero.tsx#L99-L132)), feature badges ([KineticFeatureGrid L18-91](file:///d:/College/Pidi.id/frontend/components/onboard/KineticFeatureGrid.tsx#L18-L91)), gradient CTAs.
- **Problem:** Four numbers get four hues (cyan, emerald, amber, purple) and an icon each. Six feature badges cycle emerald, cyan, orange, purple, amber, emerald. Primary CTAs are `from-cyan-400 via-emerald-400 to-cyan-400`. Source counts: `text-cyan` 291, `text-emerald` 146, `text-amber/orange` 116, `text-red` 56, `text-purple` 18, `text-blue` 11.
- **Why it feels like AI slop:** Color is assigned for variety, not meaning. Purple is not the banned AI purple/pink gradient, but cyan-emerald neon gradient on navy is the same genre of default.
- **Severity:** P1
- **Action:** One accent, used only for the primary action and focus. Keep red/amber/green strictly for risk status on the dashboard, where they carry meaning.

**A4. Ambient animation with no reduced-motion path**
- **Element / location:** pulsing logo ([hero L45](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardHero.tsx#L45)), pulsing "SYSTEM ONLINE" dot, bouncing arrows and unlock icon ([ImageSequenceCanvas L318, L391](file:///d:/College/Pidi.id/frontend/components/onboard/ImageSequenceCanvas.tsx#L318)), autoplay hero video, `animate-ping` dots.
- **Problem:** 27 `animate-pulse`, 12 `animate-spin`, 15 ping/bounce/custom. **Zero** occurrences of `prefers-reduced-motion` or `motion-reduce` in the codebase.
- **Why it feels like AI slop:** Pulsing "live" dots and bouncing "scroll" arrows are decoration that imitates a live system. They are also an accessibility failure.
- **Severity:** P1 (a11y)
- **Action:** Remove decorative pulses and bounces. Keep motion only for state change and the scroll story. Add a reduced-motion alternative to the scroll sequence and video.

**A5. Scroll-jacked sequence buried in HUD chrome**
- **Element / location:** [ImageSequenceCanvas L283-392](file:///d:/College/Pidi.id/frontend/components/onboard/ImageSequenceCanvas.tsx#L283-L392): a 300vh sticky viewport.
- **Problem:** On one full-bleed frame the user sees: a progress bar, a `FRAME 001 / 121` pill, a `SCROLL LOCKED • 0% COMPLETED` pill (nothing is actually locked), a four-button chapter rail, a storytelling card with icon tile, phase pill, three metrics, and a bouncing "Keep Scrolling" arrow. That is 8 overlays competing with the imagery.
- **Why it feels like AI slop:** Exposing an implementation detail (frame number) as UI, plus labels narrating scrolling, is "game HUD" cosplay. The chapter number appears three times within a few hundred pixels (rail badge `02`, "PHASE 02", pill "PHASE 02: ...").
- **Severity:** P1
- **Action:** Keep the four-chapter story, drop everything else. One caption per chapter, set in real typography. Rail optional.

![Sequence chapter 2](C:/Users/VICTUS/.gemini/antigravity/brain/ab41683f-e22c-4dbd-ae17-0ecac0a99c96/home-desktop-02.png)

**A6. Hero video fights the headline**
- **Element / location:** [hero L21-37](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardHero.tsx#L21-L37) and `public/onboard/hero-bg.mp4`.
- **Problem:** The video has baked-in UI text (a ghosted "...-JAVA LOGISTICS CORRIDOR", "VIEW: 4D TRAFFIC", a "TIMESTAMP: OCT 26, 2023" panel) that collides with the badge and headline. The code then adds two more glow halos and two vignette gradients on top to compensate.
- **Why it feels like AI slop:** Layers piled on to rescue a busy asset instead of choosing a calmer one.
- **Severity:** P2
- **Action:** Use footage without embedded text, or a still. Drop the compensating halos and gradients.

### B. Component slop

**B1. Feature grid is six identical cards with a fake affordance**
- **Element / location:** [KineticFeatureGrid L93-177](file:///d:/College/Pidi.id/frontend/components/onboard/KineticFeatureGrid.tsx#L93-L177).
- **Problem:** Each card stacks icon tile, colored pill badge, mono category eyebrow, title, paragraph, divider, mono metric, and chevron. That is three tiers of metadata about one claim. Cards are `cursor-pointer` with a chevron but have no link or handler. `onMouseEnter` sets a persistent "active" state, so one card always glows cyan even with no interaction (visible in the capture).
- **Why it feels like AI slop:** Icon + title + description repeated in a symmetrical grid is the defining generated-feature-section pattern. The chevron promises navigation that does not exist.
- **Severity:** P1
- **Action:** Cut to three to four statements with no icons, badges, eyebrows, or chevrons. Or fold into the demo section, which repeats the same three capabilities.

![Feature cards](C:/Users/VICTUS/.gemini/antigravity/brain/ab41683f-e22c-4dbd-ae17-0ecac0a99c96/home-desktop-06.png)

**B2. Data-source cards show fabricated live status**
- **Element / location:** [LiveTelemetryShowcase L17-72, L109-143](file:///d:/College/Pidi.id/frontend/components/onboard/LiveTelemetryShowcase.tsx#L17-L72).
- **Problem:** Six more icon cards, each with a colored dot and a hard-coded string such as `HEALTHY (100%)`, `CONNECTED`, `SATELLITE ACTIVE`. These are static text styled as live health. The row labelled "Frequency" contains `NER Geo-Parser` and `MODIS / VIIRS Data`, which are not frequencies. Cards are `cursor-pointer` with no action.
- **Why it feels like AI slop:** Status indicators with no data behind them, and a label that does not match its content, are signs of generated filler.
- **Severity:** P1 (misleading as well as decorative)
- **Action:** Replace with a plain two-column list: source name, what it provides. No status, no dots, no icons.

**B3. "Interactive preview" is a stock photo in fake window chrome**
- **Element / location:** [InteractiveDemoShowcase L19-80, L185-208](file:///d:/College/Pidi.id/frontend/components/onboard/InteractiveDemoShowcase.tsx#L185-L208).
- **Problem:** Under the heading "Experience the 4D Command Center in action", the image for tab 1 is an Unsplash photo of a **wooden world map** (verified in render). Source shows tabs 2 and 3 are also Unsplash URLs. It is wrapped in a fake window bar ("PreHub Command Center Window"), a pulsing dot, a `LIVE STAGING` badge, and a caption "Click Launch to Operate ->". The `LIVE STAGING` text is green on green and barely legible.
- **Why it feels like AI slop:** A stock image presented as the product is the clearest tell, and for a government/logistics audience it undermines credibility.
- **Severity:** P1 (fix first)
- **Action:** Use real product screenshots, or remove the section. Delete the fake chrome and badges.

![Demo with stock photo](C:/Users/VICTUS/.gemini/antigravity/brain/ab41683f-e22c-4dbd-ae17-0ecac0a99c96/home-desktop-04.png)

**B4. Nesting and container inflation**
- **Element / location:** demo card ([L135](file:///d:/College/Pidi.id/frontend/components/onboard/InteractiveDemoShowcase.tsx#L135)): `rounded-3xl` card, containing `rounded-2xl` image box, containing three `rounded-lg/xl` blurred overlays. Dashboard GraphRAG panel ([AnalyticsSection L290-319](file:///d:/College/Pidi.id/frontend/components/dashboard/AnalyticsSection.tsx#L290-L319)): card, containing four node cards, each with a status chip.
- **Problem:** Three-level card nesting, each level with its own border, blur, and radius. Landing renders 74 bordered elements; dashboard map renders 143.
- **Why it feels like AI slop:** Containers added to "organize" instead of removing content.
- **Severity:** P2
- **Action:** Drop to one container level. Use spacing and a hairline rule to separate, not boxes.

**B5. Pill / eyebrow inflation**
- **Element / location:** hero status pill ([L44](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardHero.tsx#L44)), nav `4D` pill and `SYSTEM ONLINE` ([OnboardNav L23-29](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardNav.tsx#L23-L29)), one mono eyebrow pill above every section heading, six footer tech chips ([OnboardFooter L45-52](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardFooter.tsx#L45-L52)).
- **Problem:** 90 `rounded-full` uses, 137 `uppercase`, 104 `tracking-wider/widest`, 387 `font-mono` across the components. About 36% of landing text elements and 44% of dashboard-map text elements render in monospace.
- **Why it feels like AI slop:** A tiny mono uppercase label above everything is a signature of generated "technical" design. It adds a third voice to elements that already have a title.
- **Severity:** P1
- **Action:** Delete eyebrow pills, the hero status pill, `4D`, and `SYSTEM ONLINE`. Reserve mono for numbers and code only.

**B6. Same destination, five times**
- **Element / location:** `/dashboard` is linked from the nav, hero primary, demo card, telemetry header, and footer. Nav and hero primary are both visible in the first viewport, worded differently ("Launch Dashboard" vs "Buka Command Center").
- **Problem:** Four gradient or filled buttons plus one outline, all doing one job. There is also a second hero button, "Explore 4D Sequence", that just scrolls.
- **Why it feels like AI slop:** Every section ends with a CTA because a template says so.
- **Severity:** P2
- **Action:** One primary CTA in the hero, one quiet link in the nav, one in the closing section. Remove the rest.

**B7. Dashboard header overflows at 1440px**
- **Element / location:** [DashboardClient L948-1086](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx#L948-L1086).
- **Problem:** Verified in render: "PETA OPERASI" wraps to two lines, "Onboard" to two, "+ Onboard Armada" to three. The Intermodal dropdown detaches and floats below the bar over the map, and the TomTom/BMKG dropdowns clip at the top edge. The bar holds logo, back-link, five tabs, three telemetry dropdowns, an add-fleet button, and a role badge in 64px. Icons are mixed with literal glyphs (`◄`, `▼`, and a `+` next to a `PlusCircle` icon).
- **Why it feels like AI slop:** Everything was added, nothing was prioritized.
- **Severity:** P1 (broken layout)
- **Action:** Decide the three things that matter in a header. Move the telemetry dropdowns into the map view where they belong and drop the glyph-as-icon habit.

![Dashboard header and map](C:/Users/VICTUS/.gemini/antigravity/brain/ab41683f-e22c-4dbd-ae17-0ecac0a99c96/dash-map.png)

**B8. KPI cards are a template**
- **Element / location:** Reports (3 cards with colored left stripe and corner icon), Evaluation (5 cards: icon, label, big number, target, status word), Simulation (2 striped cards).
- **Problem:** "Big number, small label, icon, colored side border" is repeated across three tabs. Evaluation adds a status word ("Tercapai", "Terkalibrasi") to each, which restates what the number and target already say.
- **Why it feels like AI slop:** The hero-metric template applied wherever a number exists.
- **Severity:** P2
- **Action:** One row of figures with a hairline between them. Drop icons and side stripes. Keep target next to actual only when it is the point.

### C. Information slop

**C1. Contradictory and invented numbers**
- **Element / location:** across landing and dashboard.
- **Problem:** False-positive target: `< 10%` (feature card), `< 5%` (sequence chapter 2), `< 10% FPR` (demo tab). Node count: `18 Nodes` (hero), `54 Simpul Arteri` (features), `54 Verified Nodes` (demo), `18 Hub` (dashboard header). The sequence cards show `Consensus Confidence 94.2%`, `142 Fleets`, `OPTIMAL`, `System Uptime 99.99%` next to a "PREHUB LIVE" badge. [AnalyticsSection L261, L269](file:///d:/College/Pidi.id/frontend/components/dashboard/AnalyticsSection.tsx#L261) hard-codes `2,419 UNIT/S` and `14 NODES`.
- **Why it feels like AI slop:** Plausible-sounding figures that nothing backs up, and that disagree with each other.
- **Severity:** P1
- **Action:** Remove every figure that is not computed or sourced. If an illustrative value stays, label it as an example.

**C2. Implementation jargon as marketing copy, said four times**
- **Element / location:** hero subtitle (underlined and glowing `LangGraph 6-Agent Swarm`, `NetworkX & OR-Tools`), feature badges (`Mapbox v3 + Deck.gl`, `DeepSeek V3 + Gemini 3.1`), metrics (`60 FPS Canvas Render`, `< 2ms Matrix Solving`), footer chips, footer "Milestone M2 - Final Defense".
- **Problem:** The audience (logistics operators, regulators) does not choose a product by its graph library. The 6-agent swarm and the consensus gate are each restated in the hero, a feature card, a demo tab, and a sequence chapter.
- **Why it feels like AI slop:** Stack names stand in for benefit statements.
- **Severity:** P1
- **Action:** Say each thing once, in outcome terms ("warns before a corridor closes, with the evidence"). Move the stack to a technical page or README.

**C3. Mixed languages in one component**
- **Element / location:** hero: English headline, Indonesian paragraph, Indonesian primary CTA, English secondary CTA, English nav CTA. Dashboard: `PETA OPERASI` next to `ANALYTICS`, `SIMULATION`, `REPORTS`, and `PAST / PRESENT / FUTURE / PREDICT`. Document `lang` is `id`.
- **Why it feels like AI slop:** Copy generated in fragments with no voice decision.
- **Severity:** P2
- **Action:** Pick the language of the audience and apply it everywhere. Keep proper nouns.

**C4. Pseudo-terminal naming**
- **Element / location:** `ARCHIPELAGO_HEATMAP`, `INFLATION_VARIANCY`, `INDICATOR_RISK_RANKING_24H`, `BIRD_EYE_CHILI`, `RICE_PREMIUM`, `GARLIC_WHITE`, `RICE_PRICE:`, `SIMULATION_INSTANCE • STAGE 0`.
- **Problem:** Snake_case identifiers shown to users as headings and data labels.
- **Why it feels like AI slop:** Hacker-HUD costume. "Bird eye chili" and "Garlic white" are commodity names, and they are the real content.
- **Severity:** P2
- **Action:** Normal-case names. "Cabai rawit", "Bawang putih".

**C5. Labels that narrate the UI**
- **Element / location:** `Click Launch to Operate ->`, `Keep Scrolling`, `Scroll Locked`, demo caption `{name} Active Frame`, footer `Quick Routes` repeating the nav.
- **Severity:** P2
- **Action:** Delete. A button that says what it does needs no caption.

**C6. Tiny, low-contrast type**
- **Element / location:** 349 uses of `text-[9px/10px/11px]`. The rendered dashboard map has 94 elements at 9px, 45 at 10px, 11 at 8px. Landing uses `slate-500` (`#64748b`) on `#080d14` in 17 elements, about 4.1:1 by my calculation, under the 4.5:1 AA threshold for small text.
- **Why it feels like AI slop:** Density achieved by shrinking type rather than cutting content.
- **Severity:** P1 (a11y)
- **Action:** 12px floor for functional text, 14px or more for reading text. Fix low-contrast gray after the cuts, since most of it disappears with them.

**C7. Footer self-reference and filler**
- **Element / location:** [OnboardFooter L77](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardFooter.tsx#L77): `Anti-AI-Slop • Glassmorphism 2.0 • 60 FPS Canvas`. [L67-72](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardFooter.tsx#L67-L72): a `14vw` ghost "PREHUB". L61-62: `Milestone M2 - Final Defense`.
- **Problem:** The site announces its own style. The ghost wordmark exists to fill space. The milestone line is internal project status shown to visitors.
- **Severity:** P1 (credibility), P3 (wordmark)
- **Action:** Delete all three. A footer needs a name, a contact, and the legal line.

![Footer](C:/Users/VICTUS/.gemini/antigravity/brain/ab41683f-e22c-4dbd-ae17-0ecac0a99c96/home-desktop-08.png)

### D. Design-system drift

**D1. Three token systems, no adoption**
- **Element / location:** [tailwind.config.ts L14-59](file:///d:/College/Pidi.id/frontend/tailwind.config.ts#L14-L59) defines 50 Material-3-style colors. [globals.css L7-17](file:///d:/College/Pidi.id/frontend/app/globals.css#L7-L17) defines a second set of `--color-*` variables.
- **Problem:** Usage of the M3 tokens: **0**. Usage of the CSS variables: **1**. Instead: 96 literal `bg-[#080d14]`/`[#0c0e12]`, 240 hex literals total, 155 `bg-slate-*`, 627 `text-slate-*`. The tokens do not even match the real surfaces (`surface` is `#111317`; pages use `#080d14` and `#0c0e12`). No `DESIGN.md` or `MASTER.md` exists.
- **Severity:** P1
- **Action:** Pick one set. Delete the other two. Write a short `DESIGN.md` from what survives (`/impeccable document`).

**D2. Declared fonts are not the rendered fonts**
- **Element / location:** [globals.css L1-2](file:///d:/College/Pidi.id/frontend/app/globals.css#L1-L2) imports Inter and Space Grotesk. [layout.tsx L23](file:///d:/College/Pidi.id/frontend/app/layout.tsx#L23) loads a Material Symbols stylesheet. `app/fonts/` holds Geist files.
- **Problem:** On the landing page, computed `font-family` is `ui-sans-serif` or `ui-monospace` on **100%** of elements. The body's `font-sans` utility resolves to Tailwind's default stack, not Inter. Space Grotesk (`font-headline`) is used only in the dashboard (34 places). Material Symbols has 0 uses, and Geist is not referenced. So three font payloads are loaded, two render-blocking via `@import`, and none shows on the page that most needs strong typography. The landing headline is the system font at weight 900.
- **Severity:** P1
- **Action:** Choose one display face and one text face, load them with `next/font`, delete the other three. Then set a real scale (landing currently uses 13 distinct sizes).

**D3. Radius scale is internally contradictory**
- **Element / location:** [tailwind.config.ts L66-71](file:///d:/College/Pidi.id/frontend/tailwind.config.ts#L66-L71).
- **Problem:** The config remaps `rounded-full` to 12px, `xl` to 8px, `lg` to 4px, but leaves `2xl` (16px) and `3xl` (24px) at defaults. Result: the 90 `rounded-full` "pills" render as 12px rounded rectangles, and the landing renders six radii (4, 6, 8, 12, 16, 24). Sibling headline chips differ: 24px in the hero, 12px in section headings.
- **Severity:** P2
- **Action:** Define a three-step radius scale and use it everywhere. Do not override `full`.

**D4. Panel recipe reimplemented**
- **Element / location:** [GlassPanel.tsx](file:///d:/College/Pidi.id/frontend/components/ui/GlassPanel.tsx) (`bg-slate-900/60 blur-lg rounded-2xl shadow-2xl ring-1`) vs literal recipes elsewhere (`bg-[#0c0e12]/80..95`, blur-md/xl/2xl, rounded-xl/2xl/3xl). Border alpha varies: white/10, /15, /20, /25, /30 on the landing alone.
- **Severity:** P2
- **Action:** After removing most panels, keep one surface style and one hairline value.

**D5. Landing and dashboard are two different products**
- **Element / location:** landing vs dashboard tabs.
- **Problem:** Primary buttons are gradient with glow on the landing and flat `cyan-500` in the dashboard. Each dashboard tab uses a different heading style: `ARCHIPELAGO_HEATMAP` (screaming snake), `Evaluasi Empiris & Tolok Ukur Validasi` (sentence case), `WEEKLY CABINET BRIEFING DOCUMENT` (spaced caps). Content gutters differ (24px on most tabs, 80px on Evaluation at 1440). The Evaluation tab sets body copy in monospace while Reports uses sans.
- **Severity:** P2
- **Action:** One heading style and one gutter for all tabs.

**D6. Dead and duplicate implementation details**
- **Element / location:** `no-scrollbar` and `custom-scrollbar` are used 9 times but defined nowhere in CSS. `id="sequence"` appears on both [OnboardingHome L19](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardingHome.tsx#L19) and [ImageSequenceCanvas L283](file:///d:/College/Pidi.id/frontend/components/onboard/ImageSequenceCanvas.tsx#L283) (invalid duplicate id). Landing has 10 `<img>` with 10 `alt`, but the dashboard has 7 `aria-label` and 1 `role` across about 13k lines of interactive UI.
- **Severity:** P3
- **Action:** Remove dead classes, de-duplicate the id, and add labels to icon-only buttons.

### E. Layout

**E1. Every landing section is the same skeleton**
- **Element / location:** features, demo, telemetry sections.
- **Problem:** Mono eyebrow pill, then centered 5xl-6xl black headline with highlighted word, then centered muted subtitle, then a symmetric 3-column card grid, then `py-24 border-t`. Features and telemetry are both `gap-6` 3x2 grids of near-identical cards. The page is 7,870px tall on desktop and 11,359px on mobile.
- **Why it feels like AI slop:** The structure is interchangeable with any product. You could swap the logo and copy and nothing would break.
- **Severity:** P1
- **Action:** Cut from five sections to three that each do a different job. Vary alignment (left-aligned text with a wide image is more editorial than centered everything).

**E2. Filler elements**
- **Element / location:** ambient halos, vignettes, ghost footer wordmark, hero stats strip, empty panels. Reports shows about 300px of blank space inside the briefing box; the Simulation chat has about 400px empty.
- **Severity:** P3
- **Action:** Remove the decorative fillers. For empty panels, size to content.

**E3. Mobile**
- **Element / location:** [OnboardNav L35](file:///d:/College/Pidi.id/frontend/components/onboard/OnboardNav.tsx#L35): `hidden md:flex`.
- **Problem:** Nav links vanish below 768px with no replacement. The CTA wraps to two lines at 390px, the hero status pill wraps, the 300vh sticky section stays, and the chapter rail is hidden below `lg`.
- **Severity:** P2
- **Action:** Short nav that fits, or a simple menu. Shorter sequence on small screens.

### F. AI-genericness (second order)

**F1. Each choice is defensible, the sum is a template**
- **Problem:** Dark navy, neon gradient, glass cards, mono eyebrows, highlighted headline, stats strip, icon grids, tech chips, ghost wordmark. Individually each has a rationale. Together they pass the "swap the logo" test, which is the failure.
- **What is actually specific to this product:** North Sumatra, Belawan Port, shallots, cooking oil, BMKG, ANTARA. Those are currently set at 11px in mono or in dashboard chips.
- **Severity:** P1 (strategic)
- **Action:** Make the causal chain the landing page. Large, readable, in order, in Indonesian.

**F2. The biggest visual asset contains garbled AI text**
- **Element / location:** all 121 sequence frames and the hero video.
- **Problem:** Verified in captured frames: `LOOSTIC ADVISRIES`, `AIDTOY ADLERY`, `ACTUBBO EITNE`, `ROITPOONE`, `BOETRIC ADVISBICS`, `780 BOBE`. The most prominent imagery on the page is the most recognizably AI-generated. Payload: about 4MB of frames plus a 4.8MB video, all preloaded.
- **Severity:** P1
- **Action:** Either replace with real product capture, or crop/mask text regions and show fewer frames. If the cinematic idea stays, make it earn its weight with real map data.

![Sequence chapter 1](C:/Users/VICTUS/.gemini/antigravity/brain/ab41683f-e22c-4dbd-ae17-0ecac0a99c96/home-desktop-01.png)

**F3. The repo rules push toward the problem**
- **Element / location:** `.agents/AGENTS.md` mandates "Glassmorphism konsisten (`backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`)" and reading a `MASTER.md` that does not exist.
- **Problem:** That rule produced the glass-everything pattern, and it conflicts with your stated direction (restrained, editorial, not a card collection). Any future automated refactor will reintroduce it.
- **Severity:** P2
- **Action:** Reconcile the rule with the intended direction before any redesign pass.

---

## 2. The most repeated AI patterns

Ranked by how often they appear, with counts from source and render.

1. **Mono uppercase micro-labels.** 387 `font-mono`, 137 `uppercase`, 104 wide tracking, 349 sub-12px sizes. About 36% of landing text and 44% of dashboard-map text is monospace.
2. **Glass panel with white hairline.** 104 `backdrop-blur`, 288 `border-white/N`, 96 literal panel backgrounds.
3. **Pill / eyebrow / badge.** 90 `rounded-full`, one eyebrow above every heading, six feature badges, six footer chips.
4. **Neon glow and gradient.** 26 arbitrary neon shadows, 104 large shadows, 13 gradients, 9 text drop-shadows, 3 giant blur halos.
5. **Icon + title + description + footer metric card.** Features x6, data sources x6, demo stats x3, evaluation KPIs x5, report KPIs x3.
6. **Fake liveness.** 27 pulses plus pings and bounces, static "HEALTHY" and "CONNECTED" labels, a "SYSTEM ONLINE" dot.
7. **Highlighted-word headline chips.** 4 of 4 headings.
8. **Four-hue accent coding.** Cyan, emerald, amber, purple assigned for variety.
9. **Invented stat strip.** Hero metrics, sequence metrics, analytics header metrics.
10. **Same CTA repeated at every section end.** Five links to one destination.

## 3. The biggest design-system inconsistencies

1. **Three color systems, zero adoption.** 50 M3 tokens (0 used), CSS variables (1 used), raw Tailwind and hex everywhere. Tokens do not match the actual surface colors.
2. **Fonts declared are not fonts rendered.** Inter and Space Grotesk loaded but the landing renders system fonts. Material Symbols and Geist are loaded or bundled with no use.
3. **Radius scale contradicts itself.** `rounded-full` is 12px while `2xl` and `3xl` are 16 and 24px. Six radii on the landing.
4. **Panel recipe exists in four forms.** `GlassPanel` plus several literal variants, with five different border alphas.
5. **Section headings and gutters differ per dashboard tab.** Screaming snake, sentence case, spaced caps. 24px vs 80px page margins.
6. **Language drift.** Indonesian and English in the same row, including adjacent buttons.
7. **Button language splits between surfaces.** Glowing gradient on the landing, flat cyan in the dashboard.
8. **No design contract file.** The one the rules point to does not exist.

## 4. What should be removed entirely

- The footer line `Anti-AI-Slop • Glassmorphism 2.0 • 60 FPS Canvas`, the `Milestone M2 - Final Defense` line, and the giant ghost "PREHUB".
- Highlighted-word chips in all four headings, and the underline-plus-glow treatment on the hero subtitle.
- All neon glows, text drop-shadows, ambient blur halos, and the glowing progress bar.
- The hero status pill, nav `4D` pill, nav `SYSTEM ONLINE`, and every section eyebrow pill.
- The hero four-number stats strip, unless one number is real and sourced.
- Sequence chrome: frame counter, "Scroll Locked" pill, bouncing "Keep Scrolling", top progress bar, duplicated phase numbering.
- The fake window chrome, `LIVE STAGING` badge, and caption on the demo image. Replace the Unsplash photos with real captures, or drop the section.
- Feature-card eyebrows, colored badges, footer metrics, chevrons, and the sticky hover-"active" state. One of the features section or demo section should go, since they restate the same three capabilities.
- Data-source cards' fake status text and "Frequency" rows.
- Footer tech-stack chips and the duplicated "Quick Routes".
- Four of the five `/dashboard` CTAs.
- Invented figures that are not computed (`2,419 UNIT/S`, `99.99%`, `142 Fleets`, `94.2%`), and the contradictory false-positive and node counts.
- Pseudo-terminal naming (`BIRD_EYE_CHILI`, `ARCHIPELAGO_HEATMAP`).
- Unicode glyph icons (`◄`, `▼`, literal `+` next to an icon).
- Unused Material Symbols stylesheet, unused Geist files, the 50 unused M3 tokens, and the unused CSS variables.
- Decorative pulses and bounces.

## 5. What should explicitly NOT be changed

- **The dashboard's map-first structure.** A full-bleed map with floating controls is the right core for an operations tool. Do not turn it into an editorial page.
- **Monospace for numbers on the dashboard.** Tabular figures are legitimate in Operate surfaces. The problem is monospace on labels and prose.
- **The news feed content and source tags** (ANTARA, BMKG, harga). They are concrete, local, and credible.
- **The Evaluation tab's substance.** Targets vs actuals, the reliability curve, and the solver comparison are real, data-forward content. Keep the data, simplify the wrappers.
- **The causal-chain concept** (port closure, trucks stalled, supply drop, price spike). It is the best content on the site. Promote it.
- **The four-chapter narrative** of the sequence (hazard, causal graph, avoidance, corridor). The structure is a real story. Keep it, lose the HUD.
- **Semantic risk colors** (red critical, amber warning, green clear) on the dashboard and map, where color encodes status.
- **The dark base ground** (`#080d14`) as a starting point, and `lang="id"` on the document.
- **`cursor-pointer` on genuinely interactive elements**, and the existing RBAC role switch, fleet onboarding, and demo flow functionality.
- **Domain vocabulary** (commodity names, port and corridor names). It is the product's actual personality.

---

## Suggested next steps (nothing run)

You can ask me to run these one at a time, all at once, or in any order.

1. **`/impeccable document`** then **`/impeccable extract`**: write a short `DESIGN.md` and collapse the three color systems into one, so later work has a contract.
2. **`/impeccable distill`**: the landing page. Most P1s above are subtraction.
3. **`/impeccable typeset`**: real font loading and a scale, removing the 3 unused font payloads.
4. **`/impeccable layout`**: vary section structure, lead with the causal chain.
5. **`/impeccable harden`**: reduced-motion, mobile nav, contrast, and 12px floor.
6. **`/impeccable polish`**: final pass.

Re-run `/impeccable audit` after fixes to compare.
