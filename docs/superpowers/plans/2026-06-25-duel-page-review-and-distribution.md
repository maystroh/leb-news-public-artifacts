# Quote Duel page: review gates + shorts distribution — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the dashboard Quote Duel page into local-first review gates (text → audio → HTML, verified before any server contact), add a per-duel narration editor, make social captions a single step shared across both pages, and move multi-platform shorts distribution (Reels/Shorts/TikTok + phone transfer) from the main dashboard to the duel page.

**Architecture:** Dashboard-only change. The spoken-text precedence already in `scripts/generate-quote-duel-audio.mjs` is extracted into a shared module so the editor and the TTS generator agree. New duel-scoped override + posting helpers mirror the existing briefing scene-narration machinery in `dashboard/audio.mjs` / `dashboard/server.mjs`. The two dashboard pages stop being a strict mutual-exclusion filter so a social-captions step can appear on both.

**Tech Stack:** Node ESM (`.mjs`), `node --test` (node:test / node:assert), Express (`dashboard/server.mjs`), React + Vite (`dashboard/web/`).

**Spec:** `docs/superpowers/specs/2026-06-25-duel-page-review-and-distribution-design.md`

---

## File Structure

**Create:**
- `scripts/lib/duel-narration-text.mjs` — shared `formatDuelAudioText` / `defaultDuelText` / `duelTextSource` + `resolveDuelId`.
- `scripts/validate-duel-social-captions.mjs` — validator for `output/quote-duel-social-captions.json`.
- `tests/duel-narration-text.test.mjs` — unit tests for the shared module.
- `tests/duel-narration-entries.test.mjs` — unit tests for `duelNarrationEntries` + duel overrides.
- `tests/validate-duel-social-captions.test.mjs` — unit tests for the validator.
- `dashboard/web/src/DuelNarrationPanel.jsx` — per-duel narration editor.
- `dashboard/web/src/DuelPostingPanel.jsx` — multi-platform shorts distribution + phone transfer.

**Modify:**
- `scripts/generate-quote-duel-audio.mjs` — import the shared text module instead of local copies.
- `dashboard/audio.mjs` — add `loadDuelTextOverrides` / `saveDuelTextOverride` / `duelNarrationEntries`.
- `dashboard/server.mjs` — `/api/duel/script` (GET/POST), `/api/duel/confirm`, `duelPostingState`, fold `state.duel` into `/api/state`, phone endpoints accept `kind: 'duel'`.
- `dashboard/steps.mjs` — replace `duel-narration` with `duel-text` / `duel-audio` / `duel-html`; reorder `duel-hooks-sync`; extend `social-package` with the duel captions chain.
- `dashboard/web/src/duelSteps.js` — new step ids + `SHARED_STEP_IDS`.
- `dashboard/web/src/DuelApp.jsx` — render `DuelNarrationPanel` + `DuelPostingPanel`, include shared steps, order cards.
- `dashboard/web/src/App.jsx` — pass duel data where needed (none new) / keep main filter; remove Instagram card usage stays in SocialPostingPanel.
- `dashboard/web/src/SocialPostingPanel.jsx` — remove the Instagram clips + phone-transfer card (YouTube only).
- `CLAUDE.md` — update the Quote Duel dashboard step list (17–25 + shared social).

**Key facts to respect (verified against code):**
- Duel override file: `briefings/<date>/audio/quote-duel-text-overrides.json` (audioDir), already READ at `scripts/generate-quote-duel-audio.mjs:142`.
- Override key = `resolveDuelId(scene, index)` = `scene.id ?? "duel-" + (index+1)` — **UNPADDED** (`duel-1`, `duel-2`, …), matching `generate-quote-duel-audio.mjs:138` and the `audioByDuel`/timeline keys. Only the WAV *filename* is padded (`duel-01.wav`); never the duelId.
- `defaultDuelText(scene) = audioText || narration || formatDuelAudioText(scene) || summary` (`generate-quote-duel-audio.mjs:89`).
- Page filters: `App.jsx:196` keeps `!DUEL_STEP_SET.has(id)`; `DuelApp.jsx:84` keeps `DUEL_STEP_SET.has(id)`.
- Step actions only run shell `commands` via `/api/run`; "Confirm" must be a panel button hitting an API, not a step action.

---

## Chunk 1: Shared duel-narration text module

Extract the duel text helpers into one module so the dashboard editor and the TTS
generator compute identical defaults. Pure functions, fully unit-testable.

### Task 1: Create the shared module

