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
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-1': {}, 'duel-2': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({
    clips: [{duelId: 'duel-1', caption: 'a'}, {duelId: 'duel-2', caption: 'b'}],
    reel: {caption: 'r'}
  }));
  const r = run(folder);
  assert.equal(r.status, 0, r.stderr);
});

test('fails when a manifest duelId is missing a caption', () => {
  const folder = make();
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-1': {}, 'duel-2': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({clips: [{duelId: 'duel-1', caption: 'a'}], reel: {caption: 'r'}}));
  const r = run(folder);
  assert.notEqual(r.status, 0);
});
