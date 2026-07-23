# Radar Beirut Video Animations

Standalone HTML prototypes and supporting build scripts for Radar Beirut vertical briefing formats.

This project treats the daily folder outputs and the active build templates as the working source for current briefing generation. Multiple parallel briefing formats are supported, and each daily briefing date can generate its own folder-local outputs.

## What This Project Does

The project supports four parallel briefing formats:

- `full editorial content`
- `The Quote Duel`
- `Fault Line Map`
- `The Keyword Radar`

The repo keeps the current standalone intro reference at the project root, active build templates in `templates/`, and daily generated outputs inside date folders such as:

- [briefings/2026-06-01](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\briefings\2026-06-01)

## Component Map

```text
project root
|
+-- radar-beirut-intro.html
|   shared intro visual reference
|
+-- templates/
|   +-- radar-beirut-briefing-template.html
|   |   full-editorial HTML shell
|   +-- radar-beirut-quote-duel-template.html
|       quote-duel HTML shell
|
+-- scripts/
|   +-- generate-all-briefing-formats.mjs
|   |   creates Codex prompt + editable JSON stubs
|   +-- build-briefing-folder.mjs
|   |   merges daily inputs, timing, audio, images, and builds all outputs
|   +-- build-full-editorial-html.mjs
|   |   fills the full-editorial template
|   +-- build-fault-line-map-html.mjs
|   |   writes Fault Line Map HTML directly
|   +-- build-keyword-radar-html.mjs
|   |   writes Keyword Radar HTML directly
|   +-- sync-outlet-audio-timing.mjs
|       copies WAV durations into timing-config.json with a 0.5s buffer
|
+-- audio/
|   +-- generate-outlet-audio.mjs
|       reads output/briefing.json and writes Hamsa WAVs + manifest
|
+-- briefings/YYYY-MM-DD/
    |
    +-- editable daily sources
    |   +-- briefing_YYYY-MM-DD_corrected.txt
    |   +-- outlet-map.json
    |   +-- visual-script.json
    |   +-- quote-duel.json
    |   +-- fault-line-map-script.json
    |   +-- keyword-radar-script.json
    |   +-- outlet screenshots / article screenshots
    |
    +-- audio/
    |   +-- manifest.json
    |   +-- scene-2-<outlet>.wav
    |   +-- scene-11-scene-11.wav
    |   +-- outro-open-question.wav
    |
    +-- output/
        +-- timing-config.json
        +-- briefing.json
        +-- fault-line-map.json
        +-- keyword-radar.json
        +-- final_summary_generated.png
        +-- radar-beirut-briefing.html
        +-- radar-beirut-quote-duel.html
        +-- radar-beirut-fault-line-map.html
        +-- radar-beirut-keyword-radar.html

main flow:
  corrected briefing text + folder-local JSON + screenshots
      -> build-briefing-folder.mjs
      -> output/*.json + output/*.html

audio flow:
  output/briefing.json
      -> audio/generate-outlet-audio.mjs
      -> audio/*.wav + audio/manifest.json
      -> sync-outlet-audio-timing.mjs
      -> output/timing-config.json
      -> rebuild HTML with audio links and durations

full-editorial scene flow:
  source paragraphs
      -> outlet scenes
      -> scene-11 closing/synthesis body from opening + penultimate summary
      -> scene-11 audioText from the penultimate paragraph only
      -> outro from visual-script.json.outroQuestion
```

## Current Source Of Truth

- [radar-beirut-intro.html](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\radar-beirut-intro.html) is the current standalone shared intro reference.
- [before_formatting_output/radar-beirut-intro.html](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\before_formatting_output\radar-beirut-intro.html) is retained only as the older intro reference.
- Active reusable non-intro templates currently live in:
  - [templates/radar-beirut-briefing-template.html](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\templates\radar-beirut-briefing-template.html)
  - [templates/radar-beirut-quote-duel-template.html](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\templates\radar-beirut-quote-duel-template.html)
