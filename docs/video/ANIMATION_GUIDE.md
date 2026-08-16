# ANIMATION GUIDE — Text Overlays PetaNadi Video
## Apple Keynote-Style Minimalist Text Animation System

> This document covers:
> 1. **Tool recommendation** and why
> 2. **6 animation presets** used in this video
> 3. **How to set up each preset** in DaVinci Resolve and CapCut Pro
> 4. **Animation legend** for reading the script's `[ANIM]` tags

---

## TOOL RECOMMENDATION

### Primary: DaVinci Resolve 19 (Free)
**Use this if you want full control.** It's what professional colorists and editors use. Free version has everything you need for text animation.

> [!TIP]
> Download at: https://www.blackmagicdesign.com/products/davinciresolve

**Why Resolve over After Effects:**
- Free (no subscription)
- Fusion compositor built-in = full keyframe control
- Timeline-based = easy to swap demo clips later
- Saves .drp project files = your edit is always re-openable and non-destructive

**Why Resolve over CapCut:**
- CapCut's "Animate" presets are close but not precise — timing can't be set to exact milliseconds
- Resolve's Text+ gives you frame-accurate animation with custom easing curves
- The Apple Keynote feel requires **ease-out** curves specifically — CapCut uses linear or generic ease

### Secondary: CapCut Pro
**Use this if you want speed over precision.** Good enough for a hackathon deadline.

The closest CapCut animations to each preset are documented below.

---

## WHAT "APPLE KEYNOTE STYLE" MEANS (TECHNICALLY)

Apple Keynote text animations have 5 consistent principles:

| Principle | Value |
|---|---|
| **Movement direction** | Always upward (translateY: +15px → 0) — never sideways unless intentional |
| **Easing curve** | Always **ease-out**: fast start, slows to a stop — never bounce, never linear |
| **Duration** | Short: 0.25–0.45s for entrance, 0.2s for exit |
| **Stagger** | Multi-line reveals: each line delayed 0.15–0.20s after the previous |
| **Exit** | Fade only (opacity 1 → 0, 0.2s) — never animate out with movement |

The math that makes it feel premium:
- **Cubic bezier**: `(0.0, 0.0, 0.2, 1.0)` — this is Google Material's "Fast Out Slow In"
- **Or simpler**: just "Ease Out" in any editor — it's the same principle

---

## 6 ANIMATION PRESETS

### PRESET A: FADE-IN-RISE
> *The core Apple Keynote entrance. Used for most body copy.*

```
Opacity:   0% → 100%  |  Duration: 0.35s  |  Ease Out
Y-offset: +15px → 0px |  Duration: 0.35s  |  Ease Out
Start: simultaneously
```

**CapCut equivalent:** Text → Animate → In → "Slide Up (Soft)" — set duration to 0.3s  
**DaVinci Resolve:** Text+ node → Modifiers → Animate Opacity (0→1, 8 frames) + Animate Center Y (-15px→0, 8 frames) → Right-click keyframe → Set Ease Out

---

### PRESET B: CASCADE
> *Multi-line list where each line enters separately. Classic keynote reveal.*

```
Same as FADE-IN-RISE, but applied line-by-line:
  Line 1: starts at 0.0s
  Line 2: starts at 0.18s
  Line 3: starts at 0.36s
  Line 4: starts at 0.54s
  (add 0.18s per additional line)
```

**CapCut:** Add each line as **separate text layer** on the timeline. Offset start times by ~5 frames (0.18s at 30fps). Apply Slide Up (Soft) to each.  
**DaVinci Resolve:** Use separate Text+ nodes per line, stagger their start frames by 5 frames. Same opacity + Y animation per node.

---

### PRESET C: IMPACT-POP
> *For big numbers and key statistics. Slight scale punch on entrance.*

```
Opacity:  0% → 100%    |  Duration: 0.25s  |  Ease Out
Scale:    92% → 100%   |  Duration: 0.25s  |  Ease Out
Y-offset: +8px → 0px   |  Duration: 0.25s  |  Ease Out
```

**CapCut:** Text → Animate → In → "Scale Up" — set duration to 0.2s  
**DaVinci Resolve:** Text+ → Animate Size (0.92→1.0) + Opacity (0→1) + Center Y (-8→0), all 6 frames, Ease Out

---

### PRESET D: TYPEWRITER
> *Character-by-character reveal. Used for data feeds and code-like lists.*

```
Reveals one character every 35–45ms
Total duration depends on string length:
  10 chars = ~0.4s
  20 chars = ~0.8s
  30 chars = ~1.2s
Add blinking cursor (|) at the end, blink 3× then disappear
```

