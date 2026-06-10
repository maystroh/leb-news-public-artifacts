# AGENTS.md

## Purpose
This project contains standalone HTML briefing prototypes for Radar Beirut vertical briefing animations.

The goal is to preserve the current visual decisions so future edits do not accidentally undo them.

## Current Source Of Truth
- Keep `radar-beirut-intro.html` as the current standalone shared visual reference for intro behavior across formats.
- `before_formatting_output/radar-beirut-intro.html` is retained only as the older intro reference.
- The intro is conceptually shared even when the final output format changes.
- Each daily briefing format should generate its own HTML output file.
- Do not assume there is only one final briefing HTML anymore.
- `before_formatting_output/` should contain only the retained older intro reference, not old generated format HTML copies.
- Active non-intro shared build templates currently live in:
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\templates\radar-beirut-briefing-template.html`
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\templates\radar-beirut-quote-duel-template.html`
- Current day-specific generated artifacts should live inside each date folder's `output/` subfolder under `briefings/YYYY-MM-DD/output/`.
- Exception: generated briefing audio lives directly in each date folder's `audio/` subfolder under `briefings/YYYY-MM-DD/audio/`, not under `output/`.
- Keep editable source inputs in the date folder itself: briefing text, outlet screenshots, and Codex-filled analysis JSON files.
- Generated prompts and AFK logs belong in `output/`, but Codex-filled analysis files remain folder-local editable source files.
- When Codex AFK edits analysis files, prompts must name project-relative paths like `briefings/YYYY-MM-DD/visual-script.json`; avoid bare filenames such as `visual-script.json` because AFK Codex runs from the repo root.
- The Remotion implementation in `src/BriefingVideo.jsx` is currently behind the HTML prototype and should not be treated as the latest visual source of truth until it is updated to match.

## Accepted Layout Decisions

### Intro
- Intro duration should be derived automatically from `templates/radar-beirut-into-audio-new.mp3` plus a `0.5s` buffer.
- Intro text should reveal `3s` before the intro ends, i.e. `introTextRevealSeconds = introSeconds - 3`.
- With the current `templates/radar-beirut-into-audio-new.mp3`, generated intro timing is `7.527s` and intro text reveal is `4.527s`.
- The intro remains visually richer than the scene phase.
- The current HTML prototype no longer shows the top intro ticker.
- The current HTML prototype no longer shows the `RADAR BEIRUT` / `الذكاء اللبناني الاصطناعي` intro identity lines.
- The current HTML prototype intro uses one large dynamic hero title:
  - `الصحافة اليوم` for full editorial content
  - `ثنائية الاقتباسات` for The Quote Duel
  - `خريطة الانقسام` for Fault Line Map
  - `رادار الكلمات` for The Keyword Radar
- The intro eyebrow slot should remain visually empty unless explicitly requested back.
- The radar canvas sweep should use the quote-duel-style circular grid and orange wedge sweep.
- Shared intro motion should remain consistent across all four HTML outputs:
  - full editorial content
  - The Quote Duel
  - Fault Line Map
  - The Keyword Radar
- The shared intro map layer should show Beirut neighborhood labels with pulsing/rippling dots, not only static dots.
- The intro background photo should visibly zoom out during the first seconds by starting at `scale(1.08)` and transitioning to `scale(1)`.
- Formats that call `showIntro()` immediately should force the initial `scale(1.08)` state before transitioning, otherwise the browser may skip the visible zoom-out.

### Scene Phase
- There is no scene ticker anymore.
- After the intro, scenes should show a standalone centered date box near the top.
- The date box should be centered horizontally.
- The date box should be wide, visually prominent, and use the current rounded pill style.
- The outlet card should start below the date box.
- The gap between the date box and the outlet card has been intentionally tightened.

### Outlet Header
- The outlet logo block stays on one side of the scene header.
- The outlet name is vertically centered against its logo.
- The `منصة / صحيفة` sublabel was removed and should stay removed unless requested back.
- The colored accent bar remains in the header row.

### Removed Elements
- Remove the top scene summary box that previously showed:
  - scene overview label
  - scene counter
  - repeated summary card content
- Remove the `NARRATIVE LANES` panel for now.
- Remove the Radar Beirut badge/logo that used to sit at the bottom-left of scene cards.
- Remove the helper note that said:
  - `النص الكامل يبقى في التعليق الصوتي، بينما تركز الشاشة على زاوية كل صحيفة وخيط المقارنة العام.`
- Remove the outro helper note that said:
  - `خاتمة تمهيدية قابلة للتحويل لاحقًا إلى فيديو مع تعليق صوتي وموسيقى.`

## Motion Decisions
- Keep the background ambient motion alive during scenes:
  - scan sweep
  - radar canvas
  - map blips
  - brackets
  - ring pulses
- The original idea of keeping a ticker across all scenes was rejected.
- The scene phase should not have scrolling ticker text unless the user asks for it again.

## Timing Configuration
- Timing is currently handled inside each format HTML through its own `PLAYBACK_CONFIG`.
- Keep intro timing aligned with the shared intro audio unless a format-specific exception is explicitly requested.
- The folder builder should write each format's `introSeconds` in `output/timing-config.json` from `templates/radar-beirut-into-audio-new.mp3` duration plus `0.5s`.
- The folder builder should write each format's `introTextRevealSeconds` as `introSeconds - 3`.

## Current HTML Prototype State
- `radar-beirut-intro.html` is the current standalone shared intro reference.
- `before_formatting_output/radar-beirut-intro.html` remains only as an older intro reference.
- `templates/radar-beirut-briefing-template.html` is the active shared full-editorial HTML template used by the builder.
- `templates/radar-beirut-quote-duel-template.html` is the active shared quote-duel HTML template used by the builder.
- `scripts/build-fault-line-map-html.mjs` directly generates the Fault Line Map HTML output.
- `scripts/build-keyword-radar-html.mjs` directly generates The Keyword Radar HTML output.
- The `full editorial content` scene phase currently uses a single main card layout with the centered date pill and no secondary lanes panel.
- Ambient scene motion remains active across formats:
  - scan sweep
  - radar canvas
  - map blips
  - brackets
  - ring pulses
- Recent intro parity work:
  - `templates/radar-beirut-quote-duel-template.html` now matches the full-editorial labeled Beirut map/ripple intro behavior.
  - `scripts/build-fault-line-map-html.mjs` now generates the same labeled Beirut map/ripple intro behavior.
  - `scripts/build-keyword-radar-html.mjs` now generates the same labeled Beirut map/ripple intro behavior.
  - Quote Duel, Fault Line Map, and Keyword Radar now explicitly reset `#bg-photo` to `scale(1.08)`, force layout with `void bgPhoto.offsetWidth`, then restore `opacity 1.2s ease, transform 6s ease` and transition to `scale(1)` so the zoom-out is visible.