**Files:**
- Create: `scripts/lib/duel-narration-text.mjs`
- Test: `tests/duel-narration-text.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/duel-narration-text.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDuelAudioText,
  defaultDuelText,
  duelTextSource,
  resolveDuelId
} from '../scripts/lib/duel-narration-text.mjs';

test('defaultDuelText prefers audioText, then narration, then generated, then summary', () => {
  assert.equal(defaultDuelText({audioText: ' A ', narration: 'B', summary: 'C'}), 'A');
  assert.equal(defaultDuelText({narration: 'B', summary: 'C'}), 'B');
  assert.equal(defaultDuelText({summary: 'C'}), 'C');
  assert.equal(
    defaultDuelText({eventLabel: 'E', left: {outlet: 'L', quote: 'lq'}, right: {outlet: 'R', quote: 'rq'}}),
    'الحدث هو "E" "L" قالت عنو "lq" "R" قالت عنو "rq"'
  );
});

test('duelTextSource reports override first, then field precedence', () => {
  assert.equal(duelTextSource({audioText: 'A'}, 'ov'), 'override');
  assert.equal(duelTextSource({audioText: 'A'}, ''), 'audioText');
  assert.equal(duelTextSource({narration: 'B'}, ''), 'narration');
  assert.equal(duelTextSource({summary: 'C'}, ''), 'summary');
  assert.equal(duelTextSource({}, ''), null);
});

test('resolveDuelId uses scene.id else UNPADDED ordinal', () => {
  assert.equal(resolveDuelId({id: 'duel-x'}, 0), 'duel-x');
  assert.equal(resolveDuelId({}, 0), 'duel-1');
  assert.equal(resolveDuelId({}, 9), 'duel-10');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/duel-narration-text.test.mjs`
Expected: FAIL — cannot find module `scripts/lib/duel-narration-text.mjs`.

- [ ] **Step 3: Write the module**

```js
// scripts/lib/duel-narration-text.mjs
// Single source of truth for per-duel spoken-text selection, shared by the TTS
// generator (scripts/generate-quote-duel-audio.mjs) and the dashboard narration
// editor (dashboard/audio.mjs) so the shown default always matches what is synthesized.

export const normalizeSpacing = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function formatDuelAudioText(scene) {
  const event = normalizeSpacing(scene.eventLabel || scene.contrastLabel);
  const leftOutlet = normalizeSpacing(scene.left?.outlet);
  const leftSays = normalizeSpacing(scene.left?.audioLine || scene.left?.stance || scene.left?.quote);
  const rightOutlet = normalizeSpacing(scene.right?.outlet);
  const rightSays = normalizeSpacing(scene.right?.audioLine || scene.right?.stance || scene.right?.quote);
  const lines = [];
  if (event) lines.push(`الحدث هو "${event}"`);
  if (leftOutlet && leftSays) lines.push(`"${leftOutlet}" قالت عنو "${leftSays}"`);
  if (rightOutlet && rightSays) lines.push(`"${rightOutlet}" قالت عنو "${rightSays}"`);
  return normalizeSpacing(lines.join(' '));
}

export function defaultDuelText(scene) {
  return normalizeSpacing(scene.audioText || scene.narration || formatDuelAudioText(scene) || scene.summary);
}

export function duelTextSource(scene, overrideText) {
  if (overrideText) return 'override';
  if (scene.audioText) return 'audioText';
  if (scene.narration) return 'narration';
  if (formatDuelAudioText(scene)) return 'generated-format';
  if (scene.summary) return 'summary';
  return null;
}

export function resolveDuelId(scene, index) {
  // UNPADDED on purpose — matches the override/manifest/timeline keys (duel-1, duel-2…).
  return scene.id ?? `duel-${index + 1}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/duel-narration-text.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/duel-narration-text.mjs tests/duel-narration-text.test.mjs
git commit -m "feat(duel): shared duel-narration text module"
```

### Task 2: Use the shared module in the TTS generator (no behavior change)

**Files:**
- Modify: `scripts/generate-quote-duel-audio.mjs:76-97` (remove local `formatDuelAudioText`/`defaultDuelText`/`duelTextSource`) and `:138,142` (use `resolveDuelId`).

- [ ] **Step 1: Add the import** near the other `scripts/lib` imports at the top of the file:

```js
import {formatDuelAudioText, defaultDuelText, duelTextSource, resolveDuelId} from './lib/duel-narration-text.mjs';
```

- [ ] **Step 2: Delete the now-duplicated local definitions** of `formatDuelAudioText`, `defaultDuelText`, and `duelTextSource` (the `const padTwo`/`formatDuelAudioText` block at lines ~76-97). Keep any local `padTwo` only if still used elsewhere (it is used for `fileName`; keep that one).

- [ ] **Step 3: Replace the duelId expression** at the plan map (line ~138) so it reuses the shared resolver:

```js
const duelId = resolveDuelId(scene, index);
```

- [ ] **Step 4: Run the existing duel audio plan test (regression guard)**

Run: `node --test tests/duel-audio-plan.test.mjs`
Expected: PASS (unchanged behavior — same plan output).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-quote-duel-audio.mjs
git commit -m "refactor(duel): use shared duel-narration text module in TTS generator"
```

---

## Chunk 2: Duel narration data + overrides + API

Add duel-scoped override helpers and the merged entry list to `dashboard/audio.mjs`,
then expose them over HTTP. New helpers are duel-specific (the existing
`loadTextOverrides`/`saveTextOverride` are hardcoded to the briefing file and call
`narrationScenes`, so they cannot be reused literally).