- Fault Line Map and Keyword Radar are generated directly by their build scripts and do not depend on archived HTML references.
- Date-folder HTML files are the actual daily generated outputs.
- [src/BriefingVideo.jsx](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\BriefingVideo.jsx) is still behind the current HTML workflow and should not be treated as the latest visual source until updated.

## Workflow Dashboard

A local web dashboard runs and tracks every step of the daily workflow per date folder.

Launch it (from WSL or any terminal in the project root):

```bash
npm run briefing:dashboard
```

Then open **http://127.0.0.1:4600** in your browser. The first launch builds the
frontend automatically (one-time, a few seconds). The server is local-only
(binds to 127.0.0.1).

What it gives you:

- A date dropdown listing every `briefings/YYYY-MM-DD` folder (newest first).
- One card per workflow step (asset check → Codex handoff → Codex AFK →
  optional closing image → builds → audio → timing sync → HTML review → server sync →
  server render → mux → download → scene split), each with a Run button,
  its own live log, and the artifact files that matter for the next step.
- Green/red/amber status per step, derived from the files on disk — reopening
  the dashboard shows exactly where the day's run stands, even for steps run
  outside the dashboard.
- A scene narration panel: shows the exact text Hamsa will read per scene
  BEFORE generation (available as soon as the first build creates
  `briefing.json`), with per-scene editing — saved edits persist in
  `audio/text-overrides.json` and survive rebuilds. After generation, listen
  to each scene's WAV and regenerate any single scene (old WAV is backed up,
  only that scene calls Hamsa, timings resync, outputs rebuild, and you get a
  longer/shorter verdict telling you whether a re-render or just a re-mux is
  needed). WAVs whose text no longer matches the saved script are flagged.
- Server sync, server muted render, server mux, and final-MP4 download run
  from the dashboard over ssh/rsync (same host/port as the guided script).

Related commands:

```bash
npm run briefing:dashboard          # start the dashboard on http://127.0.0.1:4600
npm run briefing:dashboard:build    # rebuild the frontend after editing dashboard/web/
npm run briefing:dashboard:dev      # Vite dev server on :4601 (proxies API to :4600)
```

See `dashboard/README.md` for details (status model, state file, env overrides).

## Core Workflow

The current daily workflow is a `Codex-assisted local workflow`.

### Step 1: Create A Briefing Folder

Create a date folder under `briefings/` and place a source briefing text file inside it.

Expected pattern:

```text
briefings/
  YYYY-MM-DD/
    briefing_YYYY-MM-DD.txt
```

Example:

- [briefings/2026-06-01/briefing_2026-06-01.txt](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\briefings\2026-06-01\briefing_2026-06-01.txt)

### Step 2: Prepare The Codex Handoff Pack

Run:

```powershell
npm run briefing:generate:all -- --folder briefings/YYYY-MM-DD
```

Example:

```powershell
npm run briefing:generate:all -- --folder briefings/2026-06-01
```

This creates a briefing pack inside the chosen folder:

- `codex-briefing-prompt.md`
- `visual-script.json`
- `outlet-map.json`
- `quote-duel.json`
- `fault-line-map-script.json`
- `keyword-radar-script.json`

These JSON files are created as editable stubs for Codex to fill.

### Template / Reference Split

- `radar-beirut-intro.html` is the current standalone intro reference.
- `before_formatting_output/` keeps only the retained older intro reference.
- `templates/` contains the active shared non-intro HTML templates used by builders.
- `briefings/YYYY-MM-DD/` contains the editable daily analysis files and the generated final outputs.

### Step 3: Paste The Prompt Into Codex

Open the generated prompt file and paste it into a Codex chat:

- [briefings/2026-06-01/codex-briefing-prompt.md](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\briefings\2026-06-01\codex-briefing-prompt.md)

Codex should then fill the folder-local JSON files with the editorial analysis for that date.

