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
    radar-beirut-briefing-hook-captions.html
    radar-beirut-briefing-hook-stamps.html
    radar-beirut-quote-duel.html
    radar-beirut-fault-line-map.html
    radar-beirut-keyword-radar.html
    remotion-briefing-props.json
    remotion-assets/
    scene-videos/
```

Generated briefing audio lives in `briefings/YYYY-MM-DD/audio/`, NOT in `output/audio/`.

## Full Editorial Hook Variants (HTML + MP4 A/B experiments)

`build-full-editorial-html.mjs` emits the default briefing HTML plus two social-attention variants, each with exactly ONE hook enabled (gated by `HOOK_VARIANT` in the template; `default` disables all):

| File suffix | Hook |
|---|---|
| *(none)* | default — no hooks, unchanged behavior |
| `-hook-captions` | bottom karaoke captions plus mid-screen focus quote boxes on most outlet scenes |
| `-hook-stamps` | mid-scene quote stamp + keyword chips from `output/keyword-radar.json` terms |

Rules: hooks live in `templates/radar-beirut-briefing-template.html` behind the `HOOKS` flags — never fork the template per variant. Total video duration is identical across all files. In `-hook-captions`, bottom captions show the full narration phrase-synced to WAV duration with word-by-word highlight; mid-screen focus boxes reuse the quote stamp styling but do **not** show keyword chips and do **not** wrap text in `« »`. Captions focus boxes should appear only on outlet scenes, excluding the summary/closing scene and the article-screenshot contain scenes `asas-media` and `almodon`. The template still supports `coldopen` and `choreography` hooks (and an `all` mode); they were dropped from the emitted variants after review — re-enable by adding entries back to `HOOK_VARIANTS` in `build-full-editorial-html.mjs`.

Remotion mirrors the `captions` and `stamps` hooks (only those): `npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --variant captions|stamps` renders `radar-beirut-briefing-hook-<variant>.mp4`. The hook overlays live in `src/ProductionBriefingVideo.jsx` and must stay in lockstep with the template's HOOKS timings/styles, including the captions focus-box exclusions. `briefing:mux:audio --input <variant>.mp4` writes `<variant>-final.mp4`. Dashboard step 12 has variant checkboxes and labels the captions variant as `Hook: captions + focus boxes`; steps 13–14 mux/download any variant renders found. Step 15 (split) auto-detects every `radar-beirut-briefing*-final.mp4` in `output/` and shows a checkbox per downloaded variant; each splits into its own `scene-videos[-hook-<variant>]/` folder (one selector appears only when more than one final MP4 is present). Step 16 generates `output/social-captions.json` once via Codex with per-clip Instagram captions/hashtags, a YouTube description, a YouTube thumbnail prompt, and an Instagram Reel cover prompt; it can run as soon as a final MP4 is downloaded and does not need to wait for step 15 because the prompt builder derives the same clip plan from `briefing.json` when no split manifest exists. The prompt copy fields belong inside step 16, while the Post now panel below the steps uses the final MP4s, split clips, and posting text.

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

# Workflow dashboard (local web UI for all steps, per date) — see dashboard/README.md
npm run briefing:dashboard          # launch → open http://127.0.0.1:4600 (auto-builds frontend once)
# stop: Ctrl+C in its terminal, or: pkill -f "dashboard/server.mjs"
npm run briefing:dashboard:build    # rebuild frontend after editing dashboard/web/
npm run briefing:dashboard:dev      # Vite dev server on :4601 (proxies API to :4600)
# "+ New date (today)" creates a remote-sync date: adds steps 0 (rsync-pull the day's
# briefing from the EC2 data server) and 00 (push briefing_<date>_corrected.txt back),
# and locks steps 1–15 until the pull is ready AND the corrected file exists. Marker
# lives in output/dashboard-state.json (remoteSync). Existing/manual dates are unchanged.
# Data-server env overrides: DATA_SERVER_HOST / DATA_SERVER_KEY (~/connectionKey.pem) / DATA_SERVER_ROOT

# Format launcher
npm run briefing:formats
npm run briefing:launch -- full-editorial-content
npm run briefing:launch -- quote-duel
npm run briefing:launch -- fault-line-map
npm run briefing:launch -- keyword-radar

# MP4 rendering (run from PowerShell/CMD on Windows, not WSL — faster)
# Defaults: 720x1280, --concurrency 12. GPU defaults are per-platform:
#   Windows/macOS → --gl angle (headless shell); Linux → --gl angle-egl --chrome-mode chrome-for-testing
# Pass --gl off to disable GPU.
# Default-resolution output stays unsuffixed (radar-beirut-briefing.mp4); use --resolution 1080x1920 for the full-res final cut.
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --log warn
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolution 540x960 --log warn
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolutions 540x960,1080x1920 --log warn
npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD --log warn

# Muted render + audio mux (audio fixes re-mux in seconds instead of re-rendering frames)
npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --muted --log warn
npm run briefing:mux:audio -- --folder briefings/YYYY-MM-DD
npm run briefing:mux:audio -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-720x1280.mp4
# Optional background music bed (default bed: audio/ambient-radar-bed.mp3, synthesized radar ambient, 60s seamless loop)
# --music [path] mixes it under narration; --music-db N (default -22); --music-duck off disables sidechain ducking
npm run briefing:mux:audio -- --folder briefings/YYYY-MM-DD --music
npm run briefing:mux:audio -- --folder briefings/YYYY-MM-DD --music --music-db -18 --music-duck off

# Splitting
npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD
npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960.mp4 --output-dir briefings/YYYY-MM-DD/output/scene-videos-540x960

# Social captions (dashboard step 16) — captions via Codex, then use Post now panel
npm run briefing:social:prompt -- --folder briefings/YYYY-MM-DD   # writes output/social-captions-prompt.md
# feed that prompt to `codex exec` → writes output/social-captions.json
# JSON includes per-clip Instagram copy, YouTube description, YouTube thumbnail prompt, and Instagram Reel cover prompt
npm run briefing:social:validate -- --folder briefings/YYYY-MM-DD
npm run briefing:social:thumbnail-prompt -- --folder briefings/YYYY-MM-DD  # writes output/youtube-thumbnail-prompt.md + output/instagram-reel-cover-prompt.md

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
| `scripts/build-social-captions-prompt.mjs` | writes the Codex prompt for per-clip Instagram captions, YouTube description, and social asset prompts |
| `scripts/validate-social-captions.mjs` | validates output/social-captions.json against briefing.json |
| `scripts/write-youtube-thumbnail-prompt.mjs` | extracts youtube.thumbnailPrompt and instagram.reelCoverPrompt to prompt markdown files |
| `scripts/package-social-zip.mjs` | standalone legacy utility: zips one video type with full MP4, split clips, captions, and YouTube description |
| `scripts/lib/prepare-briefing-data.mjs` | shared scene data prep |
| `scripts/lib/briefing-analysis-pack.mjs` | shared briefing analysis helpers |
| `scripts/build-quote-duel-folder.mjs` | duel-only rebuild (output/quote-duel.json + HTML); skips the other 3 formats |
| `scripts/generate-duel-hooks.mjs` | ONCE/all-dates: shared hook WAVs → audio/hooks/<id>.wav + manifest |
| `scripts/lib/duel-hooks.mjs` | DEFAULT_DUEL_HOOKS, ensureDuelHooks (inject), normalizeHookId, resolveSharedHook |
| `scripts/generate-quote-duel-audio.mjs` | per-duel narration TTS → WAVs + manifest + timingConfig.quoteDuel.scenes |
| `scripts/render-quote-duel-video.mjs` | Remotion QuoteDuel renderer (merges audio manifest + logo/audio srcs) |
| `scripts/mux-quote-duel-audio.mjs` | muxes per-duel WAVs at frame offsets onto the muted duel MP4 |
| `scripts/split-quote-duel-video.mjs` | splits into duel-NN.mp4 + re-encoded top-3 quote-duel-full.mp4 |
| `scripts/build-duel-social-captions-prompt.mjs` | Codex prompt for duelId-keyed Instagram captions + reel description |
| `scripts/validate-duel-social-captions.mjs` | validates output/quote-duel-social-captions.json against quote-duel.json |
| `scripts/lib/duel-timeline.mjs` | shared frame-quantized duel timeline (comp + mux + split) |
| `scripts/lib/hamsa-tts.mjs` | shared Hamsa TTS core + voice-fallback runner |
| `scripts/lib/audio-mux.mjs` | shared ffmpeg adelay→amix filter_complex builder |
| `scripts/lib/remotion-assets.mjs` | shared copyAsset/getLogoSrc/resolveAudioSrc resolver |

## Quote Duel Video Pipeline

The Quote Duel format has a video path parallel to the briefing (no intro; atomized
into per-duel shorts). Local pipeline (the server/dashboard parity is in `TODOS.md`):

```powershell
npm run briefing:duel:hooks                                        # ONCE (all dates): shared hook WAVs → audio/hooks/
npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD      # builds output/quote-duel.json (+ injects hook texts)
npm run briefing:duel:audio  -- --folder briefings/YYYY-MM-DD       # per-duel narration WAVs (reuse/--force/--existing-only)
npm run briefing:duel:render -- --folder briefings/YYYY-MM-DD --muted [--hook hook-2]
npm run briefing:duel:mux:audio -- --folder briefings/YYYY-MM-DD [--hook hook-2]
npm run briefing:duel:split  -- --folder briefings/YYYY-MM-DD [--hook hook-2]
npm run briefing:duel:captions -- --folder briefings/YYYY-MM-DD     # → quote-duel-social-captions-prompt.md
```

To A/B test hooks, run render→mux→split once per `--hook <id>` (outputs get a
`-<id>` suffix; pass the SAME `--hook` to all three so they line up).

- **Schema** (`briefings/<date>/quote-duel.json`, upstream): each `scenes[]` duel may carry
  `rank` (1..N; ranks ≤3 are "main" → the full reel), `narration` (spoken line; falls back
  to `summary`). `rank`/`narration` pass through `build:folder`; audio-driven durations live
  in `timingConfig.quoteDuel.scenes` (audio + 0.5s) and are re-applied on rebuild — never
  write them into `output/quote-duel.json` (it is regenerated wholesale).
- **Timeline**: `scripts/lib/duel-timeline.mjs` is the single frame-quantized source for the
  comp, the muxer, and the splitter — they agree to the frame. Clip identity is source-ordinal
  (`duel-01` == `scenes[0]`); a missing-audio duel is skipped without renumbering survivors.
- **Output names**: `radar-beirut-quote-duel.mp4` (muted master) → `…-final.mp4` (muxed) →
  `duel-videos/duel-NN.mp4` (atomic) + `duel-videos/quote-duel-full.mp4` (top-3, ≤60s,
  re-encoded from the master). WAVs live in `briefings/<date>/audio/duel-NN.wav`, NOT `output/audio/`.
- **Comp** (`src/QuoteDuelVideo.jsx`, registered `QuoteDuel` in `src/Root.jsx`): 720x1280 with a
  405x720 internal stage scaled via `useVideoConfig` (full-res, matches ProductionBriefing).
  Per-duel `layout` prop overrides text placement; logo falls back to outlet-name text.
- **Attention hooks** (TikTok-style opener) are STATIC across all dates/duels. The texts live in
  `DEFAULT_DUEL_HOOKS` (`scripts/lib/duel-hooks.mjs`); `build:folder` injects them into each
  `quote-duel.json` as `hooks: [{id, text}]` for the HTML review. The WAVs are generated ONCE
  by `briefing:duel:hooks` into the shared `audio/hooks/<id>.wav` (+ `manifest.json`), NOT per
  date (`audio/hooks/` is gitignored; the dashboard rsyncs it to the render server). `--hook <id>`
  (bare number → `hook-N`) at render/mux/split selects which variant opens the video via
  `resolveSharedHook`; it becomes the timeline's `coldOpenSeconds` offset and the splitter
  prepends that same range to every short AND once to the full reel. No `--hook` → no hook.
  Default in the dashboard is `hook-2`. The hook visual is `HookScene` in `QuoteDuelVideo.jsx`;
  the duel HTML shows a read-only hooks-review panel. Add a hook: edit `DEFAULT_DUEL_HOOKS` then
  rerun `briefing:duel:hooks`.
- **Dashboard**: step 17 generates the shared hooks locally (all dates) + plays each one; step 18
  reviews and edits per-duel narration locally (per-duel editor + Confirm gate before audio;
  overrides in `audio/quote-duel-text-overrides.json`); step 19 generates narration audio locally
  via Hamsa TTS (then rebuilds for audio-driven durations); step 20 builds and checks the duel
  HTML locally (verify audio + visual + hook before any server contact); step 21 syncs
  `audio/hooks/` to the render server once (idempotent); steps 22–25 are server-side: sync +
  render (muted) → mux audio → download → local split. Fixed to `hook-2`. Short-form
  distribution (Instagram Reels / YouTube Shorts / TikTok + phone transfer) lives exclusively on
  the duel page (DuelPostingPanel), surfacing three tiers: the all-duels master, the top-3 reel,
  and per-duel shorts; the main dashboard "Post now" keeps only the YouTube card. Step 16
  (social captions) is shared across both pages and also generates and validates
  `output/quote-duel-social-captions.json`.

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
- Render defaults: `--concurrency 12`; GPU backend is per-platform — Windows/macOS `--gl angle` (headless shell), Linux `--gl angle-egl --chrome-mode chrome-for-testing` (headless shell has no GPU support on Linux). Frame rendering is ~99% of render time; GPU compositing of blur/glow effects is the main win. Override with `--concurrency N` / `--gl` / `--chrome-mode`, disable GPU with `--gl off`
- Audio-fix workflow: render once with `--muted`, then `briefing:mux:audio` attaches narration in seconds (`-c:v copy`). A regenerated WAV may be re-muxed without re-rendering ONLY if it is not longer than the original — longer audio changes scene durations in `timing-config.json`, which shifts every later scene's start frame and invalidates the muted video

## Audio System

- Provider: Hamsa realtime TTS (`https://api.tryhamsa.com/v1/realtime/tts`)
- Auth: `Authorization: Token <API key>` — key in `.env` as `HAMSA_API_KEY`
- Default voice: `Marwan`; generated manifest entries record `speakerCandidate`, `ttsSpeaker`, and `voiceName` as `Marwan` unless `HAMSA_TTS_SPEAKER` or `HAMSA_TTS_SPEAKERS` specifies a different speaker
- WAV files: `briefings/YYYY-MM-DD/audio/scene-{id}-{outletKey}.wav`
- Non-outlet closing scene: `scene-11-scene-11.wav`
- Outro: `outro-open-question.wav`
- Existing WAVs are reused by default; pass `--force` only when intentional regeneration is needed
- Per-scene narration text overrides: `briefings/YYYY-MM-DD/audio/text-overrides.json` (keyed by scene id, e.g. `scene-3`, `scene-11`, `outro`). The generator prefers an override over briefing.json text (`textSource: "override"` in the manifest); overrides survive rebuilds and are edited from the dashboard's Scene narration panel
- Per-scene source: each manifest entry carries `source: "ai" | "recorded"`. `audio:outlets` rebuilds the manifest from scratch every run, so it reads the **prior** manifest and carries forward each reused WAV's `source`; freshly Hamsa-generated WAVs are stamped `"ai"`. Absent/legacy entries default to `"ai"`. The field is durable across all rebuilds (unrelated regens, Step 7, `--existing-only`)
- Human-recorded narration: the dashboard can record a take per scene (browser MediaRecorder → `ffmpeg` convert to mono 16-bit/16 kHz PCM WAV at the scene path), backing up any prior WAV to `.stale-<timestamp>.wav` and stamping the manifest `source: "recorded"`. A recorded WAV is identical to a Hamsa one for the renderer/mux/splitter (no pipeline changes). A per-date `audioSource: "ai" | "human"` flag in `output/dashboard-state.json` gates Step 7 (`human` → `audio:outlets --existing-only`, no API spend); per-scene Generate/Record always work regardless of it
- Timing sync adds 0.5s buffer to each WAV duration