### Task 3: Duel override + entries helpers in `dashboard/audio.mjs`

**Files:**
- Modify: `dashboard/audio.mjs` (add near the existing override helpers)
- Test: `tests/duel-narration-entries.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/duel-narration-entries.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {duelNarrationEntries, loadDuelTextOverrides, saveDuelTextOverride} from '../dashboard/audio.mjs';

function makeCtx() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-entries-'));
  const output = path.join(folder, 'output');
  const audioDir = path.join(folder, 'audio');
  fs.mkdirSync(output, {recursive: true});
  fs.mkdirSync(audioDir, {recursive: true});
  return {folder, output, audioDir, repoRoot: folder, folderRel: 'briefings/x'};
}

function writeDuel(ctx, scenes) {
  fs.writeFileSync(path.join(ctx.output, 'quote-duel.json'), JSON.stringify({scenes}, null, 2));
}

test('duelNarrationEntries merges defaults + overrides with correct source', () => {
  const ctx = makeCtx();
  writeDuel(ctx, [
    {id: 'duel-01', audioText: 'first', left: {outlet: 'L'}, right: {outlet: 'R'}},
    {summary: 'second only'}
  ]);
  const entries = duelNarrationEntries(ctx);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].duelId, 'duel-01');
  assert.equal(entries[0].defaultText, 'first');
  assert.equal(entries[0].source, 'audioText');
  assert.equal(entries[0].isOverridden, false);
  assert.equal(entries[1].duelId, 'duel-2');
  assert.equal(entries[1].effectiveText, 'second only');
  assert.equal(entries[1].source, 'summary');
});

test('saveDuelTextOverride writes, then clears when equal to default or empty', () => {
  const ctx = makeCtx();
  writeDuel(ctx, [{id: 'duel-01', audioText: 'first'}]);

  saveDuelTextOverride(ctx, 'duel-01', 'custom');
  let entries = duelNarrationEntries(ctx);
  assert.equal(entries[0].overrideText, 'custom');
  assert.equal(entries[0].effectiveText, 'custom');
  assert.equal(entries[0].source, 'override');
  assert.equal(entries[0].isOverridden, true);

  // Saving the exact default removes the override (and deletes the empty file).
  saveDuelTextOverride(ctx, 'duel-01', 'first');
  assert.deepEqual(loadDuelTextOverrides(ctx), {});
  assert.equal(fs.existsSync(path.join(ctx.audioDir, 'quote-duel-text-overrides.json')), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/duel-narration-entries.test.mjs`
Expected: FAIL — `duelNarrationEntries` is not exported.

- [ ] **Step 3: Implement the helpers in `dashboard/audio.mjs`**

Add the import at the top (with the other imports):

```js
import {defaultDuelText, duelTextSource, resolveDuelId} from '../scripts/lib/duel-narration-text.mjs';
```

Add the helpers (after the existing `saveTextOverride`):

```js
const duelOverridesPath = (ctx) => path.join(ctx.audioDir, 'quote-duel-text-overrides.json');

export function loadDuelTextOverrides(ctx) {
  return readJsonSafe(duelOverridesPath(ctx)) || {};
}

// One entry per duel, merging output/quote-duel.json with the override file.
// Uses the shared text precedence so the panel default == the synthesized default.
export function duelNarrationEntries(ctx) {
  const duel = readJsonSafe(path.join(ctx.output, 'quote-duel.json'));
  const scenes = Array.isArray(duel?.scenes) ? duel.scenes : [];
  const overrides = loadDuelTextOverrides(ctx);

  return scenes.map((scene, index) => {
    const duelId = resolveDuelId(scene, index);
    const overrideText = normalize(overrides[duelId]);
    const defaultText = defaultDuelText(scene);
    const effectiveText = overrideText || defaultText;
    return {
      duelId,
      outlets: [normalize(scene.left?.outlet), normalize(scene.right?.outlet)],
      quotes: [normalize(scene.left?.quote), normalize(scene.right?.quote)],
      defaultText,
      overrideText: overrideText || null,
      effectiveText,
      isOverridden: Boolean(overrideText),
      source: duelTextSource(scene, overrideText)
    };
  });
}

export function saveDuelTextOverride(ctx, duelId, text) {
  const overrides = loadDuelTextOverrides(ctx);
  const normalized = normalize(text);
  const entry = duelNarrationEntries(ctx).find((item) => item.duelId === duelId);
  if (!normalized || (entry && normalized === entry.defaultText)) {
    delete overrides[duelId];
  } else {
    overrides[duelId] = normalized;
  }
  fs.mkdirSync(ctx.audioDir, {recursive: true});
  if (Object.keys(overrides).length === 0) {
    if (fs.existsSync(duelOverridesPath(ctx))) fs.unlinkSync(duelOverridesPath(ctx));
  } else {
    fs.writeFileSync(duelOverridesPath(ctx), JSON.stringify(overrides, null, 2));
  }
  return overrides;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/duel-narration-entries.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add dashboard/audio.mjs tests/duel-narration-entries.test.mjs
git commit -m "feat(duel): duel narration entries + duel-scoped overrides"
```

