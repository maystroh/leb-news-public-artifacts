# Quote Duel page: local-first review gates + shorts distribution

**Date:** 2026-06-25
**Status:** Approved design (pre-implementation)
**Scope:** Dashboard only — `dashboard/` server + `dashboard/web/` frontend, plus a new duel social-captions validator script. No change to the Remotion comp or the duel render/mux/split video logic.

## Problem

The Quote Duel dashboard page (`?view=duel`) bundles content build, TTS, and HTML
review into one step (`duel-narration`), pushes the shared hooks to the render
server before anything is verified locally, and has no way to review/edit the
spoken narration per duel before spending Hamsa TTS. Separately, short-form
distribution (the Instagram clips card + phone "server folder" transfer) lives on
the **main** dashboard, where it operates on briefing scene clips — but the duels
are the actual short-form content (Reels / YouTube Shorts / TikTok).

This redesign makes the duel page a clean local-first review sequence
(text → audio → HTML, all verified locally before any server contact) and moves
short-form distribution to where the short-form videos are produced.

## Goals

1. Split the bundled duel-narration step into three reviewable gates with a
   per-duel narration editor between text and audio.
2. Only push to the render server (hooks + folder) after local verification.
3. One shared social-captions step that produces both the briefing/YouTube
   captions and the duel/shorts captions, shown as done on both pages.
4. Move the shorts distribution + phone-transfer panel from the main dashboard to
   the duel page, rewired to the duel video outputs and framed as multi-platform
   (Reels / Shorts / TikTok).

## Non-goals

- No change to `scripts/render-quote-duel-video.mjs`, `mux-quote-duel-audio.mjs`,
  or `split-quote-duel-video.mjs` logic. `split` keeps producing per-duel shorts +
  the top-3 ≤60s reel exactly as today.
- No change to `src/QuoteDuelVideo.jsx` or the duel timeline.
- No change to main-dashboard steps 1–15, or to how step 3 (Codex AFK) fills the
  analysis JSONs. Step 3 remains the source of duel content (clashes + per-duel
  `narration`); this design relies on it but does not modify it.
- Hooks remain static/global; `duel-hooks` (17) logic is unchanged.

## Content source (unchanged, stated for clarity)

Main-dashboard **step 3 (`codex-afk`)** fills `briefings/<date>/quote-duel.json`
with each clash's opposed quotes/outlets **and** the per-duel spoken narration.
The real primary field is **`audioText`** (Codex authors it per clash —
`scripts/lib/briefing-analysis-pack.mjs:123-127`), with `narration` a legacy
fallback. The exact spoken-text precedence already lives in
`scripts/generate-quote-duel-audio.mjs`:

```js
defaultDuelText(scene) = audioText || narration || formatDuelAudioText(scene) || summary
textSource(scene)      = 'audioText' | 'narration' | 'generated-format' | 'summary'
```

The duel page only reviews, edits (as overrides), generates audio for, and renders
that content — it never authors narration from scratch.

---

## Part 1 — Duel page local-first gates

### Step sequence (duel page)

`duel-narration` is removed and replaced by `duel-text`, `duel-audio`,
`duel-html`. `duel-hooks-sync` moves down to sit after local verification. New
`DUEL_STEP_IDS` order (in `dashboard/web/src/duelSteps.js`):

```
duel-hooks            (17) local  — generate + listen to shared hooks (unchanged)
duel-text             (18) local  — build quote-duel.json; review/edit narration; confirm
duel-audio            (19) local  — per-duel Hamsa TTS
duel-html             (20) local  — rebuild + open review HTML (verify audio+visual+hook)
duel-hooks-sync       (21) server — push audio/hooks/ to render server (post-verification)
duel-server-render    (22) server — sync folder + muted render (unchanged)
duel-server-mux       (23) server — attach narration + hook audio (unchanged)
duel-download         (24) local  — rsync finals back (unchanged)
duel-split            (25) local  — per-duel shorts + top-3 reel (unchanged)
```

