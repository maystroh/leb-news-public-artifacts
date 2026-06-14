# Dashboard Step 16 — Package video type + split clips + social copy into a zip

Date: 2026-06-13
Status: Approved (design)

## Problem

After the daily briefing is rendered, muxed, downloaded, and split (steps 12–15), the
publishable artifacts are scattered in `output/`: a full `*-final.mp4` per video type and
per-type `scene-videos[-hook-*]/` folders of per-scene clips. To publish them, the operator
needs, per video type, a single shareable bundle that also carries the social copy:

- Instagram captions + hashtags **per clip**, mapping each clip's filename to the outlet it
  covers, the daily tone, and what that outlet said.
- One full **YouTube description** + hashtags for the full video (the full video is shared on
  YouTube).

Today none of this exists; the operator assembles it by hand.

## Goal

Add **Step 16** to the briefing dashboard: select one or more video types and produce one
zip per type containing the full MP4, its split scene clips, a per-clip Instagram caption
file beside each clip, and a YouTube description file.

## Non-goals

- No changes to rendering, muxing, splitting, or any step 1–15 behavior.
- No automatic posting to Instagram/YouTube — this only produces copy-paste-ready files.
- No new server-side (ssh) path. Everything in step 16 runs locally, because by step 16 the
  final MP4s and clips have already been downloaded to local `output/` (steps 14–15).

## Decisions (resolved during brainstorming)

| Decision                               | Choice                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| How social copy is produced            | **Codex AFK (LLM)** reading existing JSON                                       |
| Packaging when multiple types selected | **One zip per type**                                                            |
| Zip contents                           | Full final MP4 + split clips + per-clip hashtag file + YouTube description file |
| Step actions                           | **Two actions**: generate (Codex) then package (zip)                            |
| Per-clip caption file format           | **One `.txt` per clip** + one combined index file                               |
| Instagram hashtag language             | **Arabic + English mix**                                                        |
| Zip tooling                            | **`archiver` npm dependency** (Node-native, no CLI/PATH dependency)             |
| Codex host                             | **Local-only**                                                                  |

## Architecture

### Component 1 — caption generation (Action A, Codex, local)

A new prompt-builder + a Codex run + a validator, mirroring the existing
"generate prompt → codex exec → validate" pattern (steps 2–3).

