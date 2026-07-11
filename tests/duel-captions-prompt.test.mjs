import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');

const makeFolder = (scenes, withManifest) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-cap-'));
  const out = path.join(folder, 'output');
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'quote-duel.json'), JSON.stringify({meta: {dateLabel: '2026-06-19'}, scenes}, null, 2));
  if (withManifest) {
    fs.mkdirSync(path.join(out, 'duel-videos'), {recursive: true});
    fs.writeFileSync(
      path.join(out, 'duel-videos', 'manifest.json'),
      JSON.stringify({
        duels: scenes
          .filter((s) => s.id !== 'duel-2')
          .map((s, i) => ({duelId: s.id, fileName: `duel-0${i + 1}.mp4`})),
        skipped: [{duelId: 'duel-2'}]
      })
    );
  }
  return folder;
};

const run = (folder) => {
  const r = spawnSync(process.execPath, ['./scripts/build-duel-social-captions-prompt.mjs', '--folder', folder], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
  return fs.readFileSync(path.join(folder, 'output', 'quote-duel-social-captions-prompt.md'), 'utf8');
};

const scenes = [
  {id: 'duel-1', eventLabel: 'E1', contrastLabel: 'C1', left: {outlet: 'نداء الوطن', quote: 'q1'}, right: {outlet: 'الأخبار', quote: 'q2'}},
  {id: 'duel-2', eventLabel: 'E2', contrastLabel: 'C2', left: {outlet: 'الجمهورية', quote: 'q3'}, right: {outlet: 'الأخبار', quote: 'q4'}},
  {id: 'duel-3', eventLabel: 'E3', contrastLabel: 'C3', left: {outlet: 'المدن', quote: 'q5'}, right: {outlet: 'الديار', quote: 'q6'}}
];

test('derives clip plan from quote-duel.json when no split manifest', () => {
  const prompt = run(makeFolder(scenes, false));
  // one block per duel, keyed by duelId, with derived duel-NN.mp4 clip names
  assert.match(prompt, /duelId: duel-1/);
  assert.match(prompt, /duelId: duel-2/);
  assert.match(prompt, /duelId: duel-3/);
  assert.match(prompt, /clip: duel-01\.mp4/);
  assert.match(prompt, /clip: duel-03\.mp4/);
  // keyed by duelId in the JSON schema spec, not sceneId
  assert.match(prompt, /"duelId": "duel-1"/);
  assert.doesNotMatch(prompt, /sceneId/);
  assert.match(prompt, /Known outlet YouTube channels/);
  assert.match(prompt, /Required publishing hashtags for youtube\.hashtags/);
  assert.match(prompt, /#RadarBeirut/);
  assert.match(prompt, /#صحافة_لبنانية/);
  assert.match(prompt, /الأخبار https:\/\/www\.youtube\.com\/channel\/UCesINM73oox7GBSXTHz9Xiw/);
  assert.match(prompt, /نداء الوطن https:\/\/www\.youtube\.com\/channel\/UCgDmbBPDnUWZdvMRrYG2C8Q/);
  assert.match(prompt, /المدن https:\/\/www\.youtube\.com\/user\/Almodononline/);
  assert.match(prompt, /الديار https:\/\/www\.youtube\.com\/channel\/UC6ObY8lCD2oHmyLjKqLAn1g\/featured/);
});

test('uses split manifest clip names and omits skipped duels', () => {
  const prompt = run(makeFolder(scenes, true));
  assert.match(prompt, /duelId: duel-1/);
  assert.match(prompt, /duelId: duel-3/);
  // duel-2 was skipped in the manifest → excluded from caption blocks
  assert.doesNotMatch(prompt, /duelId: duel-2/);
});