## Current Remotion App State
- The legacy Remotion app entry `src/BriefingVideo.jsx` is still present and should be treated as old unless explicitly updated.
- The production MP4 sidecar renderer now uses:
  - `src/ProductionBriefingVideo.jsx`
  - `src/Root.jsx` composition id `ProductionBriefing`
  - `scripts/render-briefing-video.mjs`
- The intro-only MP4 test renderer now uses:
  - `src/ProductionBriefingVideo.jsx`
  - `src/Root.jsx` composition id `ProductionIntroOnly`
  - `scripts/render-briefing-intro-video.mjs`
  - npm script `briefing:render:intro`
- The production MP4 renderer is meant for testing and production video output without replacing or breaking the existing HTML pipeline.
- The existing HTML outputs remain in place and remain the visual source of truth until the user verifies the MP4 output and explicitly decides to replace HTML outputs.
- The `ProductionBriefing` composition default is:
  - `1080x1920`
  - `30fps`
- The `ProductionIntroOnly` composition default is also:
  - `1080x1920`
  - `30fps`
- Current Remotion parity status:
  - `src/ProductionBriefingVideo.jsx` has been updated to match the full-editorial HTML intro and scene layout much more closely.
  - `src/BriefingVideo.jsx` remains the older legacy composition and should still not be used as the current visual reference.
  - The Remotion intro uses the HTML-style `405x720` stage coordinate system scaled into the requested render resolution.
  - The Remotion intro keeps the shared HTML intro behavior: visible first-seconds photo zoom-out, scan sweep, radar sweep, rings, labeled Beirut map dots, bottom intro title/date treatment, and four corner brackets.
  - Remotion scene cards use the HTML-style `405x720` stage coordinate system scaled into the requested render resolution.
  - Remotion scenes keep the centered top date pill, single main card, outlet logo + `visual.headline` tone tag in the header, summary under the header, and the main media/detail area.
  - In Remotion scenes, the outlet logo + text belong on the right side of the header and the moving colored accent bar belongs on the left side, matching the RTL HTML output.
  - Remotion scenes include the four corner bracket angles during the scene phase at subdued opacity, matching the HTML scene ambient layer.
  - The Remotion outro now uses the same HTML-style `405x720` stage, ambient/corner layers, centered rounded panel, orange `السؤال المفتوح` title, and large RTL question body; it should not show the old extra date pill or legacy full-width text card.
  - Remotion scenes should not reintroduce the old large duplicate headline/quote block below the outlet image area.
  - Remotion uses the staged Dubai font files from `fonts/` so Arabic typography stays aligned with the HTML output.
  - Front-page media in Remotion uses cover behavior with a vertical object-position animation to approximate the HTML overflow pan when the image does not fit in the outlet image box.
  - Article screenshots with `fitMode: contain`, such as `asas-media` and `almodon`, stay contained inside the image box and rotate when multiple screenshots exist.
- The default full MP4 render command is:
  - `npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --log warn`
- The default full MP4 output path is:
  - `briefings/YYYY-MM-DD/output/radar-beirut-briefing.mp4`
- This default command and output path must stay stable so existing full-video usage does not break while MP4 output is being verified.
- The default intro-only MP4 render command is:
  - `npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD --log warn`
- The default intro-only MP4 output path is:
  - `briefings/YYYY-MM-DD/output/radar-beirut-intro.mp4`
- Explicit intro-only resolution example:
  - `npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD --resolution 1080x1920 --log warn`
- Resolution-specific intro-only outputs use filenames such as:
  - `briefings/YYYY-MM-DD/output/radar-beirut-intro-1080x1920.mp4`
  - `briefings/YYYY-MM-DD/output/radar-beirut-intro-540x960.mp4`
- The renderer stages Remotion assets in:
  - `briefings/YYYY-MM-DD/output/remotion-assets/`
- The renderer writes props in:
  - `briefings/YYYY-MM-DD/output/remotion-briefing-props.json`
- The intro-only renderer stages Remotion assets in:
  - `briefings/YYYY-MM-DD/output/remotion-intro-assets/`
- The intro-only renderer writes props in:
  - `briefings/YYYY-MM-DD/output/remotion-intro-props.json`
- On Windows, run the render command from PowerShell or Command Prompt after `npm install`:
  - `npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --log warn`
- Windows rendering was observed to be faster than WSL for this project.
- The render script sets `NODE_OPTIONS=--dns-result-order=ipv4first` for the child Remotion process to avoid Windows localhost audio downloads failing on `::1:3000`.
- If Remotion reports `connect ECONNREFUSED ::1:3000` while downloading staged audio from localhost, keep the IPv4-first child process behavior in `scripts/render-briefing-video.mjs`.
- Native resolution variants are supported for visual-impact testing while keeping the same `30fps`.
- Single resolution example:
  - `npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolution 720x1280 --log warn`
- Batch resolution example:
  - `npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolutions 1080x1920,720x1280,540x960 --log warn`
- Resolution-specific outputs use filenames such as:
  - `briefings/YYYY-MM-DD/output/radar-beirut-briefing-1080x1920.mp4`
  - `briefings/YYYY-MM-DD/output/radar-beirut-briefing-720x1280.mp4`
  - `briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960.mp4`
- If no `--resolution` or `--resolutions` flag is passed, the old default output filename remains unchanged.
- The render script rejects invalid resolution strings and odd dimensions because H.264 output expects even dimensions.
- For quick Remotion smoke tests, use a short frame range without changing the real output:
  - `npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolution 540x960 --frames 0-2 --log warn --output briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960-smoke.mp4`
- For quick intro-only Remotion smoke tests:
  - `npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD --resolution 540x960 --frames 0-2 --log warn --output briefings/YYYY-MM-DD/output/radar-beirut-intro-540x960-smoke.mp4`
- To render one specific scene directly from Remotion, pass an explicit `--frames START-END` range and an `--output` path.
- Scene frame ranges are calculated at `30fps`:
  - `startFrame = round((introSeconds + previousSceneSeconds) * 30)`
  - `endFrame = round((introSeconds + previousSceneSeconds + sceneSeconds) * 30) - 1`
- Example for scene 2 with the current `2026-06-09` data:
  - `npm run briefing:render:mp4 -- --folder briefings/2026-06-09 --resolution 540x960 --frames 226-1372 --log warn --output briefings/2026-06-09/output/scene-2-test.mp4`
- Direct one-scene renders are useful for layout testing, but the preferred production split remains splitting from the completed full MP4.
- Split-per-scene MP4 outputs are generated from the completed full MP4 using:
  - `npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD`
- The split script writes scene clips under:
  - `briefings/YYYY-MM-DD/output/scene-videos/`
- Split clip grouping is:
  - intro plus first content scene as one video
  - each middle scene as its own video
  - penultimate scene plus outro as one video