## timing-config.json

- Lives at `briefings/YYYY-MM-DD/output/timing-config.json`
- Manual source of truth for non-audio timing after first build
- Intro timing is the exception: always refreshed from audio file + 0.5s by the builder
- After manually editing `timing-config.json`, rerun `briefing:build:folder` to regenerate HTML

## Closing Image Workflow

1. `npm run briefing:image:prompt -- --folder briefings/YYYY-MM-DD` → writes image prompt to `output/`
2. Generate image in Codex/ChatGPT when convenient, save as `output/final_summary_generated.png`
3. Do not block later workflow steps on image generation; builds continue with the dark fallback until the PNG exists
4. `npm run briefing:build:folder` auto-wires it into `scene-11` via `scene.media` when present
5. Do not include "safe space in upper third" instruction in the image prompt

## June 26 2026 Session Memory

### Built Together

- Added Quote Duel step 25: `Quote Duel: social text + reel cover prompts`
  - build prompt: `npm run briefing:duel:social-prompts -- --folder briefings/YYYY-MM-DD`
  - validate: `npm run briefing:duel:social-prompts:validate -- --folder briefings/YYYY-MM-DD`
- Added:
  - `scripts/build-duel-social-prompts-prompt.mjs`
  - `scripts/validate-duel-social-prompts.mjs`
  - `tests/duel-social-prompts.test.mjs`