**CapCut:** Text → Animate → In → "Typing" — adjust speed to match desired timing  
**DaVinci Resolve:** Fusion tab → Text node → Use "Write On" modifier → set start/end frame range. For cursor: add a "|" character as separate Text+ with blinking opacity keyframes (1→0→1→0→1→0, every 6 frames)

---

### PRESET E: WIPE-REVEAL
> *Horizontal left-to-right reveal with a gradient mask. Used for section title cards.*

```
A gradient mask (black-to-transparent) moves from left to right
Duration: 0.5s  |  Ease In-Out
The text is always fully formed — only the mask moves
```

**CapCut:** Text → Animate → In → "Slide In (Left)" at 0.5s  
**DaVinci Resolve:** Fusion tab → Merge node with a Gradient mask animated from X=0 to X=1 over 12 frames

---

### PRESET F: FADE-ONLY
> *Minimum-impact entrance. Source citations, subtitles, supporting notes.*

```
Opacity: 0% → 100%  |  Duration: 0.4s  |  Ease In-Out (symmetric)
No movement, no scale
```

**CapCut:** Text → Animate → In → "Fade" — set duration to 0.4s  
**DaVinci Resolve:** Text+ → Animate Opacity (0→1, 10 frames) → Ease In-Out on both keyframes

---

## EXIT ANIMATIONS (ALL PRESETS)

**Rule: exits are always Fade-Only, 0.2s, no movement.**

Exception: Section title cards (WIPE-REVEAL) — these can exit with a fade at 0.3s.

Never animate text out with movement — it draws attention away from the next visual.

---

## FONT SPECIFICATIONS

| Use Case | Font | Weight | Size (1080p) | Color |
|---|---|---|---|---|
| Main headline | Inter or DM Sans | 700 Bold | 72–80px | #FFFFFF |
| Sub-headline | Inter or DM Sans | 600 SemiBold | 48–56px | #FFFFFF |
| Body overlay | Inter or DM Sans | 400 Regular | 36–40px | #FFFFFF at 90% opacity |
| Data stat (big) | Inter | 800 ExtraBold | 96–120px | #FFFFFF |
| Accent / highlight | Inter | 600 SemiBold | 36px | #2E7D32 (PetaNadi green) |
| Source citation | Inter | 400 Italic | 24px | #FFFFFF at 60% opacity |
| Callout bubble | Inter | 500 Medium | 28px | #FFFFFF, background rgba(0,0,0,0.6), border-left 3px #2E7D32 |

> [!IMPORTANT]
> Download Inter: https://fonts.google.com/specimen/Inter  
> Install before opening your editing project. If Inter is not available, use DM Sans as fallback.

---

## POSITIONING SYSTEM (1920×1080)

```
┌─────────────────────────────────────────────────────────┐
│  [TOP-LEFT: location stamp]    [TOP-RIGHT: data feed]   │
│                                                         │
│                  [CENTER: headline]                     │
│                                                         │
│                                                         │
│  [BOTTOM-LEFT: source cite]  [BOTTOM-RIGHT: —]         │
│  [BOTTOM-CENTER: subtitle / WHO-WHAT frame]             │
└─────────────────────────────────────────────────────────┘
```

**Safe zone margins:** 80px from all edges  
**Callout bubbles:** anchored to the UI element they annotate — left or right depending on available space

---

## HOW TO READ THE SCRIPT'S `[ANIM]` TAGS

In `VIDEO_SCRIPT_FULL.md`, every `[TEXT]` block now has an `[ANIM]` tag:

```
[ANIM: B-CASCADE | stagger 0.18s | position: bottom-center | hold 2.5s | exit: FADE 0.2s]
```

Format:
```
[ANIM: <PRESET> | <parameters> | position: <location> | hold <duration> | exit: <exit type>]
```

- **PRESET**: A through F (see above)
- **stagger**: only for CASCADE — delay between each line
- **position**: where on screen
- **hold**: how long text stays visible before exit begins
- **exit**: always FADE unless noted

---

## SECTION-BY-SECTION IMPLEMENTATION NOTES

### Section 1 (Hook, 0:00–0:15)
- Shot 1A: Location stamp — subtle, don't compete with visual. FADE-ONLY, center-top, very small
- Shot 1B: Data stats — CASCADE from bottom-left. Green accent on numbers.
- Shot 1C: "Longsor. Cuaca Ekstrem. Satu Jalur." — each word enters separately with IMPACT-POP and wider spacing between them (letterpress style)