The duel page must render its cards in `[...DUEL_STEP_IDS, ...SHARED_STEP_IDS]`
order (sort the filtered list by index in that combined array) rather than relying
on server array order, because the shared social step (Part 2) lives at an earlier
index in the server array but must appear at the end of the duel page.

### Step definitions (`dashboard/steps.mjs`)

- **`duel-text` (18):**
  - Action `run`: `briefing:duel:build --folder <folder>` (produces
    `output/quote-duel.json` + the review HTML; pre-audio durations).
  - Action `confirm`: marks narration confirmed (writes the gate marker, below).
  - Artifacts: the quote-duel HTML set, `quote-duel-audio-script.json`,
    `audio/quote-duel-text-overrides.json`.
  - Status: `pending` until `quote-duel.json` exists; otherwise reflects
    confirm/last-run state.
- **`duel-audio` (19):**
  - Action `run`: `briefing:duel:audio --folder <folder>` then
    `briefing:duel:build --folder <folder>` (re-apply audio-driven durations).
  - Action `existing-only`: `briefing:duel:audio --existing-only` + rebuild.
  - Status: `pending` ("Confirm narration first") until the gate marker is set;
    `done` when `audio/quote-duel-manifest.json` exists; `stale` if overrides
    changed after the manifest mtime.
- **`duel-html` (20):**
  - Action `run`: `briefing:duel:build --folder <folder>` (rebuild HTML from the
    current durations). The HTML artifacts are marked `open: true` so the review
    HTML opens for verification.
  - Status: `done` once HTML exists and is newer than the audio manifest; `stale`
    if the manifest changed after the HTML.

> Note: `briefing:duel:build` builds both `quote-duel.json` and the HTML in one
> command. `duel-text` runs it to surface narration; `duel-audio` re-runs it to
> bake audio durations; `duel-html` re-runs it to refresh the HTML for review.
> Re-running is cheap and idempotent.

### Confirm gate (soft)

A soft gate consistent with existing dashboard conventions (advisory status, not a
hard lock). State lives in `output/dashboard-state.json` under a `duel` key:

```json
{ "duel": { "narrationConfirmedAt": "<ISO>" } }
```

- `duel-text`'s `confirm` action calls `POST /api/duel/confirm`, which sets
  `narrationConfirmedAt`.
- Saving an edit via `POST /api/duel/script` clears `narrationConfirmedAt`
  (re-gate after any text change).
- `duel-audio` status reads the marker: `pending` with detail "Confirm narration
  first" when unset. It does not hard-block running.

### Per-duel narration data + API

**Shared text precedence (no reinvention).** Extract `defaultDuelText`,
`formatDuelAudioText`, and `textSource` from `generate-quote-duel-audio.mjs` into a
new shared module `scripts/lib/duel-narration-text.mjs`, and have BOTH the audio
generator and `duelNarrationEntries` import it. This guarantees the editor's shown
"default" matches exactly what TTS will synthesize. Do not recompute
`narration || summary` — that diverges from the real `audioText`-first order.

The override file `audio/quote-duel-text-overrides.json` is **already read** by
`generate-quote-duel-audio.mjs:142` (keys are source-ordinal `duel-N`, e.g.
`duel-1`). This work only adds the **write** side and a reader for the panel — keep
the exact same key format; do not introduce a parallel override format.

Mirror the existing scene-narration machinery in `dashboard/audio.mjs`:

- `duelNarrationEntries(ctx)`: read `output/quote-duel.json` `scenes[]` and merge
  with `audio/quote-duel-text-overrides.json`. One entry per duel:
  `{ duelId, outlets: [a, b], quotes: [a, b], defaultText, defaultSource,
  overrideText, effectiveText, isOverridden }` where `defaultText =
  defaultDuelText(scene)` and `defaultSource = textSource(scene)` from the shared
  module. `duelId` is the source-ordinal `duel-N` (matches clip identity).
- Override read/write reuse the `loadTextOverrides` / `saveTextOverride`
  write-or-delete pattern, keyed by `duel-N`.

Server (`dashboard/server.mjs`):

- `GET /api/duel/script?date=` → `{ entries: duelNarrationEntries(ctx) }`.
- `POST /api/duel/script` `{ date, duelId, text }` → save/clear one override,
  clear `narrationConfirmedAt`, `broadcast(date, {type:'state-changed'})`.