- Splitting from the completed full MP4 is preferred over rendering every scene from scratch because it avoids repeated Remotion renders and preserves one continuous timing/audio source.
- When multiple full-video resolutions exist, split each resolution by passing `--input` and a resolution-specific `--output-dir`.
- Per-resolution split examples:
  - `npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-1080x1920.mp4 --output-dir briefings/YYYY-MM-DD/output/scene-videos-1080x1920`
  - `npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-720x1280.mp4 --output-dir briefings/YYYY-MM-DD/output/scene-videos-720x1280`
  - `npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960.mp4 --output-dir briefings/YYYY-MM-DD/output/scene-videos-540x960`
- Use `--dry-run` with the same `--input` and `--output-dir` to preview a split plan before writing files.
- The split timestamps come from `briefings/YYYY-MM-DD/output/briefing.json`, so scene grouping should remain identical across all rendered resolutions.
- The split script supports `--mode copy` for faster keyframe-based cuts, but the default `reencode` mode is preferred for accurate scene boundaries.
- `src/BriefingVideo.jsx` still includes older elements and assumptions such as:
  - a top intro ticker
  - intro identity lines like `RADAR BEIRUT`
  - the Radar Beirut bottom-left badge
  - scene helper/footer notes
  - a `NARRATIVE LANES`-style narrative framing
- Do not use `src/BriefingVideo.jsx` as the current production video reference unless it is intentionally modernized.

## Things That Were Tried And Rejected
- Replacing the intro ticker with a custom long marquee.
- Keeping ticker text visible across all scenes.
- Putting the date in a scene ticker strip.
- Moving the date inside the outlet info block.
- Adding a large empty top band above the outlet card.

If revisiting any of those, confirm with the user first.

## Editing Guidance
- When adjusting the date and outlet spacing, prefer changing:
  - `#scene-date-box`
  - `#scene-card`
  - `#scene-top`
- When adjusting a specific format, edit that format's HTML output file instead of assuming the change belongs in every format.
- Exception:
  - `output/radar-beirut-fault-line-map.html` is generated output for date-folder builds
  - prefer editing the date folder's `fault-line-map-script.json` and the relevant build scripts
- Exception:
  - `output/radar-beirut-keyword-radar.html` is generated output for date-folder builds
  - prefer editing the date folder's `keyword-radar-script.json` and the relevant build scripts
- Preserve the shared intro language, timing feel, and radar sweep from `radar-beirut-intro.html` unless the user explicitly asks for a format-specific intro change.
- Avoid reintroducing hidden helper labels or duplicated summary blocks.
- Avoid changing the intro ticker behavior unless the user explicitly asks.

## Working Preferences
- Prefer preserving the current HTML prototypes before trying to "improve" them stylistically.
- Prefer extending the multi-format system instead of folding every idea back into one shared full-editorial HTML file.
- Prefer a dedicated data file and build script when a format has repeatable structure or is generated.
- When a date folder contains both AI-generated and human-corrected briefing text files, prefer the human-corrected source suffixed with `_corrected.txt`.
- Prefer launching formats through the registry and launcher scripts instead of opening files ad hoc:
  - `npm run briefing:formats`
  - `npm run briefing:launch -- <format-id>`
- Prefer rebuilding generated formats before review when their source data changed:
  - `npm run briefing:build:fault-line-map`
  - `npm run briefing:build:keyword-radar`
- Prefer using the shared intro direction as a family resemblance across formats, while allowing the scene phase to diverge by editorial logic.
- Prefer keeping scenes readable for vertical short-form viewing over adding more text density.
- Prefer explicit editorial compression written in source data over renderer-side auto-summarization.
- If a new format idea becomes stable, document its editorial rules here in `AGENTS.md`.

## Note About Memory
- No separate persistent memory tool was available in this session.
- This `AGENTS.md` file is the local record of the work and decisions from this thread.
- Latest remembered decisions include:
  - generated artifacts live under `briefings/YYYY-MM-DD/output/`
  - generated briefing audio lives under `briefings/YYYY-MM-DD/audio/`
  - AFK Codex runs blocking from WSL using `codex exec`
  - AFK prompts must use project-relative analysis-file paths
  - `visual-script.json.outroQuestion` supplies only the outro question
  - `السؤال المفتوح` remains the outro title
  - outlet scene `visual.headline` should be a short tone tag, not a sentence
  - shared intro map behavior across formats includes labeled Beirut neighborhoods, pulsing/rippling dots, radar sweep, scan sweep, rings, brackets, and visible first-seconds zoom-out
  - Fault Line Map intro title is now `خريطة الانقسام`, not `خريطة خط الانقسام`
  - full-editorial closing/synthesis scene analysis/body may combine opening + penultimate summary for context, but audio must use only the penultimate paragraph
  - full-editorial Hamsa audio now covers outlet scenes, the closing/synthesis scene, and the outro question

## Full Editorial Content Memory
- The agreed name for this scene-content approach is `full editorial content`.
- The current scene-content workflow is editorial-first, not renderer-generated.
- Source briefing file is split by paragraph.
- Each paragraph becomes one scene by default.
- Typical structure:
  - paragraph 1 = opening/framing scene
  - middle paragraphs = one outlet per scene
  - penultimate paragraph = synthesis/closing scene
  - final paragraph = open-question outro
- For each paragraph, preserve the full paragraph as the long-form `body`.
- Then manually compress that paragraph into a `visual` layer with:
  - `headline`: for outlet scenes, a short tone tag of 2-3 Arabic words
  - `summary`: the one-sentence on-screen interpretation
  - `quote`: the sharpest ideological phrase, slogan, or fault line
- Outlet scene `visual.headline` should name the outlet's editorial posture or tone, not summarize a whole sentence.
- Good outlet headline examples:
  - `واقعية باردة`
  - `إسقاط أخلاقي`
  - `تحالف الركام`
  - `صرخة للدولة`
  - `دبلوماسية أولاً`
  - `نقد مزدوج`
  - `تعبئة كاملة`
- Avoid outlet headlines that include the outlet name or full verbs such as `تتبنى`, `تقطع`, `ترى`, `تقول`, or `تعتبر`.
- Bad style examples:
  - `أساس تتبنّى لحظة الخلاص`
  - `اللواء تقطع مع سردية الممانعة`
- Better style examples for the same kind of material:
  - `لحظة الخلاص`
  - `رثاء الصبر`
  - `قطيعة الممانعة`
  - `صرخة الدولة`
- Outlet identity is mapped separately through outlet metadata:
  - outlet name
  - outlet key
  - logo file
- Framing/synthesis scenes may intentionally have no outlet mapping.
- Framing/synthesis scenes may still carry dedicated scene-level visual media even without outlet mapping.
- The scene JSON may include a top-level `media` object for that purpose:
  - `fitMode`
  - `items`