### Step 4: Build The Outputs From The Filled Files

Once the JSON files are filled, run:

```powershell
npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD
```

Example:

```powershell
npm run briefing:build:folder -- --folder briefings/2026-06-01
```

This generates:

- `briefing.json`
- `fault-line-map.json`
- `keyword-radar.json`
- `radar-beirut-briefing.html`
- `radar-beirut-quote-duel.html`
- `radar-beirut-fault-line-map.html`
- `radar-beirut-keyword-radar.html`

inside the same date folder.

## Daily Folder Output Model

Each date folder can hold both source analysis files and final generated outputs.

Typical structure after a successful run:

```text
briefings/YYYY-MM-DD/
  briefing_YYYY-MM-DD.txt
  codex-briefing-prompt.md
  visual-script.json
  outlet-map.json
  quote-duel.json
  fault-line-map-script.json
  keyword-radar-script.json
  briefing.json
  fault-line-map.json
  keyword-radar.json
  radar-beirut-briefing.html
  radar-beirut-quote-duel.html
  radar-beirut-fault-line-map.html
  radar-beirut-keyword-radar.html
```

## Reusing The Closing Image Workflow In Another Folder

Use this when you want to repeat the same closing-scene image workflow for a different briefing date.

### Step 1: Generate The Folder Handoff Pack

Run:

```powershell
npm run briefing:generate:all -- --folder briefings/YYYY-MM-DD
```

Example:

```powershell
npm run briefing:generate:all -- --folder briefings/2026-06-03
```

What happens:

- the date folder gets the Codex handoff pack
- the editable JSON stub files are created or refreshed
- `codex-briefing-prompt.md` is written

### Step 2: Build The Folder Normally

Run:

```powershell
npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD
```

What happens:

- the folder analysis files are merged into generated data
- `output/briefing.json` is regenerated
- the daily HTML outputs are rebuilt
- `output/timing-config.json` is created or reused

### Step 3: Create The Closing Image Prompt

Run:

```powershell
npm run briefing:image:prompt -- --folder briefings/YYYY-MM-DD
```

What happens:

- the script reads the generated summary scene from `output/briefing.json`
- the source is `scene-11.body`, which combines opening context with the penultimate summary
- this is separate from `scene-11.audioText`, which remains summary-only for Hamsa
- an image prompt is written under the date folder's `output/`

### Step 4: Generate The Closing Image

Use the generated prompt in Codex/ChatGPT image generation and save the result under the date folder's `output/` subfolder as:

```text
output/final_summary_generated.png
```

What happens:

- the folder now contains a dedicated closing-scene poster image for the full editorial output
- this is optional and does not block building, audio, analysis, or rendering

### Step 5: Rebuild The Folder Outputs

Run:

```powershell
npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD
```

What happens:

- `output/final_summary_generated.png`, if present, is auto-wired into `scene-11`
- if it is not present yet, the closing scene renders with the dark fallback
- all four date-folder HTML outputs are rebuilt under `output/`

### Step 6: Generate Briefing Audio And Sync Timing

Run:

```powershell
npm run audio:outlets -- --folder briefings/YYYY-MM-DD
node ./scripts/sync-outlet-audio-timing.mjs --folder briefings/YYYY-MM-DD
npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD
```

What happens:

- outlet scenes, `scene-11`, and the outro question get WAV entries in `audio/`
- `scene-11` Hamsa audio uses `audioText`, which is the penultimate summary paragraph only
- `output/timing-config.json` gets WAV durations plus the default `0.5s` buffer
- the generated HTML gets audio links and audio-informed durations

### Important Caution

After manually editing `output/briefing.json`, do not immediately rerun:

```powershell
npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD
```

unless you also wrote the same change back into the upstream source files.

Why:

- `briefing:build:folder` regenerates `output/briefing.json`
- it can overwrite manual changes that exist only in generated output

## Format Overview

