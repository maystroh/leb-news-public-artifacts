# TODOS

Deferred work captured during reviews. Each item has enough context to pick up cold.

## Quote Duel video pipeline — follow-ups

### 1. Dashboard + server-render parity for the duel (spec steps 6-7)
- **What:** Add duel render-muted / mux / download / split steps to the dashboard; make the
  status model, Post Now panel, phone upload, and stale checks understand a SECOND video
  product; generalize `package-social-zip.mjs` for `duelId`-keyed captions.
- **Why:** Industrializes the duel onto the same automated batch path the briefing uses.
- **Current state:** Local pipeline (`briefing:duel:audio|render|mux|split` + captions) ships
  in the first PR. Dashboard steps 12-16 are hardcoded around `radar-beirut-briefing*`,
  `briefing:render:mp4`, `briefing:mux:audio`, `scene-videos`; `package-social-zip.mjs:46`
  assumes `social-captions.json.clips[].sceneId` + briefing split manifests.
- **Depends on:** PR-1 local pipeline + the duelId-keyed captions JSON landing first.
- **Why deferred:** The spec claimed this was "free"; the outside-voice review showed it's a
  real multi-product dashboard refactor that should be done deliberately, not bolted on.

### 2. Backfill briefing scripts onto the new shared libs
- **What:** Migrate `split-briefing-video.mjs:69` and `build-social-captions-prompt.mjs:55`
  onto a shared segment planner; ensure `render-briefing-video.mjs` / `mux-briefing-audio.mjs`
  fully consume `lib/remotion-assets.mjs` + `lib/audio-mux.mjs` (not just the duel side).
- **Why:** Kills the pre-existing 2-4x duplication of offset/filter/asset logic so future
  fixes land once.
- **Depends on:** PR-1 lib extractions + their regression tests (which lock briefing behavior).
- **Why deferred (C1):** Touching the daily-driver briefing scripts beyond the pure extraction
  is its own regression-test pass; keep PR-1 scoped.

### 3. coldOpen hook for the full Reel
- **What:** Add `coldOpen{text, durationSeconds<=1.5}` to `quote-duel.json`; render it as a
  silent prepended `<Sequence>` on the full timeline only (never atomic clips); set the
  timeline's `coldOpenSeconds` from it.
- **Why:** Gives the full Reel's first frame a verbal punch; unproven hook worth A/B testing.
- **Depends on:** `lib/duel-timeline.mjs` already threads `coldOpenSeconds` (PR-1 builds it
  defaulting to 0), so this is a small, low-risk follow-up.
- **Why deferred (A3):** Avoid render + offset-coupling test surface for an unproven hook now.
