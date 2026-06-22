# Quote Duel Video Pipeline — Implementation Spec

Status: SPEC (ready to build)
Author: drafted in /office-hours (leb-news-analysis), 2026-06-19
Target repo: video-animations
Render approach: **Path A — dedicated Remotion composition** (decided)

## Goal

Turn the Quote Duel format (currently HTML-only) into a **video production path**:
a no-intro, audio-narrated, vertical video that drops straight into outlet-vs-outlet
clashes, then **atomizes into per-duel standalone shorts** for max algorithmic reach on
IG Reels + YT Shorts + TikTok.

Deliverables per day:
- `quote-duel-full.mp4` — the top-3 "main" duels, **≤ 60s**, no intro. The "full" Reel.
- `duel-01.mp4 … duel-NN.mp4` — each duel as its own standalone short (no intro/outro).
- Per-clip social captions, packaged for upload.

This is NOT a new format. It is the missing **video + audio + split** path for the
existing Quote Duel (`quote-duel.json`, `build-quote-duel-html.mjs`).

## Why this matters (context)

Audience growth from a ~0-follower account comes from short, atomic hooks on
Reels/Shorts/TikTok — not 5-minute briefings or ephemeral Stories. The clash
("صحيفة X قالت كذا — والأخبار قالت العكس") is the strongest share trigger we have.
Each duel = one hook = one post.

## Existing machinery to reuse (do NOT reinvent)

```
briefing.json ──► render-briefing-video.mjs ──► Remotion "ProductionBriefing" ──► full.mp4
                                                  (src/ProductionBriefingVideo.jsx,
                                                   registered in src/Root.jsx)
              ──► split-briefing-video.mjs ─────► ffmpeg cut by scene timestamps
audio/generate-outlet-audio.mjs ──► per-scene WAV from briefing.json
sync-outlet-audio-timing.mjs ─────► writes WAV durations back into timing
```

Mirror these. The Quote Duel versions are near-clones with the **intro removed from the
atomic clips** and a **side-by-side duel layout** instead of the single-outlet layout.

## Target data flow

```
quote-duel.json  (intro + duels[] + outro; + NEW: per-duel narration + rank + duration)
     │
     │  [1] audio: TTS each duel narration → audio/duel-XX.wav (+ measured durations)
     ▼
quote-duel.json  (now carries audio.src + durationSeconds per duel)
     │
     │  [2] render: QuoteDuel Remotion comp (NO intro; optional 1.5s cold-open hook)
     ▼
radar-beirut-quote-duel.mp4   (full timeline, all duels)
     │
     │  [3] split: ffmpeg
     ├──► quote-duel-full.mp4   (concat of the top-3 ranked duels, ≤60s)
     └──► duel-01.mp4 … duel-NN.mp4   (each duel standalone, no intro/outro)
                 │
                 │  [4] captions per clip  → [5] dashboard step → social-zip
                 ▼
        IG Reels + YT Shorts + TikTok
```

## [0] Data model — `quote-duel.json` schema additions

Current shape (per `briefings/2026-06-19/output/quote-duel.json`):
`meta`, `intro{eyebrow,title,subtitle,durationSeconds,textRevealSeconds}`,
`scenes[]` (each: `id`, `eventLabel`, `contrastLabel`, `summary`, `durationSeconds`,
`left{outlet,logoFile,stance,quote}`, `right{...}`), `outro{title,body,durationSeconds}`.

Add per duel (in `scenes[]`):
```jsonc
{
  "id": "duel-1",
  "rank": 1,                 // NEW: 1..N. ranks 1-3 = "main" (go in quote-duel-full.mp4)
  "main": true,              // NEW (derived from rank<=3; explicit ok too)
  "narration": "…",          // NEW: spoken line for this duel (defaults to `summary` if absent)
  "audio": {                 // NEW: filled in by step [1]
    "src": "audio/duel-01.wav",
    "durationSeconds": 9.2
  },
  "durationSeconds": 9,      // becomes audio-driven after step [1] (audio + small buffer)
  "eventLabel": "…", "contrastLabel": "…", "summary": "…",
  "left": {...}, "right": {...}
}
```
Optional top-level `coldOpen` (replaces `intro` for video): a ≤1.5s on-screen hook line,
no audio, used only to give the first frame a verbal/visual punch. `intro` stays for the
HTML build; the video path ignores `intro` and uses `coldOpen` if present.

