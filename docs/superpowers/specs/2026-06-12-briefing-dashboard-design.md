# Briefing Workflow Dashboard — Design

Date: 2026-06-12
Status: approved by user

## Goal

A local-only web dashboard that runs and tracks every step of the guided briefing
workflow (`scripts/guided-briefing-workflow.sh`) per `briefings/YYYY-MM-DD` folder.
Each step is a card with a Run/Verify button, its own streamed log, a pass/fail
status, and the artifact files that matter for the next step. Reopening the
dashboard shows current progress because status is derived from the filesystem,
not just from run history. Server sync, server render, server mux, and final MP4
download are all driven from the dashboard over ssh/rsync.

## Stack (user choice)

- Backend: Express (`dashboard/server.mjs`), binds 127.0.0.1:4600.
- Frontend: React + Vite (`dashboard/web/`), built to `dashboard/web/dist`,
  served statically by Express. `npm run briefing:dashboard` auto-builds when
  `dist/` is missing.
- Live logs: Server-Sent Events (`/api/events?date=...`).
- One active run per date at a time.

## Steps (cards)

1. Assets check (verify): paragraphs vs unique outlet image keys (keys = paragraphs − 3).
2. Generate Codex handoff pack (`briefing:generate:all`).
3. Codex AFK (`codex exec` fed the generated prompt) + analysis validator.
   Secondary action: validate only.
4. Summary image prompt (`briefing:image:prompt`).
5. Save closing image (verify `output/final_summary_generated.png`, stale if older than prompt).
6. First build (`briefing:build:folder`) + stale closing-audio check (ported from bash).
7. Audio generation (`audio:outlets`). Secondary action: `--existing-only` manifest refresh.
8. Timing sync (`sync-outlet-audio-timing.mjs`) + rebuild.
9. HTML review (manual): links to the four generated HTMLs, "Mark reviewed" persisted; goes stale if briefing.json changes after review.
10. Final rebuild + duration summary (ported from bash).
11. Sync to render server (ssh mkdir + rsync).
12. Render on server (ssh, muted render, long-running stream).
13. Mux audio on server (ssh).
14. Download final MP4 (rsync back).
15. Split scene videos (`briefing:split:mp4` on the final MP4).

## Status model

`done` (green) / `failed` (red) / `running` (blue) / `pending` (gray) /
`stale`-`attention` (amber). Filesystem artifacts are the primary truth
(exists + mtime ordering); `briefings/DATE/output/dashboard-state.json` stores
run history, review flags, and audio regen results. Server-side steps
(11–13) are state-based since their artifacts live remotely.

## Per-scene audio panel (user requirement)

Lists every `audio/manifest.json` entry: scene id, outlet, RTL text snippet,
duration, inline `<audio>` player (briefings dir served statically), and a
Regenerate button. Regenerate = move WAV to `.stale-<ts>` backup → rerun
`audio:outlets` (reuse-by-default regenerates only the missing WAV) → timing
sync → rebuild → compare durations. Longer than before ⇒ amber warning that the
muted video is invalidated (re-render needed); same/shorter ⇒ re-mux is enough.

## Out of scope

Local Windows render orchestration (still run from PowerShell; dashboard
detects the resulting muted/final MP4 via filesystem status), multi-user
access, auth, remote hosting.
