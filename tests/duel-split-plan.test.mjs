import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');

// Drives the splitter's --dry-run planner (no ffmpeg) to assert the atomic
// clip plan, the source-ordinal filenames, the top-3 full-reel selection, the
// 60s cap, and skip handling — all derived from lib/duel-timeline.mjs.
const makeFolder = (scenes, audioByDuel, extra = {}) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-split-'));
  fs.mkdirSync(path.join(folder, 'output'), {recursive: true});
  fs.mkdirSync(path.join(folder, 'audio'), {recursive: true});
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel.json'), JSON.stringify({meta: {}, ...extra.duel, scenes}, null, 2));
  fs.writeFileSync(
    path.join(folder, 'audio', 'quote-duel-manifest.json'),
    JSON.stringify({audioByDuel, ...(extra.hook ? {hook: extra.hook} : {}), ...(extra.hooks ? {hooks: extra.hooks} : {})}, null, 2)
  );
  return folder;
};

const runPlan = (folder, extra = []) => {
  const result = spawnSync(
    process.execPath,
    ['./scripts/split-quote-duel-video.mjs', '--folder', folder, '--dry-run', ...extra],
    {cwd: repoRoot, encoding: 'utf8'}
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

const wavEntry = (file, durationSeconds) => ({file, src: `../audio/${file}`, durationSeconds, skipped: false});

test('4 duels: source-ordinal clips + top-3 full reel', () => {
  const folder = makeFolder(
    [
      {id: 'duel-1', rank: 1, durationSeconds: 9.5},
      {id: 'duel-2', rank: 2, durationSeconds: 9.5},
      {id: 'duel-3', rank: 3, durationSeconds: 9.5},
      {id: 'duel-4', rank: 4, durationSeconds: 9.5}
    ],
    {
      'duel-1': wavEntry('duel-01.wav', 9),
      'duel-2': wavEntry('duel-02.wav', 9),
      'duel-3': wavEntry('duel-03.wav', 9),
      'duel-4': wavEntry('duel-04.wav', 9)
    }
  );
  const plan = runPlan(folder);
  assert.deepEqual(plan.atomic.map((c) => c.fileName), ['duel-01.mp4', 'duel-02.mp4', 'duel-03.mp4', 'duel-04.mp4']);
  // contiguous offsets
  assert.equal(plan.atomic[0].startSeconds, 0);
  assert.equal(plan.atomic[1].startSeconds, plan.atomic[0].endSeconds);
  // top-3 in full reel, duel-4 excluded
  assert.deepEqual(plan.fullReel.duelIds, ['duel-1', 'duel-2', 'duel-3']);
});

test('skipped duel (no audio) excluded but keeps source-ordinal numbering', () => {
  const folder = makeFolder(
    [
      {id: 'duel-1', rank: 1, durationSeconds: 9.5},
      {id: 'duel-2', rank: 2, durationSeconds: 9.5}, // no audio entry
      {id: 'duel-3', rank: 3, durationSeconds: 9.5}
    ],
    {
      'duel-1': wavEntry('duel-01.wav', 9),
      'duel-3': wavEntry('duel-03.wav', 9)
    }
  );
  const plan = runPlan(folder);
  assert.deepEqual(plan.atomic.map((c) => c.fileName), ['duel-01.mp4', 'duel-03.mp4']);
  assert.deepEqual(plan.skipped.map((s) => s.duelId), ['duel-2']);
  // duel-3 starts right after duel-1 (survivors-only offsets)
  assert.equal(plan.atomic[1].startSeconds, plan.atomic[0].endSeconds);
});

test('selected hook prepended to every clip; no --hook → no hook', () => {
  const folder = makeFolder(
    [
      {id: 'duel-1', rank: 1, durationSeconds: 9.5},
      {id: 'duel-2', rank: 2, durationSeconds: 9.5}
    ],
    {
      'duel-1': wavEntry('duel-01.wav', 9),
      'duel-2': wavEntry('duel-02.wav', 9)
    },
    {
      duel: {hooks: [
        {id: 'hook-1', text: 'اليوم شو عم بقولوا للبنانية'},
        {id: 'hook-2', text: 'اسمع اسمع'}
      ]},
      hooks: {
        'hook-1': {file: 'hook-1.wav', src: '../audio/hook-1.wav', durationSeconds: 1.5, bufferedSeconds: 2.0},
        'hook-2': {file: 'hook-2.wav', src: '../audio/hook-2.wav', durationSeconds: 3.0, bufferedSeconds: 3.5}
      }
    }
  );
  // --hook hook-2 selected
  const plan2 = runPlan(folder, ['--hook', 'hook-2']);
  assert.equal(plan2.hookSeconds, 3.5);
  assert.equal(plan2.hookPrependedToEachClip, true);
  assert.equal(plan2.atomic[0].startSeconds, 3.5); // duels start after the hook
  // bare-number form
  const plan1 = runPlan(folder, ['--hook', '1']);
  assert.equal(plan1.hookSeconds, 2.0);
  // no --hook → no hook
  const planNone = runPlan(folder);
  assert.equal(planNone.hookSeconds, 0);
  assert.equal(planNone.hookPrependedToEachClip, false);
  assert.equal(planNone.atomic[0].startSeconds, 0);
});

test('60s cap drops lowest-rank main from the full reel', () => {
  const folder = makeFolder(
    [
      {id: 'duel-1', rank: 1, durationSeconds: 21},
      {id: 'duel-2', rank: 2, durationSeconds: 21},
      {id: 'duel-3', rank: 3, durationSeconds: 21}
    ],
    {
      'duel-1': wavEntry('duel-01.wav', 20.5),
      'duel-2': wavEntry('duel-02.wav', 20.5),
      'duel-3': wavEntry('duel-03.wav', 20.5)
    }
  );
  const plan = runPlan(folder);
  assert.deepEqual(plan.fullReel.duelIds, ['duel-1', 'duel-2']);
  assert.deepEqual(plan.droppedFromFull, ['duel-3']);
  assert.ok(plan.fullReel.seconds <= 60);
});
