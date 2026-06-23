import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeDuelTimeline,
  calculateQuoteDuelDurationInFrames,
  mergeDuelAudioManifest,
  fpsFromSeconds
} from '../scripts/lib/duel-timeline.mjs';

const FPS = 30;

const duelDoc = (scenes, extra = {}) => ({scenes, ...extra});
const scene = (id, durationSeconds, extra = {}) => ({id, durationSeconds, ...extra});

test('frame-quantized offsets accumulate in frames (no second-precision drift)', () => {
  // 9.017s * 30 = 270.51 → rounds to 271 frames each. Three duels: starts must
  // be exact frame multiples, not second-rounded.
  const t = computeDuelTimeline(
    duelDoc([scene('duel-1', 9.017), scene('duel-2', 9.017), scene('duel-3', 9.017)]),
    FPS
  );
  const f = fpsFromSeconds(9.017, FPS); // 271
  assert.equal(f, 271);
  assert.deepEqual(
    t.duels.map((d) => d.startFrame),
    [0, 271, 542]
  );
  assert.deepEqual(
    t.duels.map((d) => d.durationFrames),
    [271, 271, 271]
  );
  assert.equal(t.totalFrames, 813);
  // seconds echoed from frames so split/mux agree with comp
  assert.equal(t.duels[1].startSeconds, Number((271 / 30).toFixed(3)));
  // each clip is contiguous: end of N == start of N+1
  assert.equal(t.duels[0].endFrame, t.duels[1].startFrame);
  assert.equal(t.duels[1].endFrame, t.duels[2].startFrame);
});

test('calculateQuoteDuelDurationInFrames == timeline total', () => {
  const doc = duelDoc([scene('duel-1', 9), scene('duel-2', 8.4)]);
  assert.equal(
    calculateQuoteDuelDurationInFrames(doc, FPS),
    computeDuelTimeline(doc, FPS).totalFrames
  );
});

test('rank defaults to source order; main = rank<=3', () => {
  const t = computeDuelTimeline(
    duelDoc([
      scene('duel-1', 9),
      scene('duel-2', 9),
      scene('duel-3', 9),
      scene('duel-4', 9)
    ]),
    FPS
  );
  assert.deepEqual(t.duels.map((d) => d.rank), [1, 2, 3, 4]);
  assert.deepEqual(t.duels.map((d) => d.main), [true, true, true, false]);
  assert.deepEqual(t.mainPlan, ['duel-1', 'duel-2', 'duel-3']);
});

test('explicit ranks drive main + full-reel order', () => {
  const t = computeDuelTimeline(
    duelDoc([
      scene('a', 9, {rank: 4}),
      scene('b', 9, {rank: 1}),
      scene('c', 9, {rank: 2}),
      scene('d', 9, {rank: 3})
    ]),
    FPS
  );
  // main = rank<=3 → b,c,d ; full plan in rank order
  assert.deepEqual(t.mainPlan, ['b', 'c', 'd']);
  assert.equal(t.duels.find((d) => d.duelId === 'a').main, false);
});

test('N<3 → full reel = all duels', () => {
  const t = computeDuelTimeline(duelDoc([scene('duel-1', 9), scene('duel-2', 9)]), FPS);
  assert.deepEqual(t.mainPlan, ['duel-1', 'duel-2']);
  assert.deepEqual(t.duels.map((d) => d.main), [true, true]);
});

test('all ranks > mainRank → fall back to top-N by rank', () => {
  const t = computeDuelTimeline(
    duelDoc([scene('a', 9, {rank: 7}), scene('b', 9, {rank: 5}), scene('c', 9, {rank: 9})]),
    FPS
  );
  // none have rank<=3 → top-3 by rank = b(5),a(7),c(9)
  assert.deepEqual(t.mainPlan, ['b', 'a', 'c']);
});

test('60s cap drops lowest-rank main until it fits', () => {
  // 4 duels @ 20s, ranks 1..4. main = 1,2,3 = 60s exactly OK; force over with 20.1
  const t = computeDuelTimeline(
    duelDoc([
      scene('d1', 20.1, {rank: 1}),
      scene('d2', 20.1, {rank: 2}),
      scene('d3', 20.1, {rank: 3})
    ]),
    FPS,
    {maxFullSeconds: 60}
  );
  // 3 * ~20.1 = 60.3 > 60 → drop rank 3
  assert.deepEqual(t.mainPlan, ['d1', 'd2']);
  assert.deepEqual(t.droppedFromFull, ['d3']);
  assert.ok(t.fullSeconds <= 60);
  assert.ok(t.warnings.some((w) => /over 60s/.test(w)));
});

test('skip-on-missing-audio (requireAudio) excludes duel but keeps source-ordinal identity', () => {
  const t = computeDuelTimeline(
    duelDoc([
      scene('duel-1', 9, {audio: {src: 'a/1.wav', durationSeconds: 9}}),
      scene('duel-2', 9), // no audio
      scene('duel-3', 9, {audio: {src: 'a/3.wav', durationSeconds: 9}})
    ]),
    FPS,
    {requireAudio: true}
  );
  const d2 = t.duels.find((d) => d.duelId === 'duel-2');
  assert.equal(d2.skipped, true);
  assert.equal(d2.skipReason, 'missing-audio');
  assert.equal(d2.startFrame, null);
  // identity is preserved: index stays 2, duel-3 keeps index 3
  assert.equal(d2.index, 2);
  assert.equal(t.duels.find((d) => d.duelId === 'duel-3').index, 3);
  // offsets only count survivors: duel-3 starts right after duel-1
  const d1 = t.duels.find((d) => d.duelId === 'duel-1');
  const d3 = t.duels.find((d) => d.duelId === 'duel-3');
  assert.equal(d3.startFrame, d1.endFrame);
  assert.ok(t.warnings.some((w) => /Skipping duel-2/.test(w)));
});