- This scene-level `media` should be rendered before any text fallback, just like outlet media.
- The renderer should display the distilled `visual` layer, not try to summarize the paragraph live.
- Working rule: one scene should usually carry one dominant editorial thesis, even if the source paragraph contains several sub-points.
- If a paragraph contains multiple equally important angles, confirm before splitting it into multiple scenes or introducing a denser multi-card layout.
- `visual-script.json` now uses an object shape:
  - `outroQuestion`
  - `scenes`
- `outroQuestion` must be extracted from the final paragraph as one question only.
- `outroQuestion` must not include setup phrases, follow-up sentences, sign-offs, or any text after the question mark.
- Example extraction:
  - source: `والسؤال الذي تتجنبه كل الصحف: ماذا عن الجنوب الذي يبدو خارج أي تهدئة شاملة في كل السيناريوهات؟ هذا ما ستكشفه الساعات القادمة. حتى نلتقي.`
  - `outroQuestion`: `ماذا عن الجنوب الذي يبدو خارج أي تهدئة شاملة في كل السيناريوهات؟`
- The full-editorial outro title should remain `السؤال المفتوح`.
- The full-editorial outro body should show only `visual-script.json.outroQuestion`, not the full final paragraph.

### Full Editorial Content ASCII Diagram
```text
+--------------------------------------------------------------+
| briefing_YYYY-MM-DD.txt                                      |
| long-form editorial briefing                                 |
+------------------------------+-------------------------------+
                               |
                               v
                    +----------------------+
                    | split by paragraph   |
                    | blank-line separated |
                    +----------+-----------+
                               |
                               v
      +---------------------------------------------------------------+
      | paragraph -> scene                                             |
      |                                                               |
      | scene-1     = framing / overview                              |
      | scene-2..n  = outlet-based scenes                             |
      | final scene = synthesis / open question                       |
      +------------------------------+--------------------------------+
                                     |
                 +-------------------+-------------------+
                 |                                       |
                 v                                       v
   +-------------------------------+       +-------------------------------+
   | keep full paragraph           |       | write distilled visual layer  |
   | body = archival / narration   |       | by editorial judgment         |
   +---------------+---------------+       +---------------+---------------+
                   |                                       |
                   |                                       +-----------------------------+
                   |                                                                     |
                   |                         +------------------+------------------+      |
                   |                         |                  |                  |      |
                   |                         v                  v                  v      |
                   |                  +-------------+   +-------------+   +-------------+|
                   |                  | headline    |   | summary     |   | quote       ||
                   |                  | 1 takeaway  |   | 1 sentence  |   | sharp line  ||
                   |                  +-------------+   +-------------+   +-------------+|
                   |                                                                     |
                   +-----------------------------------+---------------------------------+
                                                       |
                                                       v
                                 +----------------------------------------+
                                 | add outlet identity if applicable      |
                                 | name + key + logo                      |
                                 | no outlet for framing/synthesis scenes |
                                 +-------------------+--------------------+
                                                     |
                                                     v
                                +-----------------------------------------+
                                | structured BRIEFING scene object        |
                                |                                         |
                                | id                                      |
                                | shortLabel                              |
                                | title                                   |
                                | body                                    |
                                | visual.headline                         |
                                | visual.summary                          |
                                | visual.quote                            |
                                | outlet?                                 |
                                +-------------------+---------------------+
                                                    |
                                                    v
                          +------------------------------------------------------+
                          | renderer / HTML / Remotion                           |
                          | shows the distilled visual layer on screen           |
                          | does not invent the editorial angle live             |
                          +------------------------------------------------------+

Full editorial content rule of thumb:
  one paragraph
      -> one scene
      -> one dominant thesis
      -> one readable on-screen takeaway
```

## Quote Duel Memory
- The agreed name for this alternate daily format is `The Quote Duel`.
- `The Quote Duel` is a parallel format and must not replace or redefine `full editorial content`.
- This format is event-first, not paragraph-first.
- One scene should center one event and pair two opposing outlets.
- Each scene should present:
  - one event label
  - one quote on the left
  - one quote on the right
  - one short contrast line naming the fault line
- The scene should not depend on narration.
- The contrast between the two direct quotes is the content.
- Prefer this format when one day produces unusually sharp rhetorical opposition across outlets.
- The current example pair to remember is:
  - `تحرير ثالث آتٍ`
  - `سقوط أخلاقي`
- Keep the scene visually confrontational and readable for Reels/Shorts.
- Do not add back long body text, helper notes, or a secondary analysis block inside the duel scene unless requested.
- The current quote-duel prototype is:
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\radar-beirut-quote-duel.html`

### Quote Duel ASCII Diagram
```text
+--------------------------------------------------------------+
| daily briefing source material                               |
| articles, notes, extracted press language                    |
+------------------------------+-------------------------------+
                               |
                               v
                    +----------------------+
                    | choose one event     |
                    | with strong fracture  |
                    +----------+-----------+
                               |
                               v
      +---------------------------------------------------------------+
      | event -> duel scene                                            |
      |                                                               |
      | scene-1 = event A + outlet left + outlet right                |
      | scene-2 = event B + outlet left + outlet right                |
      | scene-n = next strongest confrontation                        |
      +------------------------------+--------------------------------+
                                     |
                 +-------------------+-------------------+
                 |                                       |
                 v                                       v
   +-------------------------------+       +-------------------------------+
   | select left-side outlet       |       | select right-side outlet      |
   | extract one direct quote      |       | extract one direct quote      |
   +---------------+---------------+       +---------------+---------------+
                   |                                       |
                   +-------------------+-------------------+
                                       |
                                       v
                        +-------------------------------+
                        | write duel framing layer      |
                        | eventLabel                    |
                        | contrastLabel                 |
                        | summary (short)               |
                        +---------------+---------------+
                                        |
                                        v
                       +--------------------------------------+
                       | structured QUOTE_DUEL scene object   |
                       |                                      |
                       | id                                   |
                       | eventLabel                           |
                       | contrastLabel                        |
                       | left.outlet                          |
                       | left.quote                           |
                       | right.outlet                         |
                       | right.quote                          |
                       | summary                              |
                       +------------------+-------------------+
                                          |
                                          v
                    +-----------------------------------------------+
                    | renderer / HTML / vertical video prototype    |
                    | shows quote-vs-quote confrontation directly   |
                    | no narration required                         |
                    +-----------------------------------------------+

Quote Duel rule of thumb:
  one event
      -> one scene
      -> two opposed outlets
      -> two direct quotes
      -> one clear ideological clash
