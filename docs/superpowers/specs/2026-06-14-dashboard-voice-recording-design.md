# Dashboard per-scene voice recording — design

**Date:** 2026-06-14
**Status:** Approved (brainstorm); pending implementation plan

## Goal

Let the user produce briefing narration audio by **recording their own voice
per scene from the dashboard web UI**, as an alternative to Hamsa AI TTS. The
choice is per-scene (mix allowed), with a per-date default that gates the bulk
generation step. Recorded WAVs must drop into the exact same scene paths the
rest of the pipeline already consumes, so no render/mux/split code changes.

## Background / current system

- Scene narration WAVs live at `briefings/<date>/audio/scene-<id>-<key>.wav`
  and are tracked in `audio/manifest.json`.
- `audio/generate-outlet-audio.mjs` (the `audio:outlets` npm script) **reuses**
  any WAV already present at a scene's path — only `--force` overwrites
  (`generate-outlet-audio.mjs:469`). `--existing-only` refreshes the manifest
  from WAVs already on disk **without calling Hamsa**.
- WAV **duration** drives `timing-config.json` (via
  `scripts/sync-outlet-audio-timing.mjs`, +0.5s buffer) → per-scene durations in
  the rendered video. A WAV **longer** than the previous one shifts every later
  scene's start frame and invalidates the muted render (must re-render before
  muxing). A same-length-or-shorter WAV only needs a re-mux.
- The dashboard already has a **Scene narration audio** panel
  (`dashboard/web/src/AudioPanel.jsx`) with one row per narration scene: exact
  script text (editable, stored in `audio/text-overrides.json`), WAV playback,
  duration, and a per-scene **Generate/Regenerate (Hamsa)** button.
- The per-scene Hamsa regen flow (`dashboard/audio.mjs:buildRegenerateCommands`)
  is: back up the current WAV as `*.stale-<timestamp>.wav` → run `audio:outlets`
  → compare old vs new duration → `sync-outlet-audio-timing` →
  `briefing:build:folder`. It emits a verdict (`ok` / `longer` / `new`) that the
  UI renders as a badge (`AudioPanel.jsx:RegenBadge`).
- Per-date dashboard state lives in `output/dashboard-state.json` (e.g. the
  existing `remoteSync` marker).
- `ffmpeg` is already required by the workflow and invoked via
  `spawnSync('ffmpeg', ...)` in `scripts/mux-briefing-audio.mjs`.
- `express.json()` is the only body parser currently wired in
  `dashboard/server.mjs`.

## Design

### 1. Recording is a first-class WAV at the scene path

Because `audio:outlets` reuses existing WAVs, a recorded take placed at
`briefings/<date>/audio/scene-<id>-<key>.wav` is indistinguishable to the
renderer, mux, splitter, and timing sync. **No changes to the render/mux/split
pipeline.** Recording reuses the proven Hamsa-regen tail almost verbatim; the
only substitution is "write the uploaded/converted WAV" in place of "call
Hamsa".

Recording flow:

1. Browser records the take (MediaRecorder → webm/opus blob). User previews it
   locally and clicks **Save take**.
2. Blob uploads to a new server route. Server writes a temp file, then runs
   `ffmpeg -i <tmp> -ac 1 -c:a pcm_s16le -ar <rate> <scenePath>` to produce a
   PCM WAV at the scene's exact path. (Mono PCM; the existing WAVs are read only
   for duration and re-encoded by the mux, so sample-rate matching is not
   load-bearing — confirm the rate of an existing Hamsa WAV during
   implementation and match it to avoid surprises.)
3. Server stamps the manifest entry for that scene: `source: "recorded"`, a
   snapshot of the narration text it was recorded against, and the new duration.
4. Server runs the existing regen tail: compare old vs new duration →
   `sync-outlet-audio-timing` → `briefing:build:folder`. The existing
   `ok`/`longer`/`new` verdict + badge fire unchanged.

Before overwriting, the current WAV (if any) is backed up to
`*.stale-<timestamp>.wav`, identical to the Hamsa regen path — a bad take is
recoverable.

### 2. Per-date audio-source default + Step 7 gating

New per-date field `audioSource: "ai" | "human"` (default `"ai"`) stored in
`output/dashboard-state.json`. No new file or storage mechanism.

- A small **AI / Human** toggle in the narration panel header reads/sets it.
- **Step 7** (`dashboard/steps.mjs`, `audio-generate`) reads it:
  - `"ai"` → `audio:outlets --folder <folder>` (unchanged: Hamsa for all
    missing scenes).
  - `"human"` → `audio:outlets --folder <folder> --existing-only` (manifest
    skeleton only, **no Hamsa calls / no API spend**); scenes with no WAV render
    as "awaiting recording".