- Duel dashboard now supports copy-ready per-duel publishing text and per-duel 9:16 vertical cover prompts.
- Duel dashboard state uses `view=duel`; duel run requests also include `{ view: "duel" }`.
- Step 16 is now view-specific:
  - main dashboard: main briefing social captions + YouTube thumbnail prompt
  - duel dashboard: Quote Duel social captions
  - per-duel reel/short cover prompts are Step 25, not the main Post now panel
- Main dashboard no longer treats Instagram/Reel cover prompt generation as part of the main briefing social package.
- Added scene-11 audio handoff suffix:
  - `... وهيك منوصل لسؤال اليوم`
  - used by dashboard audio editing and `audio/generate-outlet-audio.mjs`
  - saved scene-11 overrides are materialized with the suffix
- Quote Duel mux/download improvements:
  - `scripts/mux-quote-duel-audio.mjs` supports `--duel`
  - selected duel mux writes/updates a local manifest
  - dashboard download excludes server-side `muted/` intermediates
- Dashboard server now rebuilds Vite output when dashboard web source is newer than `dashboard/web/dist/index.html`.

### Quote Duel Social Prompt Rules

- `output/quote-duel-social-prompts.json` is seeded as a draft; the placeholder prompt is intentionally incomplete.
- Final generated JSON must have one entry per duel id and fill:
  - `title`
  - `description`
  - non-empty `hashtags`
  - `reelCoverPrompt`