```

## Multi-Image Outlet Content Memory
- In `full editorial content`, an outlet scene may use an ordered list of article screenshots in the main content area instead of a text fallback.
- This is especially expected for `asas-media` and `almodon` when daily article screenshots are available.
- The screenshot list should rotate during that outlet's scene timespan, not appear all at once.
- If multiple screenshots exist for one outlet in the date folder, prefer showing them in sequence inside the main image box.
- If only one image exists for that outlet, treat it as the single visual asset for that scene.
- If no image exists for that outlet, fall back to the short excerpt text block with no helper label.
- Article screenshots should fit in contained mode inside the outlet image box rather than being cropped like full newspaper front pages.
- For generated daily folders, prefer outlet-specific filenames that include the outlet alias and an ordered suffix such as:
  - `asasmedia_article_01.jpg`
  - `asasmedia_article_02.jpg`
  - `almodon_article_01.jpg`
- The shared builder should auto-detect those ordered images from the date folder and embed them into the outlet scene.

## Timing Config Memory
- Each briefing folder should have a generated `output/timing-config.json` file.
- `output/timing-config.json` is the manual source of truth for non-audio timing after the first build.
- Intro timing is the exception: the builder should refresh all format `introSeconds` values from `templates/radar-beirut-into-audio-new.mp3` duration plus `0.5s`.
- Intro text reveal timing is also refreshed by the builder and should stay `3s` before intro end.
- The builder should create `output/timing-config.json` if it does not already exist.
- After manual edits to `output/timing-config.json`, rerun:
  - `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD`
- For `full editorial content`, the generated HTML should follow `scene.durationSeconds` from the built data and should not override them with a hardcoded per-scene timing map.
- Default timings may start from editorial heuristics, but final timings belong in `output/timing-config.json`.
- Outlet scene timings synced from generated WAV files should use the WAV duration plus a default `0.5s` buffer for smoother transitions.

## Briefing Audio Memory
- The briefing audio feature uses Hamsa text-to-speech through `audio/generate-outlet-audio.mjs`.
- The npm entrypoint is:
  - `npm run audio:outlets -- --date YYYY-MM-DD`
- The script reads built full-editorial data from:
  - `briefings/YYYY-MM-DD/output/briefing.json`
- The script writes generated audio artifacts directly to:
  - `briefings/YYYY-MM-DD/audio/`
- Do not put generated briefing audio under `briefings/YYYY-MM-DD/output/audio/`.
- Each outlet scene should get one WAV file named by scene id and outlet key, for example:
  - `briefings/YYYY-MM-DD/audio/scene-2-alakhbar.wav`
- The closing/synthesis scene and full-editorial outro should also get WAV files, even though they have no outlet mapping.
- Current non-outlet filenames use:
  - `briefings/YYYY-MM-DD/audio/scene-11-scene-11.wav`
  - `briefings/YYYY-MM-DD/audio/outro-open-question.wav`
- Existing outlet WAV files are reused by default and should not be regenerated unless `--force` is explicitly used.
- Use `--existing-only` to refresh `audio/manifest.json` from files already present without calling Hamsa for missing outlets.
- Use `--first` only for one-audio smoke tests; do not leave a full-date manifest limited to one scene unless intentionally testing.
- The default Hamsa voice is `Lamees`, Lebanese dialect `leb`, with realtime TTS endpoint:
  - `https://api.tryhamsa.com/v1/realtime/tts`
- Hamsa auth uses:
  - `Authorization: Token <API key>`
- The script resolves `Lamees` through the Hamsa voice catalog and may record the resolved voice id in the manifest.
- `audio/manifest.json` is the integration surface for later pipeline work.
- The manifest should include:
  - `audioByOutlet`
  - `audioByScene`
  - full `entries`
- Each audio record should include:
  - outlet key if the scene has one, otherwise `null`
  - outlet name or non-outlet label
  - scene id
  - audio path
  - generated audio duration
  - status such as `generated`, `reused`, `missing`, or `dry-run`
- Missing audio entries should remain in the manifest with `durationSeconds: null` and `status: "missing"` when using `--existing-only`.

## Fault Line Map Memory
- The agreed name for this alternate daily format is `Fault Line Map`.
- `Fault Line Map` is a parallel format and must not replace or redefine `full editorial content`.
- This format is axis-first, not paragraph-first.
- The current Fault Line Map intro hero title is `خريطة الانقسام`.
- Do not revert the intro title to `خريطة خط الانقسام` unless explicitly requested.
- The axis is not universal or permanent.
- `Fault Line Map` must define a fresh day-specific fault line for each briefing date.
- The scene should answer where each outlet landed on the day's main ideological line, not restage a full editorial card for each one.
- The editorial question is:
  - what was the most revealing line of fracture today?
  - not what is the most permanent Lebanese political divide in general
- The daily axis definition lives in:
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\fault-line-map-script.json`
- That daily axis should define:
  - `axis.id`
  - `axis.label`
  - `axis.headline` if needed
  - `axis.leftPole`
  - `axis.rightPole`
- The current June 1, 2026 example axis is:
  - left pole = `التصعيد المفتوح`
  - right pole = `الاحتواء الدبلوماسي`
- Each outlet entry should carry:
  - outlet identity
  - normalized `position` from `0` to `1`
  - short `stanceLabel`
  - short `rationale`
  - short `quote`
- The current generated source files for this format are:
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\fault-line-map-script.json`
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\fault-line-map.json`
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-fault-line-map-html.mjs`
- The current generated HTML output is:
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\radar-beirut-fault-line-map.html`
- The launcher can rebuild this format before selecting it.
- The visual payoff is the synthesis scene where all markers remain visible on the line together.
- Prefer this format when the key editorial story of the day is polarization, clustering, or ideological distance between outlets.
- If the same permanent axis would work every day, it is probably the wrong axis for this format.
- Avoid reintroducing long body copy blocks inside this format unless requested.

### Fault Line Map ASCII Diagram
```text
+--------------------------------------------------------------+
| briefing_YYYY-MM-DD.txt                                      |
| long-form editorial briefing                                 |
+------------------------------+-------------------------------+
                               |
                               v
                    +----------------------+
                    | prepare-briefing.mjs |
                    | builds shared scenes |
                    +----------+-----------+
                               |
                               +----------------------------------+
                               |                                  |
                               v                                  v
               +-------------------------------+    +-------------------------------+
               | briefing.json                 |    | fault-line-map-script.json    |
               | paragraph scenes + visuals    |    | daily axis + positions        |
               +---------------+---------------+    +---------------+---------------+
                               |                                    |
                               +-------------------+----------------+
                                                   |
                                                   v
                            +-------------------------------------------+
                            | merge scene meaning with axis metadata    |
                            | outlet + position + stance + quote        |
                            +-------------------+-----------------------+
                                                |
                                                v
                            +-------------------------------------------+
                            | fault-line-map.json                       |
                            | generated data for the format             |
                            +-------------------+-----------------------+
                                                |
                                                v
                          +--------------------------------------------------+
                          | build-fault-line-map-html.mjs                    |
                          | embeds generated JSON into standalone HTML        |
                          +-------------------+------------------------------+
                                              |
                                              v
                      +------------------------------------------------------+
                      | radar-beirut-fault-line-map.html                     |
                      | format-specific generated HTML output                |
                      +------------------------------------------------------+

