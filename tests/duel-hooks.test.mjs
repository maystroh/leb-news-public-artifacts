import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_DUEL_HOOKS,
  DEFAULT_DUEL_OUTRO_AUDIO,
  DEFAULT_HOOK_ID,
  ensureDuelHooks,
  normalizeHookId,
  resolveSharedHook,
  resolveSharedOutro
} from '../scripts/lib/duel-hooks.mjs';

test('defaults: hook-2 is the selected/known phrase', () => {
  assert.equal(DEFAULT_HOOK_ID, 'hook-2');
  const h2 = DEFAULT_DUEL_HOOKS.find((h) => h.id === 'hook-2');
  assert.match(h2.text, /بتعرف شو عم بقولو/);
  assert.deepEqual(DEFAULT_DUEL_HOOKS.map((h) => h.id), ['hook-1', 'hook-2', 'hook-3']);
  assert.equal(DEFAULT_DUEL_OUTRO_AUDIO.file, 'outro.wav');
  assert.match(DEFAULT_DUEL_OUTRO_AUDIO.text, /للمزيد من التفاصيل/);
});

test('ensureDuelHooks injects defaults when none present', () => {
  assert.deepEqual(ensureDuelHooks({}).map((h) => h.id), ['hook-1', 'hook-2', 'hook-3']);
  assert.deepEqual(ensureDuelHooks({hooks: []}).map((h) => h.id), ['hook-1', 'hook-2', 'hook-3']);
  // returns a fresh copy (not the module constant)
  assert.notEqual(ensureDuelHooks({}), DEFAULT_DUEL_HOOKS);
});

test('ensureDuelHooks keeps a doc\'s own hooks', () => {
  const own = ensureDuelHooks({hooks: [{id: 'a', text: 'x'}, {text: 'y'}]});
  assert.deepEqual(own, [{id: 'a', text: 'x'}, {id: 'hook-2', text: 'y'}]);
});

test('ensureDuelHooks upgrades a legacy single hook to hook-1', () => {
  assert.deepEqual(ensureDuelHooks({hook: {text: 'legacy'}}), [{id: 'hook-1', text: 'legacy'}]);
});

test('normalizeHookId: bare number → hook-N; passthrough; falsy → null', () => {
  assert.equal(normalizeHookId('2'), 'hook-2');
  assert.equal(normalizeHookId('hook-3'), 'hook-3');
  assert.equal(normalizeHookId(undefined), null);
  assert.equal(normalizeHookId(true), null);
});

test('resolveSharedHook reads the shared audio/hooks manifest (buffered duration + abs path)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-hooks-'));
  const hooksDir = path.join(root, 'audio', 'hooks');
  fs.mkdirSync(hooksDir, {recursive: true});
  fs.writeFileSync(
    path.join(hooksDir, 'manifest.json'),
    JSON.stringify({
      hooks: {
        'hook-2': {file: 'hook-2.wav', text: 'بتعرف شو عم بقولو', durationSeconds: 3.1, bufferedSeconds: 3.6}
      }
    })
  );
  const active = resolveSharedHook(root, 'hook-2');
  assert.equal(active.id, 'hook-2');
  assert.equal(active.durationSeconds, 3.6); // bufferedSeconds wins
  assert.equal(active.rawSeconds, 3.1);
  assert.equal(active.wavPath, path.join(hooksDir, 'hook-2.wav'));
  // unknown id or no manifest → null
  assert.equal(resolveSharedHook(root, 'hook-9'), null);
  assert.equal(resolveSharedHook(root, null), null);
  assert.equal(resolveSharedHook(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-')), 'hook-2'), null);
});

test('resolveSharedOutro reads the shared ending audio from the shared manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-outro-'));
  const hooksDir = path.join(root, 'audio', 'hooks');
  fs.mkdirSync(hooksDir, {recursive: true});
  fs.writeFileSync(
    path.join(hooksDir, 'manifest.json'),
    JSON.stringify({
      outro: {file: 'outro.wav', text: 'التفاصيل الكاملة بتلاقوها بالYoutube', durationSeconds: 1.8, bufferedSeconds: 2.3}
    })
  );
  const outro = resolveSharedOutro(root);
  assert.equal(outro.text, 'التفاصيل الكاملة بتلاقوها بالYoutube');
  assert.equal(outro.durationSeconds, 2.3);
  assert.equal(outro.rawSeconds, 1.8);
  assert.equal(outro.wavPath, path.join(hooksDir, 'outro.wav'));
  assert.equal(resolveSharedOutro(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-outro-'))), null);
});
