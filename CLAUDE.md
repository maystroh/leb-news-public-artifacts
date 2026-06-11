# CLAUDE.md

## Project Overview

Radar Beirut daily briefing video system. Generates four parallel standalone HTML animation formats from a date-folder workflow. The HTML prototypes are the production source of truth; the Remotion MP4 path is a sidecar renderer that mirrors the HTML output.

## Four Briefing Formats

| Format | Logic | Use When |
|---|---|---|
| `full editorial content` | paragraph-first, one scene per outlet | narration/archive layer matters |
| `The Quote Duel` | event-first, two opposed quotes | sharpest day is a direct rhetorical clash |
| `Fault Line Map` | axis-first, outlets plotted on one line | main story is polarization or ideological distance |
| `The Keyword Radar` | term-first, 3–4 loaded phrases per outlet | clearest signal is charged vocabulary |

These are parallel options, not upgrade stages. Never collapse one into another.

## Local Setup — briefings/ folder

`briefings/` is **gitignored** and never committed. Each collaborator must create it locally:

```bash
mkdir -p briefings/YYYY-MM-DD
```

Populate the date folder with outlet screenshots, the corrected briefing `.txt`, and the five Codex JSON stubs before running any npm commands. The full expected structure is shown in **Directory Layout** below.

## Source of Truth Rules

- `radar-beirut-intro.html` (root) — current shared intro reference for all formats
- `templates/radar-beirut-briefing-template.html` and `templates/radar-beirut-quote-duel-template.html` — active HTML shells used by builders
- `templates/radar-beirut-intro.html` — older intro reference kept for comparison; not the active input
- `briefings/YYYY-MM-DD/output/` — daily generated artifacts; these are the current living outputs (local only, gitignored)
- `src/BriefingVideo.jsx` — legacy; do not treat as current production reference
- `src/ProductionBriefingVideo.jsx` — current Remotion production composition

## What Is and Isn't Committed

**Committed (source files):** `package.json`, `package-lock.json`, `briefing-formats.json`, `radar-beirut-intro.html`, `templates/`, `scripts/`, `src/`, `audio/`

**Gitignored (local only):** `briefings/` (all daily data), root-level generated HTMLs (`radar-beirut-briefing.html`, `radar-beirut-fault-line-map.html`, `radar-beirut-keyword-radar.html`, `radar-beirut-quote-duel.html`), `*.mp4`, `*.wav`, `node_modules/`

## Directory Layout

```text
briefings/YYYY-MM-DD/
  briefing_YYYY-MM-DD_corrected.txt   ← prefer _corrected over plain
  visual-script.json
  outlet-map.json
  quote-duel.json
  fault-line-map-script.json
  keyword-radar-script.json
  outlet screenshots / article screenshots
  audio/
    manifest.json
    scene-2-<outlet>.wav
    scene-11-scene-11.wav
    outro-open-question.wav
  output/
    codex-briefing-prompt.md
    timing-config.json
    briefing.json
    fault-line-map.json
    keyword-radar.json
    final_summary_generated.png
    radar-beirut-briefing.html
    radar-beirut-quote-duel.html
    radar-beirut-fault-line-map.html
    radar-beirut-keyword-radar.html
    remotion-briefing-props.json
    remotion-assets/
    scene-videos/
```

Generated briefing audio lives in `briefings/YYYY-MM-DD/audio/`, NOT in `output/audio/`.

## Key npm Commands

```powershell
# Core daily flow
npm run briefing:generate:all -- --folder briefings/YYYY-MM-DD
npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD
npm run briefing:image:prompt -- --folder briefings/YYYY-MM-DD
npm run briefing:image:wire -- --folder briefings/YYYY-MM-DD
npm run briefing:validate:analysis -- --folder briefings/YYYY-MM-DD

# Audio
npm run audio:outlets -- --date YYYY-MM-DD
node ./scripts/sync-outlet-audio-timing.mjs --folder briefings/YYYY-MM-DD

# Format launcher
npm run briefing:formats
npm run briefing:launch -- full-editorial-content
npm run briefing:launch -- quote-duel
npm run briefing:launch -- fault-line-map
npm run briefing:launch -- keyword-radar

# MP4 rendering (run from PowerShell/CMD on Windows, not WSL — faster)
# Defaults: 720x1280, --concurrency 12, --gl angle (pass --gl off to disable GPU).
# Default-resolution output stays unsuffixed (radar-beirut-briefing.mp4); use --resolution 1080x1920 for the full-res final cut.
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --log warn
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolution 540x960 --log warn
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolutions 540x960,1080x1920 --log warn
npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD --log warn

# Muted render + audio mux (audio fixes re-mux in seconds instead of re-rendering frames)
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --muted --log warn
npm run briefing:mux:audio -- --folder briefings/YYYY-MM-DD
npm run briefing:mux:audio -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-720x1280.mp4

# Splitting
npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD
npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960.mp4 --output-dir briefings/YYYY-MM-DD/output/scene-videos-540x960

# Smoke tests (do not replace real output)
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolution 540x960 --frames 0-2 --log warn --output briefings/YYYY-MM-DD/output/smoke.mp4
```