### Full Editorial Content

- Paragraph-first.
- One paragraph usually becomes one scene.
- Each scene keeps a `body` layer for archival/narration and a distilled `visual` layer for screen use.
- The renderer shows the distilled `visual` layer.

Primary files:

- [src/data/visual-script.json](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\visual-script.json)
- [src/data/outlet-map.json](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\outlet-map.json)
- [scripts/prepare-briefing.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\prepare-briefing.mjs)
- [scripts/build-full-editorial-html.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-full-editorial-html.mjs)

Hook variants: `build-full-editorial-html.mjs` also emits two social-attention
A/B variants alongside the default file — `-hook-captions` (karaoke captions)
and `-hook-stamps` (quote stamp + keyword chips). Each variant enables exactly
one hook via the `HOOK_VARIANT` flag in the shared template (never fork the
template per variant); total video duration is identical across all files.
Remotion mirrors these two hooks: `briefing:render:mp4 --variant
captions|stamps` renders the matching MP4, and dashboard step 12 has
per-variant checkboxes. See the "Full Editorial Hook Variants" section in
CLAUDE.md.

### The Quote Duel

- Event-first.
- One scene centers one event and two opposed outlets.
- The clash between the two direct quotes is the content.

Primary files:

- [src/data/quote-duel.json](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\quote-duel.json)
- [scripts/build-quote-duel-html.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-quote-duel-html.mjs)

### Fault Line Map

- Axis-first.
- Each day defines a fresh ideological axis.
- Outlets are plotted between `0` and `1`.

Primary files:

- [src/data/fault-line-map-script.json](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\fault-line-map-script.json)
- [src/data/fault-line-map.json](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\fault-line-map.json)
- [scripts/build-fault-line-map-html.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-fault-line-map-html.mjs)

### The Keyword Radar

- Term-first.
- Each scene centers one outlet through `3` to `4` loaded terms.
- The closing synthesis scene clusters terms by rhetorical family.

Primary files:

- [src/data/keyword-radar-script.json](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\keyword-radar-script.json)
- [src/data/keyword-radar.json](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\keyword-radar.json)
- [scripts/build-keyword-radar-html.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-keyword-radar-html.mjs)

## Commands

### Workflow Dashboard

```powershell
npm run briefing:dashboard          # local web UI at http://127.0.0.1:4600
npm run briefing:dashboard:build    # rebuild frontend (dashboard/web/dist)
npm run briefing:dashboard:dev      # frontend dev server on :4601
```

### Main Daily Workflow

```powershell
npm run briefing:generate:all -- --folder briefings/YYYY-MM-DD
npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD
npm run briefing:image:prompt -- --folder briefings/YYYY-MM-DD
npm run briefing:image:wire -- --folder briefings/YYYY-MM-DD
```

### Format Registry And Launching

```powershell
npm run briefing:formats
npm run briefing:launch -- full-editorial-content
npm run briefing:launch -- quote-duel
npm run briefing:launch -- fault-line-map
npm run briefing:launch -- keyword-radar
npm run briefing:launch -- quote-duel --open
```

### Shared Builders

These operate on the shared build templates and root-level generated outputs.

```powershell
npm run briefing:prepare
npm run briefing:build:full-editorial
npm run briefing:build:quote-duel
npm run briefing:build:fault-line-map
npm run briefing:build:keyword-radar
```

### Narration / Audio

```powershell
npm run narration:prepare
npm run audio:generate:dry
npm run audio:generate
```

### Briefing Audio

Generate Hamsa WAV files for the full-editorial briefing audio entries in a
date folder: outlet scenes, closing/synthesis scene, and outro question.

```powershell
HAMSA_API_KEY=... npm run audio:outlets -- --date YYYY-MM-DD
```

You can also set `HAMSA_API_KEY=...` in the project root `.env` or `.env.local`;
shell environment variables take precedence.

The script reads:

```text
briefings/YYYY-MM-DD/output/briefing.json
```

and writes:

```text
briefings/YYYY-MM-DD/audio/
  manifest.json
  scene-2-alakhbar.wav
  scene-3-nidaa-al-watan.wav
  scene-11-scene-11.wav
  outro-open-question.wav
```

Existing WAV files are reused by default. Use `--force` only when you
intentionally want to regenerate existing audio. Use `--existing-only` to
refresh `audio/manifest.json` from files already present without calling Hamsa
for missing entries.

When briefing audio is synced into `output/timing-config.json`, the default
scene or outro duration is the WAV duration plus a `0.5s` transition buffer.
The shared intro duration is also refreshed by the folder builder from
`templates/radar-beirut-into-audio-new.mp3` plus the same `0.5s` buffer.

The audio manifest is the pipeline integration surface. It contains:

- `audioByOutlet`
- `audioByScene`
- full `entries`

Each record includes outlet key/name, scene id, audio path, generated duration,
status, and any generation error category. `missing-api-key` means Hamsa was not
called; Hamsa HTTP errors such as auth, credits, quota, or rate limits are
reported separately.

### Remotion

The production Remotion path is a sidecar MP4 renderer for the full-editorial
briefing data. The current production composition is `ProductionBriefing` in
`src/ProductionBriefingVideo.jsx`; the legacy `src/BriefingVideo.jsx` remains
older and should not be used as the current visual reference.

The Remotion intro and full-editorial scene card now intentionally mirror the
HTML output structure: a scaled `405x720` stage, shared radar/scan/bracket
ambient layer, centered date pill, RTL outlet header with logo and tone tag on
the right, moving accent bar on the left, and the main outlet media/detail box.
The outro also uses the HTML-style stage and centered rounded open-question
panel, without the old extra date pill.

Render the full MP4 at the default production resolution (`1080x1920`, `30fps`):

```powershell
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --log warn
```

Default output:

```text
briefings/YYYY-MM-DD/output/radar-beirut-briefing.mp4
```

Render a lower-resolution review copy:

```powershell
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolution 540x960 --log warn
```

Resolution-specific outputs use names such as:

```text
briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960.mp4
briefings/YYYY-MM-DD/output/radar-beirut-briefing-1080x1920.mp4
```

Render the intro only:

```powershell
npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD --log warn
```

Default intro-only output:

```text
briefings/YYYY-MM-DD/output/radar-beirut-intro.mp4
```

Render an explicit intro-only resolution:

```powershell
npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD --resolution 1080x1920 --log warn
npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD --resolution 540x960 --log warn
```

Smoke-test a short frame range without replacing the real output:

```powershell
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolution 540x960 --frames 0-2 --log warn --output briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960-smoke.mp4
npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD --resolution 540x960 --frames 0-2 --log warn --output briefings/YYYY-MM-DD/output/radar-beirut-intro-540x960-smoke.mp4
```

Render one specific scene by passing a frame range:

```text
startFrame = round((introSeconds + previousSceneSeconds) * 30)
endFrame = round((introSeconds + previousSceneSeconds + sceneSeconds) * 30) - 1
```

Example for scene 2 in `briefings/2026-06-09`:

```powershell
npm run briefing:render:mp4 -- --folder briefings/2026-06-09 --resolution 540x960 --frames 226-1372 --log warn --output briefings/2026-06-09/output/scene-2-test.mp4
```

Split a completed full MP4 into scene clips:

```powershell
npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD
```

Default split output:

```text
briefings/YYYY-MM-DD/output/scene-videos/
```

Split a specific rendered resolution:

```powershell
npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-1080x1920.mp4 --output-dir briefings/YYYY-MM-DD/output/scene-videos-1080x1920
npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960.mp4 --output-dir briefings/YYYY-MM-DD/output/scene-videos-540x960
```

