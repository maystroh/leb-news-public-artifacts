import assert from 'node:assert/strict';
import test from 'node:test';

import {DEFAULT_DUEL_HOOKS, DEFAULT_HOOK_ID, ensureDuelHooks} from '../scripts/lib/duel-hooks.mjs';

test('defaults: hook-2 is the selected/known phrase', () => {
  assert.equal(DEFAULT_HOOK_ID, 'hook-2');
  const h2 = DEFAULT_DUEL_HOOKS.find((h) => h.id === 'hook-2');
  assert.match(h2.text, /بتعرف شو عم بقولو/);
  assert.deepEqual(DEFAULT_DUEL_HOOKS.map((h) => h.id), ['hook-1', 'hook-2', 'hook-3']);
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
