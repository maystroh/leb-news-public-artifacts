# Ideological Fault Line Map

## Purpose
This is a second briefing format for the same daily source material.

It must stay separate from `full editorial content`.

`full editorial content` answers:
- what each outlet argued

`Ideological Fault Line Map` answers:
- where each outlet sits on the day's main political axis

## Core Idea
Build the briefing around one visible ideological line for the day.

- Left pole: `سلاح المقاومة`
- Right pole: `سيادة الدولة`

Each outlet appears one by one and lands on that line at its editorial position.
The final synthesis scene shows all outlets placed together at once so the viewer can read the ideological geography immediately.

This should feel like:
- a daily media map
- a tension diagram, not a stack of article cards
- one thesis per day, expressed spatially

## Separation From Existing Solution
Do not replace or mutate `full editorial content`.

Instead, treat this as a parallel mode with its own:
- renderer
- scene structure
- data layer
- editorial compression rules

Recommended future file names:
- `radar-beirut-fault-line-map.html`
- `src/data/fault-line-map.json`

## Editorial Rule
This format is not paragraph-first.

It is axis-first.

For a given briefing day:
1. Identify the dominant political fault line.
2. Name the two poles in Arabic.
3. Place each outlet on a continuous scale.
4. Support the placement with one short rationale and one quote.

The key editorial output is not a full summary block.
It is a justified position.

## Daily Data Shape
Recommended structure:

```json
{
  "meta": {
    "dateLabel": "2026-06-01",
    "mode": "fault-line-map"
  },
  "axis": {
    "id": "hezbollah-arms-vs-state-sovereignty",
    "label": "الخريطة الأيديولوجية لليوم",
    "leftPole": "سلاح المقاومة",
    "rightPole": "سيادة الدولة",
    "leftColor": "#cd7f32",
    "rightColor": "#67bfd8"
  },
  "entries": [
    {
      "outletKey": "alakhbar",
      "outletName": "الأخبار",
      "logoFile": "alakhbar-logo.png",
      "position": 0.08,
      "stanceLabel": "محور المقاومة",
      "headline": "إيران مفتاح الحل",
      "reason": "تضع إيران والمقاومة في موقع الفاعل المنظم للحل السياسي.",
      "quote": "وقف الحرب في لبنان شرط لازم للاتفاق"
    },
    {
      "outletKey": "almodon",
      "outletName": "المدن",
      "logoFile": "almodon-logo.png",
      "position": 0.38,
      "stanceLabel": "نقد مزدوج",
      "headline": "نقد مزدوج",
      "reason": "تدين إسرائيل وحزب الله معاً مع ميل جزئي إلى خطاب الدولة.",
      "quote": "عقيدة الركام"
    },
    {
      "outletKey": "nidaa-al-watan",
      "outletName": "نداء الوطن",
      "logoFile": "nidaalwatan-logo.png",
      "position": 0.92,
      "stanceLabel": "سيادي صدامي",
      "headline": "إسقاط أخلاقي",
      "reason": "تضع الحزب خارج الشرعية الوطنية وتدفع بقوة نحو قطب الدولة.",
      "quote": "إسناد خامنئي"
    }
  ],
  "synthesis": {
    "headline": "الصحافة اتفقت على الحدث واختلفت على شرعيته",
    "summary": "الخلاف اليوم لم يكن على ما جرى فقط، بل على من يملك حق السلاح وحق القرار."
  }
}
```

## Position Scale
Use a normalized scale from `0` to `1`.

- `0.00` = fully aligned with `سلاح المقاومة`
- `0.50` = center / mixed / unstable / double critique
- `1.00` = fully aligned with `سيادة الدولة`

Suggested editorial bands:
- `0.00` to `0.20`: resistance pole
- `0.21` to `0.40`: resistance-leaning
- `0.41` to `0.59`: mixed / contested center
- `0.60` to `0.79`: state-leaning
- `0.80` to `1.00`: sovereignty pole

This keeps the placement legible while still allowing nuance.

## Scene Structure
Recommended sequence:

1. Intro scene
2. Axis reveal scene
3. Outlet drop scenes, one per outlet
4. Full-map synthesis scene
5. Optional closing question scene

### 1. Intro Scene
Keep the current Radar Beirut intro language and timing discipline as a reference, but make the idea clear quickly:
- `الصحافة اليوم`
- `أين وقفت الصحف على خط الانقسام؟`

