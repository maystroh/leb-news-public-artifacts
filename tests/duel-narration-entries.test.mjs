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

  saveDuelTextOverride(ctx, 'duel-01', 'first');
  assert.deepEqual(loadDuelTextOverrides(ctx), {});
  assert.equal(fs.existsSync(path.join(ctx.audioDir, 'quote-duel-text-overrides.json')), false);
});