## Build Script Map

| Script | Purpose |
|---|---|
| `scripts/generate-all-briefing-formats.mjs` | creates Codex handoff pack + editable JSON stubs |
| `scripts/build-briefing-folder.mjs` | merges daily sources, timing, audio, images → all outputs |
| `scripts/build-full-editorial-html.mjs` | fills full-editorial template |
| `scripts/build-fault-line-map-html.mjs` | generates Fault Line Map HTML directly |
| `scripts/build-keyword-radar-html.mjs` | generates Keyword Radar HTML directly |
| `scripts/sync-outlet-audio-timing.mjs` | copies WAV durations into timing-config.json + 0.5s buffer |
| `audio/generate-outlet-audio.mjs` | reads briefing.json → writes Hamsa WAVs + manifest |
| `scripts/render-briefing-video.mjs` | Remotion MP4 renderer |
| `scripts/render-briefing-intro-video.mjs` | Remotion intro-only renderer |
| `scripts/mux-briefing-audio.mjs` | mixes narration WAVs at frame-accurate offsets, muxes into rendered MP4 via ffmpeg |
| `scripts/split-briefing-video.mjs` | splits completed MP4 into scene clips |
| `scripts/lib/prepare-briefing-data.mjs` | shared scene data prep |
| `scripts/lib/briefing-analysis-pack.mjs` | shared briefing analysis helpers |

## Editing Rules

- Prefer editing data + build scripts over manually changing generated output.
- For full-editorial HTML: edit `templates/radar-beirut-briefing-template.html` or `scripts/build-full-editorial-html.mjs`.
- For Fault Line Map: edit `briefings/YYYY-MM-DD/fault-line-map-script.json` + `scripts/build-fault-line-map-html.mjs`, not the generated HTML.
- For Keyword Radar: same pattern — edit the data file and build script.
- Preserve the shared intro from `radar-beirut-intro.html` across all formats unless a format-specific intro change is explicitly requested.
- Do not adjust spacing by editing generated output; prefer `#scene-date-box`, `#scene-card`, `#scene-top`.
- When a format has stable editorial rules, document them in `AGENTS.md`.

## CRITICAL: output/briefing.json Warning

`npm run briefing:build:folder` regenerates `output/briefing.json`. If you manually edit `output/briefing.json` (e.g., closing-scene `title`, `scene.media` wiring, `scene-11` art direction), do NOT immediately rerun `briefing:build:folder` unless you also wrote those same changes back into the upstream source JSON files. It will overwrite your edits.

To rebuild HTML from an already-edited `output/briefing.json` without losing manual changes, call only `scripts/build-full-editorial-html.mjs` directly.

## Codex AFK Workflow

- AFK Codex runs from the repo root via `codex exec --cd "$PWD"`
- Prompts must use project-relative paths like `briefings/YYYY-MM-DD/visual-script.json` — never bare filenames
- Generated Codex prompt lives at `briefings/YYYY-MM-DD/output/codex-briefing-prompt.md`
- Codex fills five analysis files in the date folder: `visual-script.json`, `outlet-map.json`, `quote-duel.json`, `fault-line-map-script.json`, `keyword-radar-script.json`

## Full Editorial Content Rules

- Scene order (June 2026+): outlet run → shared closing scene (`خلاصة المشهد`) → open-question outro
- Paragraph 1/opening is NOT a standalone displayed scene; it feeds the closing scene body as context
- `scene-11.body` = opening paragraph + penultimate summary (for display/analysis/image prompting)
- `scene-11.audioText` = penultimate summary paragraph only (for Hamsa TTS)
- `visual-script.json.outroQuestion` = one question only, no setup text, no sign-off
- Outlet `visual.headline` = 2–3 word tone tag (e.g., `واقعية باردة`, `إسقاط أخلاقي`) — never include the outlet name or full verbs like `تتبنى`
- The outro title must remain `السؤال المفتوح`
- Outlet scene duration: 15000ms–20000ms

## Visual Rules (Do Not Break)