### Task 4: Duel script + confirm API endpoints

**Files:**
- Modify: `dashboard/server.mjs` (import the new helpers; add routes; fold `state.duel` into `/api/state`)

> Note: there is no automated server test harness in this repo; verify by curl
> against a running dashboard. Keep handlers tiny and mirror existing routes
> (`/api/audio/script` at `server.mjs:542`, `/api/review` at `:514`).

- [ ] **Step 1: Import helpers + state utilities** at the top of `server.mjs` (extend the existing `./audio.mjs` import):

```js
import {audioEntries, /* ...existing... */ duelNarrationEntries, saveDuelTextOverride} from './audio.mjs';
```

(Confirm `loadState`/`saveState` are already imported — they are used by the phone routes.)

- [ ] **Step 2: Add `state.duel` to the `/api/state` payload builder** (near `social: socialPostingState(ctx, state)` at `server.mjs:430`):

```js
duel: {
  narration: duelNarrationEntries(ctx),
  narrationConfirmedAt: (loadState(ctx).duel || {}).narrationConfirmedAt || null
},
```

- [ ] **Step 3: Add the routes** (after the existing `/api/audio/*` routes):

```js
app.get('/api/duel/script', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  res.json({entries: duelNarrationEntries(briefingContext(date))});
});

app.post('/api/duel/script', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const {duelId, text} = req.body || {};
  if (!duelId) return res.status(400).json({error: 'duelId is required.'});
  const ctx = briefingContext(date);
  try {
    saveDuelTextOverride(ctx, String(duelId), String(text ?? ''));
    const state = loadState(ctx);
    if (state.duel?.narrationConfirmedAt) {
      state.duel.narrationConfirmedAt = null; // any edit re-gates
      saveState(ctx, state);
    }
    broadcast(date, {type: 'state-changed'});
    res.json({ok: true, entries: duelNarrationEntries(ctx)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/duel/confirm', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const ctx = briefingContext(date);
  const state = loadState(ctx);
  state.duel = {...(state.duel || {}), narrationConfirmedAt: new Date().toISOString()};
  saveState(ctx, state);
  broadcast(date, {type: 'state-changed'});
  res.json({ok: true, narrationConfirmedAt: state.duel.narrationConfirmedAt});
});
```

- [ ] **Step 4: Manual verification**

Run: `npm run briefing:dashboard` (in another terminal) then, for a date with `output/quote-duel.json`:

```bash
curl 'http://127.0.0.1:4600/api/duel/script?date=<DATE>'         # → {entries:[...]}
curl -X POST 'http://127.0.0.1:4600/api/duel/confirm' -H 'content-type: application/json' -d '{"date":"<DATE>"}'
curl -X POST 'http://127.0.0.1:4600/api/duel/script' -H 'content-type: application/json' -d '{"date":"<DATE>","duelId":"duel-01","text":"x"}'
```

Expected: first returns entries; confirm returns a timestamp; the script POST returns `ok:true` and `state.duel.narrationConfirmedAt` is cleared on the next `/api/state`.

- [ ] **Step 5: Commit**

```bash
git add dashboard/server.mjs
git commit -m "feat(duel): /api/duel/script + /api/duel/confirm + state.duel"
```

---

## Chunk 3: Duel step restructure + narration editor

### Task 5: Replace `duel-narration` with three steps + reorder hooks-sync

**Files:**
- Modify: `dashboard/steps.mjs` (the `duel-narration` block ~1033-1069; the `duel-hooks-sync` block ~1001-1031)

- [ ] **Step 1:** Replace the single `duel-narration` step object with three step objects — `duel-text`, `duel-audio`, `duel-html` — using the existing `npmRun` helper and `folder`/`ctx`/`duelManifest`/`quoteDuelHtmlArtifacts` already in scope. Titles renumber to 18/19/20.