- The toggle changes **only** the bulk default. Per-scene overrides
  (Generate-via-Hamsa OR Record) always work in both directions regardless of
  the toggle.

### 3. UI / components

In each `AudioPanel.jsx` scene row, alongside the existing
**Generate/Regenerate (Hamsa)** button, add a **Record** control:

- Click → request mic permission → records; shows elapsed time + Stop.
- Stop → inline preview `<audio>` of the take (not yet saved) +
  **Save take** / **Re-record** / **Cancel**.
- **Save take** uploads and runs the pipeline; the row's existing
  playback / duration / verdict badges update exactly as after a Hamsa regen.
- A per-row **source tag** (`AI` / `recorded`), read from the manifest entry's
  `source`, shows at a glance how each scene was produced.

Recorder lifecycle (getUserMedia / MediaRecorder / chunk assembly / cleanup)
lives in a small self-contained `useRecorder` hook so `SceneRow` stays readable.
The hook's interface: `{state, elapsedMs, start(), stop(), reset(), blob, url}`.

### 4. Server endpoints

In `dashboard/server.mjs`:

- `POST /api/audio/record` — body parser `express.raw({type: 'audio/*',
  limit: '25mb'})` (express built-in; **no new npm dependency**; 15–40s opus
  takes are < ~1 MB, 25 MB is generous headroom). `date` + `sceneId` carried as
  query params. Writes the raw blob to a temp file, then dispatches via the
  shared run-tracker (same mechanism as `/api/audio/regenerate`, so logs stream
  to the row and only one run is active per date). Returns the run id.
- `GET /api/audio/source?date=<date>` → `{audioSource}`.
- `POST /api/audio/source` `{date, audioSource}` → persists to
  `dashboard-state.json`, returns the saved value.

In `dashboard/audio.mjs`:

- `buildRecordingCommands(ctx, sceneId, tmpBlobPath)` — mirrors
  `buildRegenerateCommands` but step 2 is an ffmpeg convert-to-WAV-at-scene-path
  command (with the same WAV backup as step 1) instead of `audio:outlets`,
  followed by a manifest-stamp step, then the unchanged duration-compare →
  `sync-outlet-audio-timing` → `briefing:build:folder` tail. The temp blob file
  is deleted at the end (success or failure).
- Helpers to read/write `audioSource` in `dashboard-state.json`.

### 5. Error handling & edge cases

- **ffmpeg missing / convert failure** → surfaced in the row log, same pattern
  as the mux step's "ffmpeg not found" error; the scene's prior WAV stays
  backed up so nothing is lost.
- **Mic permission denied / no input device** → inline message in the row, no
  upload attempted.
- **Empty / zero-length recording** → server rejects before overwriting
  (validate the converted WAV has non-zero duration; if not, restore the backup
  and error).
- **Outro / closing scenes** → already rows in the panel (`outro`, `scene-11`),
  so recording them needs no special case.
- **Longer recorded take** → existing `longer` verdict + "re-render needed"
  badge fire automatically (recorded length is arbitrary, exactly like a
  regenerated Hamsa take).
- **Concurrent runs** → reuse the existing one-run-per-date guard in the run
  tracker; a record upload is just another tracked run.
- **No briefing.json yet** → the panel already shows its empty state; the record
  control is only rendered for real scene rows.

## Out of scope (YAGNI)

- Waveform editor, trim/crop, noise reduction, gain normalization.
- Multi-take history beyond the single `.stale-<timestamp>` backup.
- Re-recording from a phone / remote device (dashboard is `127.0.0.1` only).
- Auto-detecting whether a recorded take's text matches the current script
  beyond the existing `textMismatch` snapshot already computed in `audio.mjs`.

## Affected files

- `dashboard/web/src/AudioPanel.jsx` — Record control per row, source tag,
  panel-header AI/Human toggle.
- `dashboard/web/src/` — new `useRecorder` hook (own file).
- `dashboard/web/src/App.jsx` — wire new API calls + audioSource state.
- `dashboard/server.mjs` — `/api/audio/record`, `/api/audio/source` routes.
- `dashboard/audio.mjs` — `buildRecordingCommands`, audioSource read/write.
- `dashboard/steps.mjs` — Step 7 reads `audioSource` to pick `--existing-only`.
- `audio/generate-outlet-audio.mjs` / manifest — tolerate/preserve a
  `source: "recorded"` field on entries across `--existing-only` refreshes.
- `dashboard/README.md` + `CLAUDE.md` — document the recording flow.