- `POST /api/duel/confirm` `{ date }` → set `duel.narrationConfirmedAt` in
  `dashboard-state.json`, `broadcast(date, {type:'state-changed'})`. This is the
  contract behind `duel-text`'s `confirm` action (there is no generic step-level
  "confirm" action type today; closest prior art is `POST /api/review`).
- Fold entries into `/api/state` as `state.duel.narration` so the panel renders
  without an extra round trip.

### Frontend

- New `dashboard/web/src/DuelNarrationPanel.jsx` (modeled on `AudioPanel.jsx`):
  one row per duel showing outlets + the two clashing quotes for context, an
  editable narration `<textarea>`, Save / Reset-to-default controls, and an
  "edited" badge. Posts to `/api/duel/script`.
- `DuelApp.jsx` passes the panel into the `duel-text` `StepCard` (the way `App.jsx`
  passes `AudioPanel` / `SocialPostingPanel` into their cards), and sorts duel
  cards by `DUEL_STEP_IDS` index.

---

## Part 2 — One shared social-captions step

### Behavior

Main **step 16 (`social-package`)** is extended so its generate action also
produces the duel/shorts captions. The step is then surfaced on both pages; since
step status derives from artifact presence + last run, running it from either page
shows `done` on both.

### Duel captions pipeline

- `briefing:duel:captions` already writes `quote-duel-social-captions-prompt.md`.
- New validator script `scripts/validate-duel-social-captions.mjs` (mirrors
  `scripts/validate-social-captions.mjs`) checks
  `output/quote-duel-social-captions.json` against the duel manifest (one caption
  entry per `duelId`, plus a reel/full caption).
- `social-package` generate action chain (appended after the existing briefing
  chain):
  1. `briefing:duel:captions --folder <folder>` (prompt)
  2. `codex exec ... -` with the duel prompt on stdin → `quote-duel-social-captions.json`
  3. `node ./scripts/validate-duel-social-captions.mjs --folder <folder>`
- Result: two JSONs — `social-captions.json` (briefing/YouTube) and
  `quote-duel-social-captions.json` (duel shorts).

### Surfacing on both pages (new shared-step concept)

The two pages today filter the same `DUEL_STEP_SET` mutually exclusively:
`App.jsx:196` keeps `!DUEL_STEP_SET.has(id)`, `DuelApp.jsx:84` keeps
`DUEL_STEP_SET.has(id)`. Adding `social-package` to `DUEL_STEP_IDS` would
therefore **remove** it from the main page — the opposite of the goal. Introduce a
separate set instead:

- New `SHARED_STEP_IDS = ['social-package']` (+ `SHARED_STEP_SET`) in
  `duelSteps.js`. `social-package` is **not** added to `DUEL_STEP_IDS`.
- `App.jsx` main filter is unchanged (`!DUEL_STEP_SET.has(id)`), so the shared step
  stays on the main page.
- `DuelApp.jsx` duel filter becomes `DUEL_STEP_SET.has(id) || SHARED_STEP_SET.has(id)`,
  and the duel page orders cards by `[...DUEL_STEP_IDS, ...SHARED_STEP_IDS]` index
  so the shared step renders last (after `duel-split`).
- On the duel page the shared step is labeled **"Social captions"** (no
  out-of-order number).
- Status is shared automatically through the artifact-based status function — one
  run shows `done` on both pages.

---

## Part 3 — Move shorts distribution to the duel page

### Main dashboard change

- In `SocialPostingPanel.jsx`, remove the "Instagram story clips" card and the
  phone-transfer block. Main "Post now" keeps **only** the YouTube full-video
  card. `publish-grid` collapses to a single column.

### Duel posting state (server)