```js
{
  id: 'duel-text',
  title: '18. Quote Duel: review & edit narration',
  description:
    'Local only. Builds output/quote-duel.json and surfaces each clash\'s spoken narration for review/edit below (saved to audio/quote-duel-text-overrides.json). Confirm the text before generating audio (step 19).',
  kind: 'run',
  actions: [
    {id: 'run', label: 'Build duel content + load narration (local)', commands: () => [npmRun('briefing:duel:build', '--folder', folder)]}
  ],
  artifacts: () => [
    ...quoteDuelHtmlArtifacts(ctx),
    {label: 'output/quote-duel.json', file: path.join(ctx.output, 'quote-duel.json'), optional: true},
    {label: 'audio/quote-duel-text-overrides.json (per-clash script edits)', file: path.join(ctx.folder, 'audio', 'quote-duel-text-overrides.json'), optional: true}
  ],
  status: (stepState) => {
    if (!exists(path.join(ctx.output, 'quote-duel.json'))) return fromLastRun(stepState, 'Duel content not built yet.');
    const confirmedAt = (loadState(ctx).duel || {}).narrationConfirmedAt;
    if (!confirmedAt) return {status: 'attention', detail: 'Review the narration below, then Confirm.'};
    return {status: 'done', detail: 'Narration confirmed — generate audio (step 19).'};
  }
},
{
  id: 'duel-audio',
  title: '19. Quote Duel: generate narration audio',
  description:
    'Local only. Synthesizes per-duel narration via Hamsa from the confirmed text, then rebuilds quote-duel.json to re-apply audio-driven durations.',
  kind: 'run',
  actions: [
    {id: 'run', label: 'Generate duel narration (local)', commands: () => [npmRun('briefing:duel:audio', '--folder', folder), npmRun('briefing:duel:build', '--folder', folder)]},
    {id: 'existing-only', label: 'Refresh durations from existing WAVs (no Hamsa)', commands: () => [npmRun('briefing:duel:audio', '--folder', folder, '--existing-only'), npmRun('briefing:duel:build', '--folder', folder)]}
  ],
  artifacts: () => [
    {label: 'audio/quote-duel-manifest.json', file: duelManifest},
    {label: 'output/quote-duel-audio-script.json', file: path.join(ctx.output, 'quote-duel-audio-script.json'), optional: true}
  ],
  status: (stepState) => {
    const confirmedAt = (loadState(ctx).duel || {}).narrationConfirmedAt;
    if (!confirmedAt) return {status: 'pending', detail: 'Confirm narration first (step 18).'};
    if (!exists(duelManifest)) return fromLastRun(stepState, 'Duel narration not generated yet.');
    return fromLastRun(stepState, 'Duel narration ready — check the HTML (step 20).');
  }
},
{
  id: 'duel-html',
  title: '20. Quote Duel: build & check HTML',
  description:
    'Local only. Rebuilds the Quote Duel review HTML from the current durations and opens it so you can verify audio + visual + hook together before any server contact.',
  kind: 'run',
  actions: [
    {id: 'run', label: 'Rebuild + open review HTML (local)', commands: () => [npmRun('briefing:duel:build', '--folder', folder)]}
  ],
  artifacts: () => quoteDuelHtmlArtifacts(ctx),
  status: (stepState) => {
    if (!exists(path.join(ctx.output, 'radar-beirut-quote-duel.html'))) return fromLastRun(stepState, 'HTML not built yet.');
    if (exists(duelManifest) && mtimeMs(duelManifest) > mtimeMs(path.join(ctx.output, 'radar-beirut-quote-duel.html'))) {
      return {status: 'stale', detail: 'Audio changed after the HTML — rebuild.'};
    }
    return fromLastRun(stepState, 'HTML ready — verify, then sync hooks (step 21).');
  }
}
```

> Use `loadState(ctx)` (already imported in steps.mjs from `./lib/state.mjs`). Do not
> the helper name in `steps.mjs` and reuse it; do not introduce a second reader.
> Ensure `quoteDuelHtmlArtifacts` marks the combined HTML `open: true` (it already
> does for `duel-narration`).

- [ ] **Step 2:** Move the `duel-hooks-sync` step object so it appears AFTER `duel-html` and BEFORE `duel-server-render`, and renumber its title to `21.`. Renumber `duel-server-render`→`22.`, `duel-server-mux`→`23.`, `duel-download`→`24.`, `duel-split`→`25.` (titles only; ids unchanged).

- [ ] **Step 3: Verify the steps module loads**

Run: `node -e "import('./dashboard/steps.mjs').then(()=>console.log('ok'))"`
Expected: prints `ok` (no syntax/scope errors).

- [ ] **Step 4: Commit**

```bash
git add dashboard/steps.mjs
git commit -m "feat(duel): split duel-narration into text/audio/html gates; move hooks-sync after local verify"
```

### Task 6: Duel step ids + shared-step set

**Files:**
- Modify: `dashboard/web/src/duelSteps.js`

- [ ] **Step 1:** Update `DUEL_STEP_IDS` and add `SHARED_STEP_IDS`:

```js
export const DUEL_STEP_IDS = [
  'duel-hooks',
  'duel-text',
  'duel-audio',
  'duel-html',
  'duel-hooks-sync',
  'duel-server-render',
  'duel-server-mux',
  'duel-download',
  'duel-split'
];

export const DUEL_STEP_SET = new Set(DUEL_STEP_IDS);

// Steps that must appear on BOTH pages (not subtracted by the main filter).
export const SHARED_STEP_IDS = ['social-package'];
export const SHARED_STEP_SET = new Set(SHARED_STEP_IDS);
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/web/src/duelSteps.js
git commit -m "feat(duel): new duel step order + SHARED_STEP_IDS"
```

### Task 7: `DuelNarrationPanel` component

**Files:**
- Create: `dashboard/web/src/DuelNarrationPanel.jsx`

