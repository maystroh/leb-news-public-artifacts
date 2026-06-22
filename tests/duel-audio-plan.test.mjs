import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');

// Drives the audio script's --dry-run planner with no Hamsa call and no WAV
// writes, asserting the per-duel action plan (narration vs summary source,
// generate/reuse/skip) for reuse / force / existing-only modes.
const makeFolder = () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-audio-'));
  fs.mkdirSync(path.join(folder, 'output'), {recursive: true});
  fs.mkdirSync(path.join(folder, 'audio'), {recursive: true});
  return folder;
};

const writeQuoteDuel = (folder, scenes) =>
  fs.writeFileSync(
    path.join(folder, 'output', 'quote-duel.json'),
    JSON.stringify({meta: {}, scenes}, null, 2)
  );

const runPlan = (folder, extra = []) => {
  const result = spawnSync(
    process.execPath,
    ['./scripts/generate-quote-duel-audio.mjs', '--folder', folder, '--dry-run', ...extra],
    {cwd: repoRoot, encoding: 'utf8'}
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test('plan: narration vs summary text source; missing text → skip', () => {
  const folder = makeFolder();
  writeQuoteDuel(folder, [
    {id: 'duel-1', rank: 1, narration: 'سطر منطوق', summary: 's1'},
    {id: 'duel-2', rank: 2, summary: 'ملخص فقط'}, // summary fallback
    {id: 'duel-3', rank: 3} // no text → skip
  ]);
  const plan = runPlan(folder);
  assert.equal(plan.mode, 'reuse');
  assert.deepEqual(plan.duels.map((d) => d.textSource), ['narration', 'summary', null]);
  // no WAVs exist yet → generate the two with text, skip the textless one
  assert.deepEqual(plan.duels.map((d) => d.action), ['generate', 'generate', 'skip']);
  assert.equal(plan.duels[2].skipReason, 'no-text');
  // source-ordinal filenames
  assert.deepEqual(plan.duels.map((d) => d.fileName), ['duel-01.wav', 'duel-02.wav', 'duel-03.wav']);
});

test('plan: reuse when WAV exists; --force regenerates', () => {
  const folder = makeFolder();
  writeQuoteDuel(folder, [{id: 'duel-1', rank: 1, summary: 's'}]);
  fs.writeFileSync(path.join(folder, 'audio', 'duel-01.wav'), 'fake');

  assert.equal(runPlan(folder).duels[0].action, 'reuse');
  assert.equal(runPlan(folder, ['--force']).duels[0].action, 'generate');
});

test('plan: --existing-only never generates (skips missing WAVs)', () => {
  const folder = makeFolder();
  writeQuoteDuel(folder, [
    {id: 'duel-1', rank: 1, summary: 's1'}, // no wav
    {id: 'duel-2', rank: 2, summary: 's2'}
  ]);
  fs.writeFileSync(path.join(folder, 'audio', 'duel-02.wav'), 'fake');

  const plan = runPlan(folder, ['--existing-only']);
  assert.equal(plan.mode, 'existing-only');
  assert.deepEqual(plan.duels.map((d) => d.action), ['skip', 'reuse']);
  assert.equal(plan.duels[0].skipReason, 'no-wav-existing-only');
});