- New `duelPostingState(ctx, state)` in `server.mjs` mirroring
  `socialPostingState`, assembling three video tiers from the duel outputs:
  - **Per-duel shorts** — `duel-videos[-<hook>]/duel-NN.mp4`, each paired with its
    `duelId` caption from `quote-duel-social-captions.json`.
  - **Top-3 reel** — `duel-videos[-<hook>]/quote-duel-full.mp4`.
  - **Full (all duels)** — the muxed master
    `radar-beirut-quote-duel-<hook>-final.mp4` from `output/`.
  - Phone-transfer status from `state.phoneTransfer` (duel variant).
- Surface as `state.duelSocial`.

### Phone transfer (server folder)

- Reuse `POST /api/phone/upload-scenes` and `POST /api/phone/delete-folder` with a
  `kind: 'duel'` flag in the body. When `kind==='duel'`, the upload sources MP4s
  from the duel videos dir (per-duel shorts + reel + full) instead of
  `sceneMp4Files(variant.sceneDir)`.
- `phoneRemoteFolder(date)` currently takes only a date and is shared with the
  briefing upload. Give it a `kind` parameter (or add a sibling) so the duel upload
  targets a distinct remote folder and does not collide with the briefing upload
  for the same date. `state.phoneTransfer` likewise needs a duel-scoped key (e.g.
  `state.duelPhoneTransfer`) so the two transfers track independently.
- Cover image: keep including a cover if one exists; otherwise upload videos only.
  (Default; no duel-specific cover is required.)

### Frontend

- New `dashboard/web/src/DuelPostingPanel.jsx`: rendered below the steps in
  `DuelApp.jsx` (the way `App.jsx` renders `SocialPostingPanel`). Sections:
  - **Full (all duels)** — open / copy-path.
  - **Top-3 reel** — open / copy-path / copy-caption.
  - **Per-duel shorts** — list with open / copy-path / copy-caption per short.
  - **Phone transfer** — same controls as the old card, targeting the duel folder.
  - Platform links: **Instagram Reels · YouTube Shorts · TikTok**.
- Reads `state.duelSocial`; posts to the phone endpoints with `kind: 'duel'`.

---

## Data flow summary

```
step 3 (codex-afk) ── quote-duel.json (clashes + audioText) ──┐
                                                              │
duel-text  ── briefing:duel:build ─→ output/quote-duel.json ──┤
   │  GET/POST /api/duel/script ─→ audio/quote-duel-text-overrides.json
   │  confirm ─→ dashboard-state.json { duel.narrationConfirmedAt }
duel-audio ── briefing:duel:audio + build ─→ audio/duel-NN.wav + manifest + durations
duel-html  ── briefing:duel:build ─→ review HTML (open)
duel-hooks-sync ─→ server audio/hooks/
render → mux ─→ radar-beirut-quote-duel-<hook>-final.mp4 (FULL = all duels)
download → split ─→ duel-videos/duel-NN.mp4 + quote-duel-full.mp4 (top-3)
social-package ─→ social-captions.json (YouTube) + quote-duel-social-captions.json (shorts)
DuelPostingPanel ─→ reads state.duelSocial; phone upload (kind:'duel')
```

## Error handling

- Build/audio/render failures surface through the existing runner log + `failed`
  step status.
- `/api/duel/script` and the phone endpoints return JSON `{error}` which the
  panels display inline.
- Editing narration after audio is generated marks `duel-audio`/`duel-html`
  `stale` via mtime comparison (existing pattern).
- The duel captions validator fails the `social-package` run if the duel JSON is
  malformed or missing a `duelId`.

## Testing

- Unit test for `duelNarrationEntries` (override precedence; `narration` →
  `summary` fallback; `isOverridden` flag), alongside
  `tests/duel-audio-plan.test.mjs`.
- Unit test for `validate-duel-social-captions.mjs` (rejects missing/extra
  `duelId`, accepts a well-formed JSON).
- Manual walkthrough: launch dashboard → `?view=duel` → run 18–20 locally and
  verify the HTML plays edited narration → run `social-package` from the main page
  and confirm the duel page shows it done → verify `DuelPostingPanel` lists all
  three tiers with captions → dry-run a phone upload targeting the duel folder.

## Open defaults (baked in unless changed)

- Shared social step labeled "Social captions" on the duel page (no number).
- Phone upload includes a cover image only if one exists; no duel-specific cover.