Fault Line Map rule of thumb:
  one briefing day
      -> one day-specific axis
      -> one plotted position per outlet
      -> one synthesis map showing the day's ideological geography
```

## Keyword Radar Memory
- The agreed name for this alternate daily format is `The Keyword Radar`.
- `The Keyword Radar` is a parallel format and must not replace or redefine `full editorial content`.
- This format is term-first, not paragraph-first.
- One scene should center one outlet through `3` to `4` loaded terms extracted from that outlet's language.
- The terms should reveal one by one with a pulse or radar-lock animation.
- The scene should work even if the viewer only reads the terms and nothing else.
- The outlet's rhetorical vocabulary is the content.
- The intro should follow the latest shared intro structure:
  - same ambient radar / map / scan motion language
  - no extra subtitle line unless explicitly requested
  - only the format-specific title should be added to the shared intro direction
- Prefer this format when the day is best understood through repeated ideological wording, demonizing language, slogans, or highly charged framing terms.
- Each outlet scene should present:
  - outlet identity
  - one short scene label or framing line
  - `3` to `4` keywords or phrases
  - optional short footer-sized interpretation only if needed for clarity
- Keep the scene visually sparse and high-impact.
- Do not add back long body text, helper notes, or paragraph summaries inside the keyword scene unless requested.
- The reveal order matters:
  - strongest or most ideologically loaded phrase first
  - remaining phrases should escalate or widen the rhetorical frame
- The closing synthesis scene should place all terms on one radar field at once.
- In the closing scene, cluster terms by ideological family rather than by outlet chronology.
- This format currently ends on the clustered synthesis scene.
- Do not add a separate question-style outro card unless requested.
- Example outlet term sets to remember for the current discussion:
  - `الأخبار`: `سلطة الاحتلال` / `عملاء وقتلة` / `اللوبي اللبناني-الأمريكي`
  - `نداء الوطن`: `إسناد خامنئي` / `السقوط الأخلاقي` / `ضباط إسرائيليون`
- Recommended structure for the source data:
  - one day-level `clusters` definition for the synthesis scene
  - one per-outlet scene entry with ordered `terms`
  - optional `family` tag per term for clustering
- Recommended implementation path:
  - keep `radar-beirut-intro.html` as the shared intro reference
  - create a dedicated prototype output such as `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\radar-beirut-keyword-radar.html`
  - if generated, create a dedicated data source and build script instead of forcing the logic into `radar-beirut-briefing.html`
- The current generated source files for this format are:
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\keyword-radar-script.json`
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\src\data\keyword-radar.json`
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\build-keyword-radar-html.mjs`
- The current generated HTML output is:
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\radar-beirut-keyword-radar.html`
- The launcher can rebuild this format before selecting it.
- Working rule: one outlet
  -> one scene
  -> three or four charged terms
  -> one unmistakable rhetorical signature

### Keyword Radar ASCII Diagram
```text
+--------------------------------------------------------------+
| daily briefing source material                               |
| articles, extracted lines, repeated outlet phrasing          |
+------------------------------+-------------------------------+
                               |
                               v
                    +----------------------+
                    | choose loaded terms  |
                    | per outlet           |
                    +----------+-----------+
                               |
                               v
      +---------------------------------------------------------------+
      | outlet -> keyword scene                                       |
      |                                                               |
      | scene-1 = outlet A + 3-4 loaded terms                         |
      | scene-2 = outlet B + 3-4 loaded terms                         |
      | scene-n = next outlet's rhetorical fingerprint                |
      +------------------------------+--------------------------------+
                                     |
                                     v
                     +----------------------------------+
                     | order terms by editorial force   |
                     | first hit -> strongest signal    |
                     | later hits -> escalation/context |
                     +----------------+-----------------+
                                      |
                                      v
                  +---------------------------------------------+
                  | structured KEYWORD_RADAR scene object       |
                  |                                             |
                  | id                                          |
                  | outlet                                      |
                  | sceneLabel                                  |
                  | terms[]                                     |
                  | terms[].text                                |
                  | terms[].family                              |
                  | terms[].weight?                             |
                  +----------------------+----------------------+
                                         |
                                         v
               +-------------------------------------------------------+
               | closing synthesis scene                               |
               | all terms on one radar                                |
               | grouped by ideological family / rhetorical cluster     |
               +----------------------+--------------------------------+
                                      |
                                      v
                    +-----------------------------------------------+
                    | renderer / HTML / vertical video prototype    |
                    | reveals terms one by one, then maps them      |
                    | into one clustered radar field                |
                    +-----------------------------------------------+

Keyword Radar rule of thumb:
  one outlet
      -> one scene
      -> 3-4 loaded terms
      -> one readable ideological fingerprint
```

## Briefing Format Registry
- The project now supports multiple briefing output formats through:
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\briefing-formats.json`
- The launcher script is:
  - `C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\scripts\launch-briefing-format.mjs`
- Current registered formats are:
  - `full-editorial-content`
  - `quote-duel`
  - `fault-line-map`
  - `keyword-radar`
- The current launch commands are:
  - `npm run briefing:formats`
  - `npm run briefing:launch -- full-editorial-content`
  - `npm run briefing:launch -- quote-duel`
  - `npm run briefing:launch -- fault-line-map`
  - `npm run briefing:launch -- keyword-radar`
  - `npm run briefing:generate:all -- --folder briefings/YYYY-MM-DD`
  - `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD`
  - `npm run briefing:build:fault-line-map`
  - `npm run briefing:build:keyword-radar`
  - `npm run briefing:launch -- quote-duel --open`
- The all-formats generator should:
  - prepare a Codex handoff pack for the chosen date folder
  - write the target editable analysis JSON files into that same briefing folder
  - keep generated `output/timing-config.json` so scene durations can be adjusted manually after generation
  - write the Codex AFK prompt into `output/codex-briefing-prompt.md`
  - after Codex fills the JSON files, the folder build command should generate the 4 standalone HTML outputs inside `output/`
- The Codex handoff pack currently writes:
  - `output/codex-briefing-prompt.md`
  - `visual-script.json`
  - `outlet-map.json`
  - `quote-duel.json`
  - `fault-line-map-script.json`
  - `keyword-radar-script.json`
- The folder build command currently writes:
  - `output/timing-config.json`
  - `output/briefing.json`
  - `output/fault-line-map.json`
  - `output/keyword-radar.json`
  - `output/radar-beirut-briefing.html`
  - `output/radar-beirut-quote-duel.html`
  - `output/radar-beirut-fault-line-map.html`
  - `output/radar-beirut-keyword-radar.html`

## Guided Workflow And AFK Codex Memory
- The guided workflow script is:
  - `scripts/guided-briefing-workflow.sh`