- [ ] **Step 1:** Create the panel (model on `AudioPanel.jsx`). Props: `entries`, `confirmedAt`, `busy`, `onSaveText(duelId, text)`, `onConfirm()`. Each row shows the two outlets + clashing quotes for context, an editable `<textarea>` seeded with `effectiveText`, a Save (calls `onSaveText`) and Reset (calls `onSaveText(duelId, '')`) button, an "edited" badge when `isOverridden`, and the `source` label. A footer "Confirm narration" button calls `onConfirm()` and shows `confirmedAt` when set.

```jsx
import React, {useEffect, useState} from 'react';

export default function DuelNarrationPanel({entries = [], confirmedAt, busy, onSaveText, onConfirm}) {
  const [drafts, setDrafts] = useState({});
  useEffect(() => {
    setDrafts(Object.fromEntries(entries.map((e) => [e.duelId, e.effectiveText || ''])));
  }, [entries]);

  if (!entries.length) {
    return (
      <section className="audio-panel">
        <h2>Duel narration</h2>
        <p className="hint">Build duel content first (step 18) to review narration.</p>
      </section>
    );
  }

  return (
    <section className="audio-panel">
      <div className="audio-panel-head">
        <h2>Duel narration</h2>
        <p className="description">Edit each clash's spoken line, then Confirm before generating audio.</p>
      </div>
      <div className="audio-list">
        {entries.map((e) => (
          <div className="audio-row" key={e.duelId}>
            <div className="audio-meta">
              <strong>{e.duelId}{e.isOverridden ? ' • edited' : ''}</strong>
              <span>{e.outlets.filter(Boolean).join('  ✕  ')}</span>
              {(e.quotes || []).filter(Boolean).map((q, i) => (<span key={i} className="hint">«{q}»</span>))}
              <span className="hint">source: {e.source || 'none'}</span>
            </div>
            <textarea
              value={drafts[e.duelId] ?? ''}
              onChange={(ev) => setDrafts((d) => ({...d, [e.duelId]: ev.target.value}))}
            />
            <div className="story-actions">
              <button className="btn primary" disabled={busy} onClick={() => onSaveText(e.duelId, drafts[e.duelId] ?? '')}>Save</button>
              <button className="btn ghost" disabled={busy} onClick={() => onSaveText(e.duelId, '')}>Reset to default</button>
            </div>
          </div>
        ))}
      </div>
      <div className="audio-panel-head">
        <button className="btn primary" disabled={busy} onClick={onConfirm}>Confirm narration</button>
        <p className={`phone-status ${confirmedAt ? 'done' : 'pending'}`}>
          {confirmedAt ? `Confirmed ${new Date(confirmedAt).toLocaleString()}` : 'Not confirmed — audio step is gated.'}
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/web/src/DuelNarrationPanel.jsx
git commit -m "feat(duel): DuelNarrationPanel editor component"
```

### Task 8: Wire the panel + card ordering into `DuelApp`

**Files:**
- Modify: `dashboard/web/src/DuelApp.jsx`

- [ ] **Step 1:** Import the panel + shared sets:

```js
import DuelNarrationPanel from './DuelNarrationPanel.jsx';
import {DUEL_STEP_SET, DUEL_STEP_IDS, SHARED_STEP_SET, SHARED_STEP_IDS} from './duelSteps.js';
```

- [ ] **Step 2:** Replace the `duelSteps` filter with one that includes shared steps and orders by the combined id list:

```js
const order = [...DUEL_STEP_IDS, ...SHARED_STEP_IDS];
const duelSteps = data
  ? data.steps
      .filter((step) => DUEL_STEP_SET.has(step.id) || SHARED_STEP_SET.has(step.id))
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  : [];
```

- [ ] **Step 3:** Add save/confirm handlers (reuse the existing `api` helper + `refresh`):

```js
const saveDuelText = async (duelId, text) => {
  try { await api('/api/duel/script', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({date, duelId, text})}); }
  catch (err) { setError(err.message); }
};
const confirmDuelText = async () => {
  try { await api('/api/duel/confirm', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({date})}); }
  catch (err) { setError(err.message); }
};
```

- [ ] **Step 4:** In the `duelSteps.map(...)` render, pass `data.social` to the shared social card (so its prompt fields render):

```jsx
social={step.id === 'social-package' ? data.social : null}
```

- [ ] **Step 5:** Render `DuelNarrationPanel` right after the `duel-text` card (or below the pipeline section), fed from `data.duel`:

```jsx
{data?.duel && (
  <DuelNarrationPanel
    entries={data.duel.narration}
    confirmedAt={data.duel.narrationConfirmedAt}
    busy={busy}
    onSaveText={saveDuelText}
    onConfirm={confirmDuelText}
  />
)}
```

- [ ] **Step 6: Build the frontend + smoke check**

Run: `npm run briefing:dashboard:build`
Expected: Vite build succeeds with no errors.