- `draft: true` means the file is not ready.
- Every `reelCoverPrompt` must explicitly request `9:16`.
- Do not leave prompts as only:
  - `Create a 9:16 social media reel/short cover for Radar Beirut and save it as ...`
- Final prompts should be copy-ready image prompts with:
  - exact output path
  - Radar Beirut dark Beirut map/radar look
  - orange radar sweep
  - split quote-duel layout
  - specific duel argument, outlet names, stances, and short quotes
  - safe margins for Reels, Shorts, TikTok
  - no exact outlet logos unless source assets are provided

### Generated Output Caveat

- `briefings/` is ignored by Git.
- Date-specific generated files under `briefings/YYYY-MM-DD/output/` are local artifacts by default.
- The filled `briefings/2026-06-26/output/quote-duel-social-prompts.json` was validated locally, but was not committed because `briefings/` is ignored.
- To preserve generated prompt content in Git, move the reusable logic into source scripts/tests/docs or intentionally change ignore rules.

### Errors And Lessons

- `npm test` can fail inside the managed sandbox when tests spawn child Node processes through NVM `process.execPath`.
  - symptom: `spawnSync ... EPERM`
  - test symptom: empty stdout then `SyntaxError: Unexpected end of JSON input`
  - fix: rerun `npm test` with escalated permissions
  - verified: `77/77` tests passed after escalation
- Git staging can fail in the sandbox:
  - symptom: `fatal: Unable to create ... .git/index.lock: Read-only file system`
  - fix: run `git add`, `git commit`, and `git push` with approved escalation
- Commit/push from the session:
  - branch: `main`
  - remote: `origin/main`
  - commit: `5a4ee07`
  - message: `Add Quote Duel social prompt workflow`