Use `--dry-run` with the same `--input` and `--output-dir` to preview the split
plan before writing files. Production splitting should normally be done from the
completed full MP4 rather than rendering each scene separately, because that
preserves the continuous timing and audio source.

The guided workflow now treats HTML review as the verification gate before MP4
generation. After Step 5 builds HTML and syncs audio timing, it asks you to
review the HTML outputs, runs one final HTML rebuild, then asks you to launch
the Windows render:

```powershell
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolutions 540x960 --log warn
```

The workflow waits until this file exists:

```text
briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960.mp4
```

If the file is still missing after you press Enter, the workflow repeats the
same Windows render instruction. Once the MP4 exists, it automatically splits it
to:

```text
briefings/YYYY-MM-DD/output/scene-videos-540x960/
```

## File Guide

### Registry And Config

- [briefing-formats.json](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\briefing-formats.json)
- [package.json](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\package.json)

### Build Scripts

- [audio/generate-outlet-audio.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\audio\generate-outlet-audio.mjs)
- [scripts/generate-all-briefing-formats.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\generate-all-briefing-formats.mjs)
- [scripts/build-briefing-folder.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-briefing-folder.mjs)
- [scripts/prepare-briefing.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\prepare-briefing.mjs)
- [scripts/build-full-editorial-html.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-full-editorial-html.mjs)
- [scripts/build-quote-duel-html.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-quote-duel-html.mjs)
- [scripts/build-fault-line-map-html.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-fault-line-map-html.mjs)
- [scripts/build-keyword-radar-html.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-keyword-radar-html.mjs)
- [scripts/launch-briefing-format.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\launch-briefing-format.mjs)
- [scripts/render-briefing-video.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\render-briefing-video.mjs)
- [scripts/render-briefing-intro-video.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\render-briefing-intro-video.mjs)
- [scripts/split-briefing-video.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\split-briefing-video.mjs)

### Active Templates

- [templates/radar-beirut-briefing-template.html](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\templates\radar-beirut-briefing-template.html)
- [templates/radar-beirut-quote-duel-template.html](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\templates\radar-beirut-quote-duel-template.html)

### Intro References

- [radar-beirut-intro.html](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\radar-beirut-intro.html)
- [before_formatting_output/radar-beirut-intro.html](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\before_formatting_output\radar-beirut-intro.html)

### Shared Script Helpers

- [scripts/lib/briefing-analysis-pack.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\lib\briefing-analysis-pack.mjs)
- [scripts/lib/briefing-helpers.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\lib\briefing-helpers.mjs)
- [scripts/lib/prepare-briefing-data.mjs](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\lib\prepare-briefing-data.mjs)

## Visual Rules To Preserve

- Intro duration is derived from `templates/radar-beirut-into-audio-new.mp3` plus a `0.5s` buffer.
- The intro is richer than the scene phase.
- No top intro ticker in the current prototype direction.
- No scene ticker in the current scene phase.
- Scenes use a centered date pill near the top.
- Ambient motion remains active during scenes:
  - scan sweep
  - radar canvas
  - map blips
  - brackets
  - ring pulses

## Editing Rules

- Preserve the current shared templates and intro references unless a deliberate format change is requested.
- For generated formats, prefer editing data + build scripts rather than manually changing generated output.
- Keep the shared intro direction aligned with [radar-beirut-intro.html](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\radar-beirut-intro.html).
- Avoid reintroducing removed helper labels, badges, duplicate summary blocks, or tickers unless explicitly requested.
- If a new format becomes stable, document its editorial rules in [AGENTS.md](C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\AGENTS.md).

## Notes

- `briefing:generate:all` no longer calls the OpenAI API directly. It prepares a local Codex handoff pack.
- The `openai` dependency may still exist in `package.json` from earlier work, but the current daily folder workflow is Codex-assisted rather than API-driven.
- The old non-intro HTML files in `before_formatting_output/` were removed from the active tree.
- The daily folder outputs are the safer place for date-specific runs.