- [ ] **Step 7: Manual verification** — `npm run briefing:dashboard`, open `/?view=duel&date=<DATE>`: step 18 shows the narration panel; editing + Save sets "edited"; Confirm flips step 19 from "Confirm narration first" to runnable; the social card appears last.

- [ ] **Step 8: Commit**

```bash
git add dashboard/web/src/DuelApp.jsx
git commit -m "feat(duel): render narration editor + shared social step on duel page"
```

---

## Chunk 4: Shared social-captions step + duel captions validator

### Task 9: Duel social-captions validator

**Files:**
- Create: `scripts/validate-duel-social-captions.mjs`
- Test: `tests/validate-duel-social-captions.test.mjs`
- Reference: `scripts/validate-social-captions.mjs` (mirror its CLI + exit codes)

- [ ] **Step 1: Write the failing test** (drive the script as a child process, like `duel-audio-plan.test.mjs`):

```js
// tests/validate-duel-social-captions.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const make = () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-cap-'));
  fs.mkdirSync(path.join(folder, 'output'), {recursive: true});
  fs.mkdirSync(path.join(folder, 'audio'), {recursive: true});
  return folder;
};
const run = (folder) => spawnSync(process.execPath, ['./scripts/validate-duel-social-captions.mjs', '--folder', folder], {cwd: repoRoot, encoding: 'utf8'});

test('passes when every manifest duelId has a caption', () => {
  const folder = make();
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-01': {}, 'duel-02': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({
    clips: [{duelId: 'duel-01', caption: 'a'}, {duelId: 'duel-02', caption: 'b'}],
    reel: {caption: 'r'}
  }));
  const r = run(folder);
  assert.equal(r.status, 0, r.stderr);
});

test('fails when a manifest duelId is missing a caption', () => {
  const folder = make();
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-01': {}, 'duel-02': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({clips: [{duelId: 'duel-01', caption: 'a'}], reel: {caption: 'r'}}));
  const r = run(folder);
  assert.notEqual(r.status, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validate-duel-social-captions.test.mjs`
Expected: FAIL — script missing.

- [ ] **Step 3: Implement the validator** (read `--folder`, load `audio/quote-duel-manifest.json` `audioByDuel` keys + `output/quote-duel-social-captions.json`; assert one `clips[].duelId` caption per manifest duel and a non-empty `reel.caption`; `console.error` + `process.exit(1)` on failure, else log OK and exit 0). Mirror arg parsing from `validate-social-captions.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validate-duel-social-captions.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the npm script** to `package.json`:

```json
"briefing:duel:social:validate": "node ./scripts/validate-duel-social-captions.mjs",
```

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-duel-social-captions.mjs tests/validate-duel-social-captions.test.mjs package.json
git commit -m "feat(duel): duel social-captions validator"
```

### Task 10: Extend `social-package` to also generate duel captions

**Files:**
- Modify: `dashboard/steps.mjs` (the `social-package` step ~904-963)

- [ ] **Step 1:** Append to the `social-package` generate action `commands` array (after the briefing thumbnail-prompt command), the duel captions chain — the duel Codex prompt → `codex exec` → duel validate. Mirror the existing briefing codex-exec command shape (the `{cmd:'codex', args:[...,'-'], stdinFile}` block already in this file at the briefing social step and at step 3):

```js
npmRun('briefing:duel:captions', '--folder', folder),
{
  cmd: 'codex',
  args: ['exec', '--cd', ctx.repoRoot, '--sandbox', 'workspace-write', '--skip-git-repo-check',
    '--output-last-message', path.join(ctx.output, 'quote-duel-social-captions-codex-message.md'), '-'],
  stdinFile: path.join(ctx.output, 'quote-duel-social-captions-prompt.md')
},
npmRun('briefing:duel:social:validate', '--folder', folder)
```

- [ ] **Step 2:** Add duel artifacts to the step's `artifacts()` (so both JSONs are visible):

```js
{label: 'output/quote-duel-social-captions.json', file: path.join(ctx.output, 'quote-duel-social-captions.json'), optional: true},
```

- [ ] **Step 3: Verify the module loads**

Run: `node -e "import('./dashboard/steps.mjs').then(()=>console.log('ok'))"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add dashboard/steps.mjs
git commit -m "feat(duel): social-package also generates + validates duel captions"
```

---

## Chunk 5: Move shorts distribution to the duel page

### Task 11: `duelPostingState` + phone `kind: 'duel'`

**Files:**
- Modify: `dashboard/server.mjs`

- [ ] **Step 1:** Add `duelPostingState(ctx, state)` mirroring `socialPostingState` (`server.mjs:164`). `DUEL_HOOK` is **not** in scope in `server.mjs` (it is a local `const DUEL_HOOK = 'hook-2'` in `steps.mjs:303`); define a local `const DUEL_HOOK = 'hook-2'` in `server.mjs` for this function. It assembles three tiers from the duel outputs for the in-use hook:
  - per-duel shorts from `output/duel-videos[-<hook>]/duel-NN.mp4`,
  - top-3 reel `output/duel-videos[-<hook>]/quote-duel-full.mp4`,
  - all-duels master `output/radar-beirut-quote-duel-<hook>-final.mp4`,
  - captions from `output/quote-duel-social-captions.json` keyed by `duelId`,
  - `phone: phoneTransferState(ctx, state)` reusing the existing helper, plus a duel-scoped status (see step 3).
  Use the existing `pcPath`/`relUrl`/`readJsonSafe` helpers. Return `{ready, full, reel, shorts:[...], phone}`.