### 2. Axis Reveal Scene
Reveal the line first with both pole labels visible.

Visual behavior:
- the horizontal line draws on
- the two end labels fade in
- faint center ticks appear
- the day label sits above as a date pill

This scene establishes the grammar before any outlet appears.

### 3. Outlet Drop Scenes
Each outlet gets roughly `2` to `3` seconds.

Per outlet:
- logo chip or compact card enters from above
- marker drops vertically onto the axis
- impact ripple or pulse confirms the landing point
- a short headline and one-line rationale appear briefly

Recommended on-screen payload per outlet:
- outlet logo
- outlet name
- one short stance label
- one short quote or rationale

Avoid restoring the full big editorial card from the other mode.

### 4. Full-Map Synthesis Scene
All outlets remain visible simultaneously.

This is the payoff scene.

Show:
- full axis
- all outlet markers
- clustering and distance between positions
- one synthesis line explaining the day's geometry

This scene should answer:
- who is at each extreme
- who is in the middle
- whether the map is polarized or distributed

### 5. Optional Closing Question
Use only if it adds real value.

Example:
- `هل يتحول الخلاف غداً من توصيف الحدث إلى الصراع على شرعية الدولة نفسها؟`

## Visual Language
The format should feel more diagrammatic than card-based.

Recommended composition:
- centered horizontal axis across the lower-middle third
- large pole labels at both ends
- compact floating outlet markers above the line
- subtle grid / radar ambiance preserved from the current prototype

Keep from the current prototype:
- ambient scan sweep
- radar canvas
- map blips
- brackets
- ring pulses
- date pill discipline

Do not carry over:
- big outlet summary card
- repeated body-summary-quote stack
- scene ticker
- helper notes
- bottom-left Radar Beirut badge

## Marker Design
Each outlet marker can be a compact chip:

- top: logo
- middle: outlet name
- bottom: small stance label

State changes:
- `upcoming`: dim
- `active`: bright, slightly enlarged, with ripple pulse
- `settled`: reduced glow, remains pinned on axis

This lets the map accumulate meaning over time.

## Motion Proposal
The motion should feel precise, like strategic plotting.

Suggested sequence for each marker:
1. marker appears above line with low opacity
2. vertical descent in 350ms to 500ms
3. slight overshoot bounce
4. ring pulse on impact
5. short text fade-in
6. text fade-out while marker remains pinned

For the synthesis scene:
- camera does not need to move
- instead, increase glow on the whole line
- gently brighten both poles
- stagger emphasis on the extreme and center outlets

## Why This Works
This format gives the audience something the current mode does not:

- immediate comparison
- spatial memory
- ideological clustering
- daily repeatability

It is especially strong for Lebanon because the map itself carries meaning.
The viewer is not just hearing who said what.
They are seeing the political field.

## Relationship To Full Editorial Content
The two modes can share the same source briefing but answer different editorial questions.

`full editorial content`:
- preserves paragraph-level meaning
- best when the wording and nuance of each outlet matter

`Ideological Fault Line Map`:
- compresses the day into one comparative visualization
- best when the main story is polarization, clustering, or strategic distance

Recommended rule:
- if the day is about ideological spread, use `fault-line-map`
- if the day is about narrative detail, use `full editorial content`

## Recommended Implementation Path
1. Keep the active full-editorial workflow separate from this mode.
2. Treat old non-intro HTML files in `before_formatting_output/` as references, not active build inputs.
3. Create a separate prototype file or builder path for this mode.
4. Create a separate JSON file for axis metadata and outlet positions.
5. Reuse logo assets and ambient background system.
6. Build the line, ticks, pole labels, and marker-drop animation first.
7. Add the synthesis scene only after single-marker timing feels right.

## Minimal First Prototype
The fastest useful prototype is:

- intro
- axis reveal
- three outlets only
- final combined map

Suggested first trio:
- `الأخبار`
- `المدن`
- `نداء الوطن`

That gives:
- one clear resistance pole marker
- one clear middle/center-left marker
- one clear sovereignty pole marker

## Success Criteria
The concept is working if:
- the viewer understands the axis before reading details
- each outlet feels like a plotted position, not a generic card
- the final scene is readable in under one second
- the map says something new beyond the article summaries