test('requireAudio=false keeps declared durations (silent placeholder render)', () => {
  const t = computeDuelTimeline(
    duelDoc([scene('duel-1', 9), scene('duel-2', 9)]),
    FPS,
    {requireAudio: false}
  );
  assert.equal(t.duels.every((d) => !d.skipped), true);
  assert.equal(t.totalFrames, fpsFromSeconds(9, FPS) * 2);
});

test('explicit scene.skipped flag is honored', () => {
  const t = computeDuelTimeline(
    duelDoc([scene('duel-1', 9), scene('duel-2', 9, {skipped: true})]),
    FPS
  );
  assert.equal(t.duels[1].skipped, true);
  assert.equal(t.duels[1].skipReason, 'flagged');
  assert.equal(t.totalFrames, fpsFromSeconds(9, FPS));
});

test('declared (buffered) durationSeconds is the clip length; audio is just src/skip signal', () => {
  // scene.durationSeconds carries audio+buffer after build:folder. Audio's own
  // durationSeconds (raw) must NOT override it, or the 0.5s buffer is lost.
  const t = computeDuelTimeline(
    duelDoc([scene('duel-1', 9.5, {audio: {src: 'a/1.wav', durationSeconds: 9.0}})]),
    FPS
  );
  assert.equal(t.duels[0].durationFrames, fpsFromSeconds(9.5, FPS));
});

test('falls back to audio duration when no declared duration yet', () => {
  const t = computeDuelTimeline(
    duelDoc([{id: 'duel-1', audio: {src: 'a/1.wav', durationSeconds: 8.2}}]),
    FPS
  );
  assert.equal(t.duels[0].durationFrames, fpsFromSeconds(8.2, FPS));
});

test('coldOpenSeconds offsets the first clip; defaults to 0', () => {
  const base = computeDuelTimeline(duelDoc([scene('duel-1', 9)]), FPS);
  assert.equal(base.coldOpenFrames, 0);
  assert.equal(base.duels[0].startFrame, 0);

  const withCold = computeDuelTimeline(duelDoc([scene('duel-1', 9)]), FPS, {
    coldOpenSeconds: 1.5
  });
  assert.equal(withCold.coldOpenFrames, fpsFromSeconds(1.5, FPS)); // 45
  assert.equal(withCold.duels[0].startFrame, 45);
  assert.equal(withCold.totalFrames, 45 + fpsFromSeconds(9, FPS));

  // also reads duel.coldOpen.durationSeconds
  const fromDoc = computeDuelTimeline(
    duelDoc([scene('duel-1', 9)], {coldOpen: {durationSeconds: 1}}),
    FPS
  );
  assert.equal(fromDoc.coldOpenFrames, 30);
});

test('hook: duel.hook.durationSeconds drives the coldOpen offset', () => {
  const t = computeDuelTimeline(
    duelDoc([scene('duel-1', 9)], {hook: {text: 'اليوم شو عم بقولوا للبنانية', durationSeconds: 2.3}}),
    FPS
  );
  assert.equal(t.coldOpenFrames, fpsFromSeconds(2.3, FPS));
  assert.equal(t.duels[0].startFrame, fpsFromSeconds(2.3, FPS));
});

test('hook: text-only falls back to a 2.5s hook', () => {
  const t = computeDuelTimeline(duelDoc([scene('duel-1', 9)], {hook: {text: 'لحظة'}}), FPS);
  assert.equal(t.coldOpenFrames, fpsFromSeconds(2.5, FPS));
});

test('hook: no hook field → no offset (default)', () => {
  const t = computeDuelTimeline(duelDoc([scene('duel-1', 9)]), FPS);
  assert.equal(t.coldOpenFrames, 0);
  assert.equal(t.duels[0].startFrame, 0);
});

test('mergeDuelAudioManifest merges duel audio + hook duration/text', () => {
  const duel = duelDoc(
    [scene('duel-1', 9), scene('duel-2', 9)],
    {hook: {text: 'اليوم شو عم بقولوا للبنانية'}}
  );
  const manifest = {
    hook: {file: 'hook.wav', src: '../audio/hook.wav', durationSeconds: 2.0, bufferedSeconds: 2.5},
    audioByDuel: {
      'duel-1': {file: 'duel-01.wav', src: '../audio/duel-01.wav', durationSeconds: 8.7, skipped: false},
      'duel-2': {skipped: true}
    }
  };
  const merged = mergeDuelAudioManifest(duel, manifest);
  assert.equal(merged.hook.durationSeconds, 2.5); // bufferedSeconds wins
  assert.equal(merged.hook.text, 'اليوم شو عم بقولوا للبنانية'); // text from duel
  assert.equal(merged.hook.audioSrc, '../audio/hook.wav');
  assert.deepEqual(merged.scenes[0].audio, {src: '../audio/duel-01.wav', durationSeconds: 8.7, file: 'duel-01.wav'});
  assert.equal(merged.scenes[1].audio, undefined); // skipped not merged
  // and the merged doc drives the timeline hook offset
  const t = computeDuelTimeline(merged, FPS, {requireAudio: true});
  assert.equal(t.coldOpenFrames, fpsFromSeconds(2.5, FPS));
});

test('empty scenes → zero-length timeline, no crash', () => {
  const t = computeDuelTimeline(duelDoc([]), FPS);
  assert.equal(t.totalFrames, 0);
  assert.deepEqual(t.duels, []);
  assert.deepEqual(t.mainPlan, []);
});

test('missing id falls back to source-ordinal duelId', () => {
  const t = computeDuelTimeline(duelDoc([scene(undefined, 9)]), FPS);
  assert.equal(t.duels[0].duelId, 'duel-1');
});