- No top intro ticker
- No scene ticker
- Centered date pill near the top of each scene
- Ambient motion always active: scan sweep, radar canvas, map blips, brackets, ring pulses
- Intro background photo: starts at `scale(1.08)`, transitions to `scale(1)` — the zoom-out must be visible; formats calling `showIntro()` immediately must force the initial scale before transitioning
- Intro text reveals 3 seconds before intro ends (`introTextRevealSeconds = introSeconds - 3`)
- Intro duration = `templates/radar-beirut-into-audio-new.mp3` duration + 0.5s buffer (currently 7.527s intro, 4.527s reveal)

### Intro Hero Titles Per Format

| Format | Arabic Title |
|---|---|
| full editorial content | `الصحافة اليوم` |
| The Quote Duel | `ثنائية الاقتباسات` |
| Fault Line Map | `خريطة الانقسام` (NOT `خريطة خط الانقسام`) |
| The Keyword Radar | `رادار الكلمات` |

## Removed Elements — Never Reintroduce Without Explicit Request

- Top intro ticker
- Scene ticker strip
- `RADAR BEIRUT` / `الذكاء اللبناني الاصطناعي` intro identity lines
- Radar Beirut bottom-left badge
- `NARRATIVE LANES` panel
- Scene overview label / scene counter / repeated summary card
- Helper note: `النص الكامل يبقى في التعليق الصوتي...`
- Helper note: `خاتمة تمهيدية قابلة للتحويل...`
- `منصة / صحيفة` outlet sublabel
- `من النص` label on text fallback blocks
- Large duplicate headline/quote block below outlet image area

## Outlet Media Rules

- Front-page images: cover behavior with vertical pan when taller than box
- Article screenshots (`asas-media`, `almodon`): contained mode, rotate if multiple exist
- Naming convention: `asasmedia_article_01.jpg`, `asasmedia_article_02.jpg`, `almodon_article_01.jpg`
- Outlet screenshots stay in the date folder itself, not in `output/`
- Full-editorial HTML references outlet screenshots via relative parent paths: `../aawsat_...png`

## Remotion Production Notes

- Composition: `ProductionBriefing` in `src/ProductionBriefingVideo.jsx`, `720x1280` default, `30fps` (no hardcoded sizes — scales from `useVideoConfig()`; pass `--resolution 1080x1920` for full-res)
- Intro-only: `ProductionIntroOnly` in same file
- Stage coordinate system: `405x720` scaled into render resolution (matches HTML)
- RTL layout: outlet logo + tone tag on right, moving accent bar on left
- Windows rendering is faster than WSL for this project
- `NODE_OPTIONS=--dns-result-order=ipv4first` is set in the render script child process to avoid `ECONNREFUSED ::1:3000` on Windows
- Scene frame math: `startFrame = round((introSeconds + previousSceneSeconds) * 30)`
- Scene split grouping: intro+scene-1 together → each middle scene → penultimate+outro together
- Splitting from the full MP4 is preferred over rendering each scene directly
- Render defaults: `--concurrency 12 --gl angle` (frame rendering is ~99% of render time; GPU compositing of blur/glow effects is the main win). Override with `--concurrency N`, disable GPU with `--gl off`
- Audio-fix workflow: render once with `--muted`, then `briefing:mux:audio` attaches narration in seconds (`-c:v copy`). A regenerated WAV may be re-muxed without re-rendering ONLY if it is not longer than the original — longer audio changes scene durations in `timing-config.json`, which shifts every later scene's start frame and invalidates the muted video

## Audio System

- Provider: Hamsa realtime TTS (`https://api.tryhamsa.com/v1/realtime/tts`)
- Auth: `Authorization: Token <API key>` — key in `.env` as `HAMSA_API_KEY`
- Voice: `Lamees`, dialect `leb`
- WAV files: `briefings/YYYY-MM-DD/audio/scene-{id}-{outletKey}.wav`
- Non-outlet closing scene: `scene-11-scene-11.wav`
- Outro: `outro-open-question.wav`
- Existing WAVs are reused by default; pass `--force` only when intentional regeneration is needed
- Timing sync adds 0.5s buffer to each WAV duration

## timing-config.json

- Lives at `briefings/YYYY-MM-DD/output/timing-config.json`
- Manual source of truth for non-audio timing after first build
- Intro timing is the exception: always refreshed from audio file + 0.5s by the builder
- After manually editing `timing-config.json`, rerun `briefing:build:folder` to regenerate HTML

## Closing Image Workflow

1. `npm run briefing:image:prompt -- --folder briefings/YYYY-MM-DD` → writes image prompt to `output/`
2. Generate image in Codex/ChatGPT, save as `output/final_summary_generated.png`
3. `npm run briefing:build:folder` auto-wires it into `scene-11` via `scene.media`
4. Do not include "safe space in upper third" instruction in the image prompt
