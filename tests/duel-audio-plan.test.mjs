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
    {id: 'duel-1', rank: 1, audioText: 'نص صوتي', narration: 'سطر منطوق', summary: 's1'},
    {id: 'duel-2', rank: 2, narration: 'سطر منطوق'}, // legacy narration fallback
    {
      id: 'duel-3',
      rank: 3,
      eventLabel: 'اتفاق',
      left: {outlet: 'البناء', audioLine: 'تحول لمصلحة طهران', quote: 'q1'},
      right: {outlet: 'نداء الوطن', audioLine: 'مقايضة على السيادة', quote: 'q2'}
    }, // generated structured fallback
    {id: 'duel-4', rank: 4} // no text → skip
  ]);
  const plan = runPlan(folder);
  assert.equal(plan.mode, 'reuse');
  assert.deepEqual(plan.duels.map((d) => d.textSource), ['audioText', 'narration', 'generated-format', null]);
  // no WAVs exist yet → generate the three with text, skip the textless one
  assert.deepEqual(plan.duels.map((d) => d.action), ['generate', 'generate', 'generate', 'skip']);
  assert.equal(plan.duels[3].skipReason, 'no-text');
  // source-ordinal filenames
  assert.deepEqual(plan.duels.map((d) => d.fileName), ['duel-01.wav', 'duel-02.wav', 'duel-03.wav', 'duel-04.wav']);
});

test('plan: generated-format fallback uses event and inferred outlet lines', () => {
  const folder = makeFolder();
  writeQuoteDuel(folder, [
    {
      id: 'duel-1',
      eventLabel: 'الاتفاق الأميركي الإيراني',
      left: {outlet: 'البناء', audioLine: 'الاتفاق تحول في ميزان القوى'},
      right: {outlet: 'نداء الوطن', audioLine: 'الاتفاق مقايضة على السيادة'}
    }
  ]);

  const plan = runPlan(folder);
  assert.equal(plan.duels[0].textSource, 'generated-format');
  assert.equal(plan.duels[0].action, 'generate');
});

test('plan: text override wins and stale existing WAV regenerates', () => {
  const folder = makeFolder();
  writeQuoteDuel(folder, [{id: 'duel-1', rank: 1, audioText: 'النص الأصلي'}]);
  fs.writeFileSync(path.join(folder, 'audio', 'duel-01.wav'), 'fake');
  fs.writeFileSync(
    path.join(folder, 'audio', 'quote-duel-manifest.json'),
    JSON.stringify({audioByDuel: {'duel-1': {text: 'النص القديم', source: 'ai'}}}, null, 2)
  );
  fs.writeFileSync(
    path.join(folder, 'audio', 'quote-duel-text-overrides.json'),
    JSON.stringify({'duel-1': 'النص المعدل'}, null, 2)
  );

  const plan = runPlan(folder);
  assert.equal(plan.duels[0].textSource, 'override');
  assert.equal(plan.duels[0].stale, true);
  assert.equal(plan.duels[0].action, 'generate');
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