### Section 2 (Problem, 0:15–0:35)
- Loss data list — CASCADE, red-tinted (#CC3333), data numbers in white bold
- Source citation — FADE-ONLY, bottom-left, 60% opacity
- Quote block — FADE-IN-RISE, left-aligned with left border bar in #2E7D32

### Section 3 (Solution, 0:35–1:05)
- "PetaNadi" wordmark — WIPE-REVEAL left to right (this is the premium moment)
- WHO/WHAT/OUTCOME list — CASCADE with 0.20s stagger (slightly slower than normal = more weight)
- Data feed checklist — TYPEWRITER, one item at a time with 0.4s between items
- Agent grid (3C) — CASCADE in a 2×3 grid, row by row (row 1 at 0s, row 2 at 0.3s, row 3 at 0.6s)

### Section 4 (Demo Intro, 1:05–1:15)
- "DEMO" title — WIPE-REVEAL
- Scenario text — FADE-IN-RISE, 0.3s after DEMO title

### Section 5 (Demo, 1:15–2:52)
- Callout bubbles — DATA POP (IMPACT-POP variant), each bubble appears as the VO mentions it
- Early warning header — IMPACT-POP, center, amber color
- Evidence scores — TYPEWRITER (numbers counting up)
- Options table — CASCADE row by row, 0.25s stagger

### Section 5.5 (ROI, 2:52–2:58)
- Main number — IMPACT-POP, largest text in the video (96–120px)
- ROI line — CASCADE after number, 0.5s delay
- Source citation — FADE-ONLY, 1.0s after ROI line

### Section 6 (Closing, 2:58–3:00)
- Logo + wordmark — FADE-ONLY (logo is pre-animated in Flow generation)
- Team name — FADE-IN-RISE, 0.5s after logo

---

## DAVINCI RESOLVE QUICK SETUP (Step-by-Step)

1. **Open Resolve** → New Project → "PetaNadi_Video"
2. **Import all clips**: File → Import Media → select all AI-generated clips + screen recording
3. **Set timeline**: 1920×1080, 24fps (or 30fps — match your camera/Flow output)
4. **Add text**: Effects Library → Titles → Text+ → drag to timeline above video track
5. **Animate opacity**: In Text+ inspector → Modifiers tab → Add Modifier: Custom → set Opacity keyframes
6. **Set easing**: Right-click on keyframe in timeline → Ease Out
7. **Font**: Click on Text+ → Inspector → Font → "Inter" → Size → Weight
8. **For CASCADE**: duplicate the Text+ node → change content → offset start by 5 frames → repeat

---

## CAPCUT PRO QUICK SETUP

1. **New project** → 1080p → Import all clips
2. **Add text**: Text → Default text → type content
3. **Animate**: Select text layer → Animate → In → choose preset (see mapping above)
4. **For CASCADE**: duplicate text layer → change content → drag clip slightly right in timeline (5-6 frames)
5. **Font**: Text → Font → search "Inter" (available in CapCut's built-in library)
6. **Color**: Text → Color → enter hex #2E7D32 for green accents
7. **Position**: drag text box on canvas or use X/Y coordinate input

> [!NOTE]
> CapCut Pro tip: Use "Auto Captions" for subtitles — it saves significant time vs manual entry. Then style the auto-captions to match the spec above.

---

## HYPERFRAMES 60 FPS HTML/GSAP PRESENTATION ENGINE

For Section 5.5 (Impact & ROI) and Section 6 (Team & CTA), we built an automated, web-native 60 FPS motion graphics composition using **HyperFrames** (`heygen-com/hyperframes`) located at:
📁 [`docs/video/presentation/`](file:///d:/College/Pidi.id/docs/video/presentation/)

### Key Motion Principles (Higgsfield x Claude Style)
1. **Continuous 3D Camera Drift**: Every shot maintains a subtle, continuous 3D camera drift throughout its full duration (`scale: 0.96 -> 1.03`, `rotateX/rotateY` spatial perspective) to eliminate static pauses.
2. **Harmonized Depth Entrances**: Cards enter in 3D coordinate space (`z: -50px -> 0`, `scale: 0.94 -> 1.0`) with unified `power3.out` easing rather than harsh lateral snaps.
3. **Seamless Overlapping Cross-Fades**: Outgoing slides fade/glide out (`6.4s - 7.1s`) while incoming slides simultaneously glide in (`6.5s - 7.2s`), guaranteeing zero black gaps or frame freezes.

### Execution Commands
- **Live Interactive Preview**: `npx hyperframes preview`
- **Render 60 FPS MP4 Video**: `npx hyperframes render -o output/petanadi_presentation_60fps.mp4 --fps 60`

