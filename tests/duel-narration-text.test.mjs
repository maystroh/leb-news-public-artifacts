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