- It should support these folder inputs:
  - `briefings/YYYY-MM-DD`
  - `YYYY-MM-DD`
  - `/mnt/c/.../briefings/YYYY-MM-DD`
  - `C:\...\briefings\YYYY-MM-DD`
- When a Windows path is provided under WSL, convert it to `/mnt/c/...` for shell execution.
- Step 2 generates the handoff pack:
  - `npm run briefing:generate:all -- --folder briefings/YYYY-MM-DD`
- The generated Codex prompt should live at:
  - `briefings/YYYY-MM-DD/output/codex-briefing-prompt.md`
- The prompt should lead with WSL/project-relative paths and keep Windows paths as reference only.
- The prompt must instruct AFK Codex to edit only these project-relative analysis files:
  - `briefings/YYYY-MM-DD/visual-script.json`
  - `briefings/YYYY-MM-DD/outlet-map.json`
  - `briefings/YYYY-MM-DD/quote-duel.json`
  - `briefings/YYYY-MM-DD/fault-line-map-script.json`
  - `briefings/YYYY-MM-DD/keyword-radar-script.json`
- Do not tell AFK Codex to patch bare filenames from the repo root.
- Step 3 should run blocking AFK Codex from the repo root:
  - `codex exec --cd "$PWD" --sandbox workspace-write --skip-git-repo-check --output-last-message "$folder/output/codex-afk-final-message.md" - < "$folder/output/codex-briefing-prompt.md"`
- The workflow should wait for Codex to finish before validation or build steps continue.
- After AFK Codex finishes, validate with:
  - `npm run briefing:validate:analysis -- --folder briefings/YYYY-MM-DD`
- The validator must fail if generated placeholder JSON still has empty required fields.
- Step 4 should generate the closing summary image prompt before HTML generation:
  - `npm run briefing:image:prompt -- --folder briefings/YYYY-MM-DD`
- The summary image prompt should be written directly under:
  - `briefings/YYYY-MM-DD/output/`
- Do not create an `image-prompts/` subfolder for the summary image prompt.
- The generated closing image should be saved as:
  - `briefings/YYYY-MM-DD/output/final_summary_generated.png`
- Step 5 should build all HTML outputs after the summary image exists:
  - `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD`
- Step 5 should generate full briefing audio, not outlet-only audio:
  - outlet scene WAVs
  - closing/synthesis scene WAV
  - outro question WAV
- If `scene-11.audioText` changed but an old `scene-11` WAV still exists, the guided workflow should move the stale WAV aside before Hamsa generation so it does not reuse audio from old summary narration.
- After Step 5, HTML review is the verification gate before MP4 generation.
- The guided workflow should ask the user to review all generated HTML outputs before rendering MP4.
- After the final HTML rebuild, the guided workflow should ask the user to run the Windows render command from PowerShell or Command Prompt:
  - `npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --resolutions 540x960 --log warn`
- The guided workflow should keep asking the user to run/finish that Windows render until it finds:
  - `briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960.mp4`
- Once that MP4 exists, the guided workflow should automatically split it with:
  - `npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD --input briefings/YYYY-MM-DD/output/radar-beirut-briefing-540x960.mp4 --output-dir briefings/YYYY-MM-DD/output/scene-videos-540x960`
- The guided workflow should finish after the split scene videos are written.
- The folder build auto-wires `output/final_summary_generated.png` into `output/briefing.json` before building the full-editorial HTML.
- Outlet screenshots remain in the date folder itself, not in `output/`.
- Full-editorial HTML generated inside `output/` should reference outlet screenshots via relative parent paths such as `../aawsat_...png`.

### Project Component ASCII Map
```text
project root
|
+-- radar-beirut-intro.html
|   shared intro visual reference across formats
|
+-- templates/
|   +-- radar-beirut-briefing-template.html
|   |   full-editorial HTML shell
|   +-- radar-beirut-quote-duel-template.html
|       quote-duel HTML shell
|
+-- scripts/
|   +-- generate-all-briefing-formats.mjs
|   |   creates Codex handoff prompt and editable JSON stubs
|   +-- build-briefing-folder.mjs
|   |   merges daily sources, timing, audio, images, and builds all outputs
|   +-- build-full-editorial-html.mjs
|   |   fills the full-editorial template
|   +-- build-fault-line-map-html.mjs
|   |   generates Fault Line Map HTML directly
|   +-- build-keyword-radar-html.mjs
|   |   generates Keyword Radar HTML directly
|   +-- sync-outlet-audio-timing.mjs
|       copies WAV durations into output/timing-config.json with 0.5s buffer
|
+-- audio/
|   +-- generate-outlet-audio.mjs
|       reads output/briefing.json and writes Hamsa WAVs + manifest
|
+-- briefings/YYYY-MM-DD/
    |
    +-- editable daily sources
    |   +-- briefing_YYYY-MM-DD_corrected.txt
    |   +-- visual-script.json
    |   +-- outlet-map.json
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
        +-- codex-briefing-prompt.md
        +-- timing-config.json
        +-- briefing.json
        +-- fault-line-map.json
        +-- keyword-radar.json
        +-- final_summary_generated.png
        +-- radar-beirut-briefing.html
        +-- radar-beirut-quote-duel.html
        +-- radar-beirut-fault-line-map.html
        +-- radar-beirut-keyword-radar.html

build flow:
  corrected briefing text + folder-local JSON + screenshots
      -> scripts/build-briefing-folder.mjs
      -> output/*.json + output/*.html

audio flow:
  output/briefing.json
      -> audio/generate-outlet-audio.mjs
      -> audio/*.wav + audio/manifest.json
      -> scripts/sync-outlet-audio-timing.mjs
      -> output/timing-config.json
      -> rebuild HTML with audio links and durations

full-editorial scene flow:
  source paragraphs
      -> outlet scenes
      -> scene-11 closing/synthesis body from opening + penultimate summary
      -> scene-11 audioText from the penultimate paragraph only
      -> outro from visual-script.json.outroQuestion
```

## June 2026 Workflow Memory
- The current preferred full-editorial render flow is no longer:
  - opening scene
  - outlet run
  - synthesis scene
- The current preferred full-editorial render flow is:
  - outlet run first
  - one shared closing scene called `خلاصة المشهد`
  - open-question outro
- In the final rendered `radar-beirut-briefing.html`, do not keep paragraph 1 as a standalone displayed scene.
- Instead, use paragraph 1/opening/framing text plus the penultimate summary paragraph as the analysis/body context for the shared closing scene `خلاصة المشهد`.
- Do not append paragraph 1/opening/framing text into the shared closing scene Hamsa audio.
- The final paragraph remains the open-question outro and should not be duplicated inside the shared closing scene.
- The shared closing scene should use the final synthesis visual framing, and its long-form `body` may contain the opening paragraph plus the penultimate summary paragraph.
- The shared closing scene should carry a separate `audioText` containing only the penultimate summary paragraph; Hamsa generation should prefer `audioText` over `body`.
- The shared closing scene may use a dedicated generated illustration or poster saved inside the date folder's `output/` folder.
- The preferred source text for that generated illustration is the shared closing scene `body`, which may combine opening context plus the penultimate summary.
- In other words:
  - use opening/framing context plus the paragraph immediately before the last paragraph for scene-11 analysis and poster prompting
  - generate the closing-scene image from that combined closing-scene body
  - generate the closing-scene Hamsa WAV only from `scene-11.audioText`, which is the penultimate summary paragraph
  - use that image in the final briefing output
