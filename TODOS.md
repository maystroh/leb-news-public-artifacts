# TODOS

Deferred work captured during reviews. Each item has enough context to pick up cold.

## Quote Duel video pipeline — follow-ups

### 1. Dashboard + server-render parity for the duel — DONE (core)
- Dashboard steps 17–22 added: 17 generates the shared hooks (all dates) + syncs them to the
  render server; 18–22 are the per-date duel flow (narration+sync → server render muted →
  server mux → download → local split), fixed to `hook-2`.
- **Still open (follow-up):** fold duel clips into the Post Now panel / phone upload, a duel
  captions dashboard step, and generalizing `package-social-zip.mjs` for `duelId`-keyed captions.
  A `--hook` selector in the UI (currently fixed to hook-2 in steps.mjs) once the hook strategy
  is decided.

### 2. Backfill briefing scripts onto the new shared libs
- **What:** Migrate `split-briefing-video.mjs:69` and `build-social-captions-prompt.mjs:55`
  onto a shared segment planner; ensure `render-briefing-video.mjs` / `mux-briefing-audio.mjs`
  fully consume `lib/remotion-assets.mjs` + `lib/audio-mux.mjs` (not just the duel side).
- **Why:** Kills the pre-existing 2-4x duplication of offset/filter/asset logic so future
  fixes land once.
- **Depends on:** PR-1 lib extractions + their regression tests (which lock briefing behavior).
- **Why deferred (C1):** Touching the daily-driver briefing scripts beyond the pure extraction
  is its own regression-test pass; keep PR-1 scoped.

### 3. coldOpen hook for the full Reel — DONE (superseded by the hook system)
- Implemented as the multi-variant attention hook: `hooks: [{id, text}]` in `quote-duel.json`,
  spoken via `briefing:duel:audio` (one shared WAV per variant), selected with `--hook <id>` at
  render/mux/split. Unlike the original A3 scope (full-reel only), the hook is prepended to EVERY
  output (full reel + each short) per product decision, and is A/B-testable across variants.
  See the "Quote Duel Video Pipeline" section in CLAUDE.md.