Rule: **the video path never renders `intro`.** Atomic clips never include `coldOpen`
either (each clip must self-justify in its own first ~1.5s via the duel layout).

## [1] Audio — per-duel narration

New script `scripts/generate-quote-duel-audio.mjs` (clone of `audio/generate-outlet-audio.mjs`):
- Reads `output/quote-duel.json`, iterates `scenes[]`.
- For each duel, synthesize `narration` (fallback to `summary`) via the same Hamsa TTS
  path the outlet audio uses. Write `output/audio/duel-XX.wav`.
- Write back `scene.audio = { src, durationSeconds }` and set
  `scene.durationSeconds = audioDuration + BUFFER` (use the existing 0.5s buffer pattern
  from `sync-outlet-audio-timing.mjs`).
- npm: `"briefing:duel:audio": "node ./scripts/generate-quote-duel-audio.mjs"`

Edge: a duel narration should be ~6–12s. If `narration` missing AND `summary` missing,
skip the duel with a warning (don't crash the batch).

## [2] Remotion composition — `QuoteDuel`

New file `src/QuoteDuelVideo.jsx` + register in `src/Root.jsx`.

Registration (mirror ProductionBriefing):
```jsx
<Composition
  id="QuoteDuel"
  component={QuoteDuelVideo}
  fps={30}
  width={405}            // vertical, matches the existing stage
  height={720}
  defaultProps={{ duel: duelData }}
  calculateMetadata={({ props }) => ({
    durationInFrames: calculateQuoteDuelDurationInFrames(props.duel ?? duelData, 30),
  })}
/>
```
`calculateQuoteDuelDurationInFrames(duel, fps)` = `fps * (coldOpenSeconds + Σ scene.durationSeconds)`.
**No intro, no outro in the duration sum** (outro optional; default off for shorts).

Component requirements:
- Port the visual language from `build-quote-duel-html.mjs` / `radar-beirut-quote-duel.html`
  (left card vs right card, outlet logo, stance chip, quote, `eventLabel` top,
  `contrastLabel` as the "vs" question). Reuse `palette`/easing patterns from
  `ProductionBriefingVideo.jsx`.
- One `<Sequence>` per duel, length = `scene.durationSeconds`, with `<Audio src={staticFile(scene.audio.src)} />`.
- **RTL Arabic**: `direction: rtl`, Dubai fonts (already copied to remotion-assets by the
  render script — keep that asset-copy step).
- **Adjustable text placement** = a `layout` prop block per duel (or sensible defaults):
  ```jsonc
  "layout": {
    "eventLabelY": 60, "quoteFontPx": 34, "quoteMaxLines": 3,
    "leftAlign": "start", "rightAlign": "end", "logoScale": 1.0
  }
  ```
  Read in the component; fall back to defaults when absent. This is the "adjust text
  places" knob you asked for — JSON, not CSS surgery.

## [3] Render script — `scripts/render-quote-duel-video.mjs`

Clone `render-briefing-video.mjs`, changing:
- Data source: `output/quote-duel.json` (not briefing.json).
- Composition id: `QuoteDuel`.
- Props: `{ duel: <quote-duel with resolved audio/logo srcs>, assets: {...}, layout }`.
- Reuse `copyAsset` / `getLogoSrc` / `resolveAudioSrc` verbatim (logos live in
  `public/outlet-logos/`, audio in `output/audio/`).
- Output: `output/radar-beirut-quote-duel.mp4`. Keep `--resolution/--resolutions`,
  `--concurrency`, Linux `--gl angle-egl --chrome-mode chrome-for-testing` defaults.
- npm: `"briefing:duel:render": "node ./scripts/render-quote-duel-video.mjs"`

## [4] Split script — `scripts/split-quote-duel-video.mjs`

Clone `split-briefing-video.mjs`, changing the segment plan:
- **No intro/outro on atomic clips.** Each duel = `[start, start+durationSeconds]`,
  computed by cumulative sum from `coldOpenSeconds` (0 if no coldOpen).
- Emit per-duel files `duel-01.mp4 … duel-NN.mp4`.
- **Also build `quote-duel-full.mp4`**: concat the duels with `rank <= 3` (the "main 3"),
  in rank order, capped at 60s (warn + trim lowest-rank if over). Use ffmpeg concat
  demuxer over the already-cut atomic clips (no re-encode needed → fast, lossless).
- Keep `reencode` default for the atomic cuts (matches briefing splitter), `--mode copy`
  optional.
- Write `manifest.json` with the same shape as the briefing splitter (duelId, rank, main,
  start/duration/end, fileName, outputPath).
- npm: `"briefing:duel:split": "node ./scripts/split-quote-duel-video.mjs"`

## [5] Captions + dashboard wiring

- Extend `scripts/build-social-captions-prompt.mjs` to emit a caption block per duel clip
  (hook line + hashtags) keyed by `duelId`. Each atomic clip needs its own caption since
  it's posted independently.
- Add a dashboard step (next index after current step 16 social-zip; see `dashboard/steps.mjs`)
  "Quote Duel shorts": runs duel:audio → duel:render → duel:split → captions, then folds
  the duel clips into the social-zip / multi-variant split that already exists.

## npm scripts to add (package.json)

```jsonc
"briefing:duel:audio":     "node ./scripts/generate-quote-duel-audio.mjs",
"briefing:duel:render":    "node ./scripts/render-quote-duel-video.mjs",
"briefing:duel:mux:audio": "node ./scripts/mux-quote-duel-audio.mjs",
"briefing:duel:split":     "node ./scripts/split-quote-duel-video.mjs",
"briefing:duel:all":       "npm run briefing:duel:audio -- --folder $F && npm run briefing:duel:render -- --folder $F && npm run briefing:duel:split -- --folder $F"
```
(Match the existing `--folder briefings/YYYY-MM-DD` arg convention via `briefing-helpers.mjs`.)

## [6] Dashboard + server-render integration (parity with briefing steps 6/11–15)

The dashboard already does most of this for free, because `quote-duel.json` is in
`ANALYSIS_FILES` (dashboard/config.mjs) and the whole `briefings/<date>/` folder is
rsynced to the render server in step 11.

What already happens today (no new work):
- **Step 6 "Build first draft outputs"** runs `briefing:build:folder`, which already
  emits `quote-duel.json` + `radar-beirut-quote-duel.html`. So the duel **draft** is
  already buildable + reviewable here (HTML), same as the other three formats.
- **Step 9 "Review HTML outputs"** already opens the quote-duel HTML for eyeballing.
- **Step 11 "Sync briefing folder to render server"** already rsyncs `quote-duel.json`
  and the new per-duel audio (once step [1] writes them into the folder) to
  `${SSH_HOST}:${REMOTE_ROOT}/briefings/<date>/`.

> NOTE on "double-check the full video at step 6": step 6 produces **data + HTML, not an
> MP4**. The visual draft you review at this stage is the HTML (step 9). The actual
> rendered **video** only exists after the render step (server step 12 → mux 13 →
> download 14). For the duel, the equivalent rendered file appears after the duel server
> steps below. If you want a quick local MP4 to eyeball, run `briefing:duel:render`
> locally (no server needed).

What to ADD — server render parity for the duel (mirror steps 12–15). Render server:
`hassan.alhajj@10.0.10.20:2361`, repo `~/projects/simple-app/leb-news-public-artifacts`
(overridable via `RENDER_SERVER_HOST/PORT/ROOT`). The briefing renders **muted on the
server, then muxes WAVs** (Remotion render stays fast/reliable headless; ffmpeg attaches
audio by stream-copy). Do the same for the duel:

1. **`render-quote-duel-video.mjs` must support `--muted`** (pass `--muted` through to the
   Remotion CLI, exactly like `render-briefing-video.mjs`). The `QuoteDuel` comp still
   declares its `<Audio>` sequences; `--muted` just tells Remotion to skip the audio track.
2. **`mux-quote-duel-audio.mjs`** (clone `mux-briefing-audio.mjs`): build one combined
   audio track from the per-duel WAVs at their cumulative offsets, mux onto the muted
   `radar-beirut-quote-duel.mp4` (stream-copy video) → `radar-beirut-quote-duel-final.mp4`.
3. **New dashboard steps** (after step 16, or interleaved as 12b/13b/15b):
   - *Render duel on server (muted)*:
     `ssh … "cd ${REMOTE_ROOT} && git pull origin && npm run briefing:duel:render -- --folder briefings/<date> --muted --log warn"`
   - *Mux duel audio on server*:
     `ssh … "cd ${REMOTE_ROOT} && npm run briefing:duel:mux:audio -- --folder briefings/<date>"`
   - *Download duel finals*:
     `rsync -av -e "ssh -p ${SSH_PORT}" ${SSH_HOST}:${REMOTE_ROOT}/briefings/<date>/output/radar-beirut-quote-duel*-final.mp4 ${out}/`
   - *Split duel locally* (step 15 analog): `briefing:duel:split` on the downloaded final.
   Reuse `sshArgs()` and the rsync pattern verbatim from steps 11/12/14.

Order on the server matches the briefing: **sync (11) → duel render muted → duel mux →
download → split locally**. The duel render can run in the same server session right
after the briefing render (both read from the same synced folder).

Prereq for the server: the render server already runs the briefing render (Remotion +
Chrome-for-testing on Linux via `--gl angle-egl`), so no new server setup — the duel comp
uses the same Remotion install. Just ensure `git pull` brings the new comp + scripts.

## Edge cases to handle

1. **Variable duel count.** N may be 2–6. Full video = top-3 by rank; if N<3, full = all.
2. **No `rank` field.** Default rank = array order; first 3 are "main".
3. **Full video > 60s.** Warn, drop the lowest-ranked main duel until ≤60s.
4. **Missing audio for a duel.** Skip that duel from both full + atomic outputs; warn,
   don't crash (mirror briefing splitter's per-segment failure handling).
