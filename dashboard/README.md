# Briefing Workflow Dashboard

Local web UI that runs and tracks every step of the guided daily briefing
workflow (`scripts/guided-briefing-workflow.sh`) per `briefings/YYYY-MM-DD`
folder, including server sync/render and per-scene audio regeneration.

## Launch

```bash
npm run briefing:dashboard
```

Open **http://127.0.0.1:4600**. The first launch builds the React frontend
automatically (one-time). The server binds to `127.0.0.1` only — it is not
reachable from other machines.

## Stop

Press **Ctrl+C** in the terminal where `npm run briefing:dashboard` is running.
If it was started in the background (or you lost the terminal), kill it with:

```bash
pkill -f "node ./dashboard/server.mjs" || pkill -f "dashboard/server.mjs"
```

Stopping is always safe: no state is held in memory — progress lives on disk in
the date folder, so relaunching shows the same statuses. Only avoid stopping
while a long step (Codex AFK, server render) is mid-run, since that kills the
spawned command too.

Other commands:

| Command | Purpose |
|---|---|
| `npm run briefing:dashboard` | start server (API + built frontend) on :4600 |
| `npm run briefing:dashboard:build` | rebuild frontend after editing `dashboard/web/` |
| `npm run briefing:dashboard:dev` | Vite dev server on :4601 with hot reload (proxies `/api` and `/briefings` to :4600 — run the server too) |

## Using it

1. Pick a date in the header dropdown (defaults to the newest `briefings/` folder).
2. Work down the step cards. Each card has:
   - a status badge — green **Done**, red **Failed**, blue **Running**, gray
     **Pending**, amber **Stale / Needs attention** (with an explanation line)
   - the artifact files the next step depends on, with ✓/✗ and mtimes;
     HTMLs, images, MP4s, and prompts are clickable
   - a Run/Verify button and a collapsible live log showing only that step's output
3. Manual steps:
   - **Step 5 (closing image):** generate the image yourself from the prompt,
     save it as `output/final_summary_generated.png`, press **Verify image**.
   - **Step 9 (HTML review):** open the four HTML links, then **Mark reviewed**.
     The flag goes stale automatically if outputs are rebuilt afterwards.
4. Server steps (11–14) run rsync/ssh against the render server and stream
   output live. The muted render (step 12) is the long one.
5. **Step 16 (social zip):** _Generate social captions (Codex)_ writes an
   editable `output/social-captions.json` (per-clip Instagram captions/hashtags +
   one YouTube description for the full video) — review/tweak it, then
   _Package zip(s)_ builds one `radar-beirut-briefing[-hook-<variant>]-<date>.zip`
   per selected video type (full MP4 + split clips + a caption `.txt` beside each
   clip + `youtube-description.txt` + a combined index). Captions are generated
   once and reused across types; re-zipping never re-calls Codex.
6. Only one run can be active per date at a time.

## Creating a date from the data server (remote-sync)

The **+ New date (today)** button in the header creates `briefings/<today>/` and
flags it as a *remote-sync* date (a `remoteSync` marker in its
`dashboard-state.json`). Remote-sync dates get two extra steps at the top and
keep the normal pipeline locked until the briefing is in:

- **Step 0 — Sync briefing from data server:** `rsync` pulls
  `<DATA_SERVER_HOST>:<DATA_SERVER_ROOT>/<date>/briefings/` into
  `briefings/<date>/`. If the server has not produced that folder yet the step
  fails (red) — just re-run it later. After a successful pull it records the
  last-sync time and checks readiness: the source `briefing_<date>.txt` plus at
  least one image per outlet. Until both are present the step is amber and the
  rest stay locked.
- **Step 00 — Correct briefing & resync:** create/edit
  `briefing_<date>_corrected.txt` locally, then press **Correct / resync** to
  `rsync` that one file back to the same server location.

Steps 1–15 unlock only once Step 0 is ready **and** the corrected file exists.
This applies **only** to dates made with the button — existing and
manually-created `briefings/` dates are unchanged (no steps 0/00, no locking).

## Scene narration panel

Below the pipeline, every narration scene (from `output/briefing.json`: outlet
scenes, closing scene, outro question) gets a row with the **exact text Hamsa
will read**, an editable RTL text area, and — once a WAV exists — an inline
player and a **Regenerate** button.

**Check/edit the script BEFORE step 7:** the panel appears as soon as step 6
builds `briefing.json`, before any audio exists. Edit a scene's text and press
**Save text**; edits are stored in `briefings/DATE/audio/text-overrides.json`
(keyed by scene id) and survive `briefing:build:folder` rebuilds. The generator
(`audio:outlets`) prefers an override over the briefing text and marks the
manifest entry `textSource: "override"`. **Reset to briefing text** removes the
override.

If a WAV already exists and you save different text, the row (and step 7) turn
amber — **WAV outdated** — until you regenerate that scene. Regenerate:

1. moves the current WAV to a `.stale-<timestamp>.wav` backup
2. reruns `audio:outlets` — existing WAVs are reused, so only this scene calls Hamsa
3. resyncs `timing-config.json` and rebuilds all outputs
4. compares durations and shows a verdict badge:
   - **longer — re-render needed**: scene timings shifted; the muted video is
     invalid and must be re-rendered before muxing
   - **regenerated — re-mux ok**: same length or shorter; re-running the mux is enough

## How status is derived

Filesystem first: a step is green when its expected artifacts exist and are
newer than their inputs (e.g. `briefing.json` vs the analysis JSONs, the final
MP4 vs `briefing.json`). That means progress made outside the dashboard (bash
script, PowerShell render, manual edits) is reflected when you reopen it.
Server-side steps (sync/render/mux) have no local artifact, so they use the
recorded run history instead.

Run history, the HTML-review flag, and audio regen verdicts persist in
`briefings/DATE/output/dashboard-state.json` (gitignored with the rest of the
date folder).

## Configuration

Defaults live in `dashboard/config.mjs`; override with env vars:

| Env var | Default |
|---|---|
| `BRIEFING_DASHBOARD_PORT` | `4600` |
| `RENDER_SERVER_HOST` | `hassan.alhajj@10.0.10.20` |
| `RENDER_SERVER_PORT` | `2361` |
| `RENDER_SERVER_ROOT` | `~/projects/simple-app/leb-news-public-artifacts` |
| `DATA_SERVER_HOST` | `ubuntu@ec2-54-82-171-205.compute-1.amazonaws.com` |
| `DATA_SERVER_KEY` | `~/connectionKey.pem` |
| `DATA_SERVER_ROOT` | `/home/ubuntu/lebanon-media-data/radar-codex-runs` |

Requirements: `codex` CLI in PATH for step 3, `ssh`/`rsync` for the server
steps, `HAMSA_API_KEY` in `.env` for audio generation/regeneration. The
remote-sync steps (0/00) also need `DATA_SERVER_KEY` to point at a readable
`.pem` (mode `600`) authorized for `DATA_SERVER_HOST`.

## Layout

```text
dashboard/
  server.mjs       Express server: API, SSE log streaming, static serving
  steps.mjs        step definitions (commands, artifacts, status derivation)
  runner.mjs       sequential command runner, one active run per date
  audio.mjs        manifest listing + per-scene regeneration pipeline
  config.mjs       ports, ssh host, paths
  lib/checks.mjs   asset checks, WAV duration parser, stale-audio check, duration summary
  lib/state.mjs    dashboard-state.json read/write
  web/             React + Vite frontend (dist/ is gitignored)
```