- `scripts/build-social-captions-prompt.mjs --folder briefings/<date>`
  Reads `output/briefing.json` (scene id, `outlet.name`, `visual.headline` tone tag,
  `visual.summary`), `output/keyword-radar.json` (per-scene `terms[]`),
  `visual-script.json` (`outroQuestion`, for the closing clip's context), and a scene-videos
  manifest (clip `fileName` ↔ `sceneIds`). Writes `output/social-captions-prompt.md`
  instructing Codex to emit `output/social-captions.json`.

  **Per-scene input extraction.** Most scenes carry `outlet.name` (the outlet) and
  `visual.headline` (a 2–3 word tone tag). The **closing scene (`scene-11`)** has
  `outlet: null` and uses `visual.headline`/`title` as its *label* (`خلاصة المشهد`), not a
  tone tag — for it the builder falls back to `title`/`visual.headline` for the name and
  marks it as the closing recap (no outlet). The closing scene also has **no
  `keyword-radar.json` entry** (verified: `keyword-radar.json` has no `scene-11`), so the
  builder/prompt must tolerate an empty `terms[]` for that scene. The closing clip
  (`10-scene-11-outro`) also bundles the outro, so the builder feeds
  `visual-script.json.outroQuestion` into that scene's prompt context.

  **Manifest selection.** A date may have any subset of `scene-videos/`,
  `scene-videos-hook-captions/`, `scene-videos-hook-stamps/` (e.g. only a hook variant was
  split). The mappings are identical across variants, so the builder reads the **first
  present** `scene-videos*/manifest.json`. It errors (pointing at step 15) only when none
  exist.
- Codex run: `codex exec --cd <repoRoot> ... -` with the prompt on stdin (same invocation
  shape as step 3), writing `output/social-captions.json`.
- `scripts/validate-social-captions.mjs --folder briefings/<date>`
  Validates the schema below and that every scene present in `briefing.json` has a clip entry.

The captions are generated **once per date** and reused across all video types: clip
filenames and scene mapping are identical across `scene-videos/`,
`scene-videos-hook-captions/`, and `scene-videos-hook-stamps/` (the variants differ only in
pixels). The YouTube description is likewise one per date.

#### `output/social-captions.json` schema

```jsonc
{
  "date": "2026-06-13",
  "generatedAt": "<iso>",
  "youtube": {
    "title": "string",
    "description": "string (multi-paragraph; daily tone + per-outlet recap)",
    "hashtags": ["#...", "..."]
  },
  "clips": [
    {
      "sceneId": "scene-3",
      "outlet": "اللواء",             // Arabic outlet name (closing scene: e.g. "خلاصة المشهد")
      "caption": "string (1–3 lines, the post body for this clip)",
      "hashtags": ["#لبنان", "#Lebanon", "..."]  // Arabic + English mix
    }
    // ... one entry per scene in briefing.json (scene-2 … scene-11)
  ]
}
```

Entries are keyed solely on `sceneId`. The packager matches each manifest segment to its
entry by `sceneIds[0]` and derives the clip filename (incl. the `NN-` prefix and
intro/outro grouping) deterministically from the manifest — Codex never reproduces
filenames, so there is no `clipBaseName` field to get wrong.

### Component 2 — packaging (Action B, local)

- `scripts/package-social-zip.mjs --folder briefings/<date> --input <final.mp4> --scene-dir <dir> --output <zip>`
  Reads `output/social-captions.json` and the `<scene-dir>/manifest.json`. For each manifest
  segment, looks up its caption entry by `sceneId` (segment `sceneIds[0]`), and assembles a
  zip with `archiver`.

#### Zip layout (one per video type)

```
radar-beirut-briefing-hook-captions-2026-06-13.zip
├── radar-beirut-briefing-hook-captions-final.mp4   # full video, at root
├── youtube-description.txt                          # title + description + hashtags
├── instagram-captions-index.txt                     # every clip's caption, top to bottom
└── scenes/
    ├── 01-intro-scene-2.mp4
    ├── 01-intro-scene-2.txt   # outlet name + caption + hashtags
    ├── 02-scene-3.mp4
    ├── 02-scene-3.txt
    └── ...
```

Each clip `.txt` body:

```
Outlet: <outlet name>
<caption>

<hashtags joined by space>
```

Zip file name: `radar-beirut-briefing[-hook-<variant>]-<date>.zip`, written to `output/`.

### Component 3 — dashboard step (`dashboard/steps.mjs`)

Appended after step 15 in `baseSteps`. Reuses the existing `finalVideoVariants(ctx)` helper,
which already enumerates each `*-final.mp4` and its matching `scene-videos[-suffix]/` dir.

- **Action `generate`** — "Generate social captions (Codex)": commands =
  `[build-social-captions-prompt.mjs, codex exec (stdinFile = prompt), validate-social-captions.mjs]`.
  No variant options.
- **Action `package`** — "Package zip(s)": mirrors step 15's three-case selector logic
  (`steps.mjs` lines 740–780):
  - **>1 variant present** — multi-select `options` over the present variants, defaulting to
    all; commands = one `package-social-zip.mjs` per selected variant.
  - **exactly 1 variant** — no selector; packages that variant.
  - **0 variants** — no selector; still emits one `package-social-zip.mjs` command with the
    bare `scene-videos`/`*-final.mp4` paths so it fails loudly with the script's
    missing-input message (matching step 15's fallback).
  - All paths additionally fail loudly if `social-captions.json` is missing (run Action A
    first).

**Shared zip-name helper.** A single function `socialZipName(mid, date)` →
`` `radar-beirut-briefing${mid}-${date}.zip` `` (where `mid` is the variant suffix from
`finalVideoVariants`, e.g. `''`, `'-hook-captions'`) is used by both the package command
builder (`--output`) and `status()`, so the predicted and written names never drift.

`artifacts()` lists `social-captions.json`, `social-captions-prompt.md`, and the predicted
zip per present variant.

`status(stepState, state)`:
- `pending` — `social-captions.json` does not exist.
- For each present variant, expect `output/${socialZipName(mid, date)}`. `done` when every
  present variant has a zip newer than both its `*-final.mp4` and `social-captions.json`;
  `stale` when a final MP4 or `social-captions.json` is newer than its zip (rebuild needed);
  `pending` when some expected zip is missing.

### npm scripts (`package.json`)

```
"briefing:social:prompt":   "node ./scripts/build-social-captions-prompt.mjs",
"briefing:social:validate": "node ./scripts/validate-social-captions.mjs",
"briefing:social:zip":      "node ./scripts/package-social-zip.mjs"
```

New dependency: `archiver`.

## Data flow

```
briefing.json ─┐
keyword-radar.json ─┤
visual-script.json ─┼─> build-social-captions-prompt.mjs ─> social-captions-prompt.md
scene-videos*/manifest.json ─┘  (first present)                     │
                                                                     v
                                            codex exec ──> social-captions.json
                                                                     │  (validate)
                                                                     v
 *-final.mp4 + scene-videos[-hook-*]/ ──> package-social-zip.mjs ──> output/<type>-<date>.zip
```

## Error handling

- `build-social-captions-prompt.mjs`: error if `briefing.json` is missing, or if **no**
  `scene-videos*/manifest.json` exists (split not run yet — point at step 15). Missing
  `visual-script.json` or an absent `scene-11` keyword entry are tolerated (closing clip
  context is best-effort).
- `validate-social-captions.mjs`: non-zero exit listing any scene present in `briefing.json`
  that is missing a clip entry, malformed/empty hashtags, or an empty YouTube description.
  An empty `terms[]` for the closing scene is **not** an error. The dashboard action fails on
  non-zero.
- `package-social-zip.mjs`: error if `social-captions.json`, the `--input` MP4, or the
  `--scene-dir` is missing. A scene clip with no matching caption entry is a hard error
  (caption set is stale relative to the split) rather than a silent skip.
- Re-running packaging overwrites the existing zip for that variant.

## Testing

- Unit-ish: run `package-social-zip.mjs` against an existing date (e.g. `2026-06-12`) that
  already has `scene-videos/` and a final MP4, with a hand-written `social-captions.json`;
  assert the zip opens and contains the expected members (full MP4, `youtube-description.txt`,
  `scenes/NN-*.mp4` + matching `.txt`, `instagram-captions-index.txt`).
- `validate-social-captions.mjs`: feed a JSON missing a scene → expect non-zero + message.
- Dashboard: load a date with finals+clips present, confirm step 16 renders, Action A
  produces `social-captions.json`, Action B produces one zip per selected variant, and the
  status transitions pending → done → stale (touch a final MP4).

## Documentation

- CLAUDE.md: add Step 16 to the dashboard step list and the npm command/Build Script Map
  sections; note `output/social-captions.json` is editable and survives between zips.
- dashboard/README.md: document step 16.
```

## Files added/changed

- add `scripts/build-social-captions-prompt.mjs`
- add `scripts/validate-social-captions.mjs`
- add `scripts/package-social-zip.mjs`
- edit `dashboard/steps.mjs` (append step 16)
- edit `package.json` (+3 scripts, +`archiver` dep)
- edit `CLAUDE.md`, `dashboard/README.md`