5. **RTL + long quotes.** `quoteMaxLines` + ellipsis; verify the longest real quote
   (`"أن تطلب من العدو البقاء في أرضك!"`-length and longer) doesn't overflow at 34px.
6. **Hook readability.** Each atomic clip's `contrastLabel` + both quotes must be on
   screen within ~1.5s (front-load the reveal; don't animate the quote in slowly).
7. **Logo missing.** Fall back to outlet name text (briefing render already warns on
   missing logos — reuse that).

## Acceptance / smoke test

On `briefings/2026-06-19` (4 real duels already in `quote-duel.json`):
1. `npm run briefing:duel:audio  -- --folder briefings/2026-06-19` → 4 WAVs + durations written.
2. `npm run briefing:duel:render -- --folder briefings/2026-06-19` → `radar-beirut-quote-duel.mp4`, no intro, audio audible, RTL correct.
3. `npm run briefing:duel:split  -- --folder briefings/2026-06-19` → `quote-duel-full.mp4` (≤60s, top-3) + `duel-01..04.mp4`.
4. Manually eyeball one atomic clip on a phone: clash legible in first 1.5s, audio synced.

## Build order (smallest shippable increments)

1. Schema + sample: add `rank`/`narration` to `quote-duel.json` (hand-edit 2026-06-19 as fixture).
2. `[2]` `QuoteDuelVideo.jsx` + Root registration — render with **silent** placeholder first
   (prove the layout in `remotion studio src/index.jsx`).
3. `[3]` render script — render the silent video end-to-end.
4. `[1]` audio script — add narration, re-render with sound.
5. `[4]` split script — atomic clips + full top-3.
6. `[5]` captions + dashboard step.

7. `[6]` server parity: add `--muted` to the render script, write `mux-quote-duel-audio.mjs`,
   add the three server dashboard steps (render muted → mux → download) + the local split step.

Steps 1–3 alone produce a postable (silent-or-music) video this week (local render, no
server); 4 adds voice; 5 atomizes; 6–7 industrialize it onto the dashboard + render server.

Note: until step 7 lands you can already render the duel **locally** with
`npm run briefing:duel:render -- --folder briefings/<date>` and split it — the server path
is an optimization for batch/automated runs, not a blocker for posting this week.

## Open questions for the build session

- Narration source: reuse `summary` verbatim, or write a tighter spoken `narration` line
  per duel? (Recommend a dedicated `narration` field — `summary` reads written, not spoken.)
- Cold-open: worth the 1.5s, or start cold on duel-1? (Test both; atomic clips skip it regardless.)
- Music bed: there's an `--ambient` music option in the briefing mux — reuse under duel audio?

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 10 findings, all complementary (0 contradicted the review) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open (resolved into tasks) | 8 issues + 24-path coverage gap, 2 critical regression tests |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** Added 5 findings the review missed (audio-path vs CLAUDE.md, 405x720 half-res registration, skip-renumbering identity, concat-copy fragility, dashboard "free" overclaim); confirmed A2 + C2. All informational; each approved by the user.
- **CROSS-MODEL:** No tension — Codex did not contradict any review finding; it extended them. All Codex points either confirmed a decision or were approved as corrections/scope items.
- **UNRESOLVED:** 0.
- **VERDICT:** ENG CLEARED for the scoped PR (steps 1-5 local pipeline + tests). 11 decisions locked, dashboard/server parity (steps 6-7) deferred to TODOS.md. Ready to implement.

### Decisions locked
1. **Structure:** hybrid — extract `lib/remotion-assets.mjs`, `lib/audio-mux.mjs`, `lib/hamsa-tts.mjs`; clone only divergent pieces.
2. **A1:** single shared `lib/duel-timeline.mjs` (frame-quantized) consumed by comp + mux + split.
3. **A2:** `rank`/`narration` upstream in `quote-duel.json`; audio durations via `timingConfig.quoteDuel.scenes`, re-applied by `build:folder`.
4. **A3:** defer `coldOpen` (timeline param defaults to 0).
5. **C1:** duel uses the shared planner now; briefing backfill → TODO.
6. **C2:** duel audio reuses WAVs by default + `--force` + `--existing-only`; skip-on-missing decided in the timeline.
7. **Tests:** exhaustive lib units + `--dry-run` plan tests + 2 mandatory regression tests + `npm test`.
8. **OV1:** WAVs in `briefings/<date>/audio/` (not `output/audio/`); register comp at 720x1280 with 405x720 internal stage.
9. **OV2:** stable source-ordinal clip filenames + `skipped` flag in manifest.
10. **OV3:** build `quote-duel-full.mp4` by re-encoding the top-3 range from the master.
11. **PR boundary:** ship steps 1-5 locally now; dashboard + server parity (6-7) deferred.

### NOT in scope (this PR)
- Dashboard duel steps + server render/mux/download parity (spec [6]/[7]) — TODO #1; larger multi-product dashboard refactor than the spec implied.
- `package-social-zip.mjs` multi-format generalization (Codex#4) — part of TODO #1.
- Briefing-side dedup backfill (C1) — TODO #2.
- `coldOpen` rendering (A3) — TODO #3.
- Music bed under duel audio — deferred until the plain voice path is stable (Codex#10 default).

### What already exists (reused, not rebuilt)
- `render/split/mux-briefing` scripts + `briefing-helpers.mjs` — extraction sources for the shared libs.
- `generate-outlet-audio.mjs` Hamsa core + voice fallback — extracted to `lib/hamsa-tts.mjs`.
- `build-briefing-folder.mjs` already passes the whole `quote-duel.json` through and has a `timingConfig.quoteDuel` block (intro only) — extended for per-duel durations.
- `build-quote-duel-html.mjs` + `templates/radar-beirut-quote-duel-template.html` — visual reference for the Remotion port.
- `tests/audio-stale-reuse.test.mjs` — `node:test` style to mirror.

### Failure modes (new codepaths)
- Hamsa down → audio step fails: mitigated by reuse-default + `--existing-only` (no API), per-voice fallback. Test: plan-only path.
- Duel missing audio → skipped: timeline drops it, manifest records `skipped:true`, filenames stay source-ordinal (no desync). Test: timeline skip case. **Not silent** (warns).
- Sub-frame offset drift at clip joins → clipped audio: eliminated by single frame-quantized timeline. Test: timeline unit + dry-run split.
- Extraction changes briefing output → silent daily-driver regression: **critical gap if untested** → 2 mandatory regression tests close it.

### Parallelization
- **Lane A (libs, sequential):** T1 duel-timeline → T2 hamsa-tts → T3 audio-mux → T4 remotion-assets → T5 regression tests. Shared `scripts/lib/`.
- **Lane B (depends on A):** T7 audio, T9 comp, T10 render, T11 mux, T12 split — T9 is independent of T7/T10-12 (different module: `src/`), so T9 can run parallel to the script work once T1 lands.
- **Conflict flag:** T7, T10, T11, T12, T15 all edit `package.json` — serialize the npm-script edits or expect trivial merge conflicts.
- **Execution:** Lane A first (libs gate everything). Then T6 schema + T9 comp in parallel with T7/T8 audio+builder; then T10→T11→T12; T13 captions independent; T14 tests after the modules; T16 docs last.