- Preferred filename for that generated closing-scene image is:
  - `output/final_summary_generated.png`
- When that image exists and is intentionally selected, attach it directly to `scene-11` through:
  - `scene.media.fitMode`
  - `scene.media.items`
- Do not force the closing scene to pretend it has an outlet just to render an image.
- The closing scene title should not stay a generic `خلاصة المشهد` when a stronger synthesis line is available.
- Prefer promoting the strongest sentence from the penultimate summary paragraph into the closing-scene `title`.
- For outlet scenes, the orange label beside the logo should use the scene thesis or `visual.headline`, not the outlet brand name.
- Do not repeat that same thesis as a duplicate orange box lower in the card body.
- The logo box should stay slightly shorter than earlier versions and align vertically with:
  - the thesis label
  - the colored accent bar
- The summary line should sit close under the header row, but slightly lower than the logo row.
- The main outlet image area should absorb the remaining space in the card instead of leaving an empty lower band.
- If outlet media exists in the date folder, front page or article screenshots, use it in that image area.
- If no outlet media exists, use a short excerpt fallback in the same area.
- Do not label that fallback with `من النص`.
- Front-page images should use cover behavior:
  - if taller than the box, allow vertical pan
  - if smaller than the box, scale up until the box is fully covered
- Keep outlet scenes in the `15000ms` to `20000ms` range unless the user asks otherwise.
- Keep the shared closing scene shorter than outlet scenes.
- When adjusting these behaviors in the future, prefer editing:
  - `templates/radar-beirut-briefing-template.html`
  - `scripts/build-full-editorial-html.mjs`
  - `scripts/lib/prepare-briefing-data.mjs`
  - `scripts/lib/briefing-analysis-pack.mjs`
- Encoding-safe restatement of the same rules:
  - the shared closing scene name is `خلاصة المشهد`
  - the fallback label that should stay removed is `من النص`
- Working rule for the local Codex workflow:
  - the user chooses the date folder
  - the terminal prepares the handoff pack
  - Codex fills the folder-local JSON analysis files
  - the terminal then builds the outputs from those filled files
- If the user later makes manual scene-level edits directly in `output/briefing.json`, especially:
  - closing-scene title changes
  - `scene.media` additions
  - one-off art direction for `scene-11`
  then prefer rebuilding the full-editorial HTML directly from that edited `output/briefing.json` instead of rerunning `npm run briefing:build:folder`, unless the same changes were also written back into the upstream analysis files.
- Reason:
  - `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD` regenerates `output/briefing.json`
  - so it can overwrite hand-edited closing-scene media wiring if those edits exist only in `output/briefing.json`
- Working rule for `full editorial content` daily output review:
  - outlet scenes should play first
  - the shared summary scene should come after the outlet run
  - the open-question scene should remain the final outro beat
  - if outlet media exists in the date folder, front page or article screenshots, use it in the outlet image area inside the main card
  - if no outlet media exists for that outlet, use a short text excerpt as fallback in the same area
  - do not show helper labels like `من النص` above that fallback text
  - do not show the old attached quote box below the outlet image area
  - the outlet image area should fit inside the main card rather than overflow it
  - if the front page is taller than the available image area, prefer a vertical pan through the page over a forced static crop
  - each outlet scene should run no less than `15000ms` and no more than `20000ms`
- Working rule for a generated closing-scene poster pass:
  - after Codex fills the analysis JSON, generate an image prompt from the generated summary scene data
  - use:
    - `npm run briefing:image:prompt -- --folder briefings/YYYY-MM-DD`
  - generate the image from that prompt in Codex/ChatGPT image generation
  - save it in the date folder's output folder as `output/final_summary_generated.png` unless the user explicitly wants another name
  - `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD` auto-wires that image into `output/briefing.json` before HTML generation
  - do not include a prompt instruction to leave safe space in the upper third for title overlays
- Keep treating `before_formatting_output/` as storage only for the retained older intro reference.
- Keep treating `templates/` as the active shared non-intro template source for builders.
- Treat the date-folder `output/` HTML files as daily generated outputs for that briefing run.
- To add another format later, prefer this workflow:
  - keep `radar-beirut-intro.html` as the shared intro reference
  - create a dedicated HTML output prototype for that format
  - add a new entry to `briefing-formats.json`
  - if the format is generated, register a `buildCommand` for it
  - keep its editorial rules documented here in `AGENTS.md`

## Format Selection Preference
- Use `full editorial content` when the day needs paragraph-level editorial framing and the narration/archive layer matters.
- Use `The Quote Duel` when the strongest story is a direct rhetorical clash between two outlets over one event.
- Use `Fault Line Map` when the editorial value comes from plotting relative positions across one day-specific ideological axis.
- Use `The Keyword Radar` when the clearest signal is repeated loaded vocabulary, slogans, or ideological word choice by outlet.
- These formats are parallel options, not upgrade stages.
- Do not treat any alternate format as replacing the underlying `full editorial content` workflow.

### Briefing Formats ASCII Diagram
```text
+--------------------------------------------------------------+
| radar-beirut-intro.html                                      |
| shared intro reference                                       |
+------------------------------+-------------------------------+
                               |
                               v
              +-------------------------------------------+
              | choose daily briefing output format       |
              | per editorial need                        |
              +-------------------+-----------------------+
                                  |
      +---------------------+---------------------+---------------------+----------------------+
      |                     |                     |                     |                      |
      v                     v                     v                     v
+-------------------+ +-------------------+ +-------------------+ +------------------------+
| full editorial    | | The Quote Duel    | | Fault Line Map    | | The Keyword Radar     |
| content           | | event-first       | | axis-first        | | term-first rhetorical |
|                   | | clashes           | | plotting          | | fingerprinting        |
+---------+---------+ +---------+---------+ +---------+---------+ +-----------+------------+
          |                     |                     |                       |
          v                     v                     v                       v
+-------------------+ +-----------------------+ +-------------------------------+ +-------------------------------+
| radar-beirut-     | | radar-beirut-quote-   | | radar-beirut-fault-line-map  | | radar-beirut-keyword-radar   |
| briefing.html     | | duel.html             | | .html                         | | .html                        |
+-------------------+ +-----------------------+ +-------------------------------+ +-------------------------------+

Rule of thumb:
  same intro reference
      -> many possible briefing formats
      -> one HTML output per format
```