- [ ] **Step 2:** Add `duel: {... , social: duelPostingState(ctx, state)}` to `/api/state` (merge into the `duel` object added in Task 4 — `narration`, `narrationConfirmedAt`, `social`).

- [ ] **Step 3:** Make `phoneRemoteFolder(date, kind)` accept a `kind` (`server.mjs:244`); when `kind === 'duel'` return a distinct folder name (e.g. `${date}-duel`). In `/api/phone/upload-scenes` and `/api/phone/delete-folder`, read `kind` from the body; when `'duel'`, source MP4s from the duel videos dir (shorts + reel + full) instead of `sceneMp4Files(variant.sceneDir)`, and store status under `state.duelPhoneTransfer` instead of `state.phoneTransfer`.

- [ ] **Step 4: Manual verification** — for a date with `duel-videos-hook-2/`, `curl 'http://127.0.0.1:4600/api/state?date=<DATE>'` and confirm `duel.social.shorts[]`, `duel.social.reel`, `duel.social.full` are populated.

- [ ] **Step 5: Commit**

```bash
git add dashboard/server.mjs
git commit -m "feat(duel): duelPostingState + duel-scoped phone transfer"
```

### Task 12: `DuelPostingPanel` + remove Instagram card from main

**Files:**
- Create: `dashboard/web/src/DuelPostingPanel.jsx`
- Modify: `dashboard/web/src/SocialPostingPanel.jsx`, `dashboard/web/src/DuelApp.jsx`

- [ ] **Step 1:** Create `DuelPostingPanel.jsx` modeled on the current `SocialPostingPanel` Instagram card. Sections: **Full (all duels)** (open/copy-path), **Top-3 reel** (open/copy-path/copy-caption), **Per-duel shorts** (list: open/copy-path/copy-caption), **Phone transfer** (same controls, posts with `kind:'duel'`), and platform links **Instagram Reels · YouTube Shorts · TikTok**. Props: `social` (= `data.duel.social`), `onUploadPhoneScenes`, `onDeletePhoneFolder`.

- [ ] **Step 2:** In `SocialPostingPanel.jsx`, remove the entire "Instagram story clips" `<div className="publish-card">` (lines ~120-184) and the phone-transfer logic/handlers/state it used (`phonePassword`, `uploadToPhone`, `deleteFromPhone`, the `onUploadPhoneScenes`/`onDeletePhoneFolder` props). Keep only the YouTube card; `publish-grid` now holds one card.

- [ ] **Step 3:** In `App.jsx`, drop the now-unused phone props passed to `SocialPostingPanel` (`App.jsx:259`) — leave `social={data.social}` only. (Keep the phone fetch helpers in App only if still used; otherwise remove.)

- [ ] **Step 4:** In `DuelApp.jsx`, add phone upload/delete helpers (mirror App's, posting `kind:'duel'`) and render `<DuelPostingPanel social={data.duel?.social} onUploadPhoneScenes={...} onDeletePhoneFolder={...} />` below the pipeline.

- [ ] **Step 5: Build + manual verification**

Run: `npm run briefing:dashboard:build`
Then `npm run briefing:dashboard`: main "Post now" shows only the YouTube card; the duel page shows the three video tiers + phone transfer + platform links.

- [ ] **Step 6: Commit**

```bash
git add dashboard/web/src/DuelPostingPanel.jsx dashboard/web/src/SocialPostingPanel.jsx dashboard/web/src/App.jsx dashboard/web/src/DuelApp.jsx
git commit -m "feat(duel): move shorts distribution panel to the duel page"
```

### Task 13: Docs + full suite

**Files:**
- Modify: `CLAUDE.md` (Quote Duel dashboard step list)

- [ ] **Step 1:** Update the `## Quote Duel Video Pipeline` dashboard bullet to the new step numbering (17 hooks → 18 text → 19 audio → 20 html → 21 hooks-sync → 22 render → 23 mux → 24 download → 25 split; social captions shared on both pages; shorts distribution lives on the duel page).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS (existing + new tests).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update Quote Duel dashboard step list for review gates + shorts distribution"
```

---

## Execution notes

- Chunks 1–2 are pure backend + tests (safe to land first). Chunk 3 depends on 2.
  Chunk 4 is independent of 3 (touches `social-package` + a validator). Chunk 5
  depends on Chunk 4's captions JSON for full caption display but the panel
  degrades gracefully without it.
- After each chunk, run `npm test` and `npm run briefing:dashboard:build`.
- Reference skills: @superpowers:test-driven-development, @superpowers:executing-plans.
