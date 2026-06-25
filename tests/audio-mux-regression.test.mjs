import assert from 'node:assert/strict';
import test from 'node:test';

import {buildMuxFilterComplex} from '../scripts/lib/audio-mux.mjs';

// Frozen copy of the ORIGINAL inline filter_complex logic from
// mux-briefing-audio.mjs (pre-extraction). The extracted lib must produce a
// byte-identical string for every input shape, proving the briefing mux audio
// graph is unchanged. If the briefing's audio ever legitimately changes, update
// BOTH this frozen copy and the lib together — divergence here is a red flag.
const originalInline = ({audioEntries, totalMs, musicPath, musicDb, musicDuck}) => {
  const filterParts = audioEntries.map((entry, index) =>
    `[${index + 1}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${entry.delayMs}:all=1[a${index}]`
  );
  const mixInputs = audioEntries.map((_, index) => `[a${index}]`).join('');

  let filterComplex;
  if (musicPath) {
    const bedInputIndex = audioEntries.length + 1;
    const fadeStartSec = Math.max(0, (totalMs - 1500) / 1000).toFixed(3);
    const bedChain = [
      `[${bedInputIndex}:a]aresample=44100`,
      'aformat=sample_fmts=fltp:channel_layouts=stereo',
      `volume=${musicDb}dB`,
      `afade=t=out:st=${fadeStartSec}:d=1.5[bed]`
    ].join(',');
    const voiceChain = `${mixInputs}amix=inputs=${audioEntries.length}:normalize=0:dropout_transition=0[voice]`;
    const mixChain = musicDuck
      ? `[voice]asplit=2[voiceMix][voiceSc];[bed][voiceSc]sidechaincompress=threshold=0.02:ratio=12:attack=180:release=900[bedduck];[voiceMix][bedduck]amix=inputs=2:normalize=0:dropout_transition=0,apad[aout]`
      : `[voice][bed]amix=inputs=2:normalize=0:dropout_transition=0,apad[aout]`;
    filterComplex = [...filterParts, voiceChain, bedChain, mixChain].join(';');
  } else {
    filterComplex = [
      ...filterParts,
      `${mixInputs}amix=inputs=${audioEntries.length}:normalize=0:dropout_transition=0,apad[aout]`
    ].join(';');
  }
  return filterComplex;
};

const sampleEntries = (n) =>
  Array.from({length: n}, (_, i) => ({delayMs: i * 4500, label: `s${i}`}));

const cases = [
  {name: '1 track, no music', entries: 1, totalMs: 9000, musicPath: null},
  {name: '3 tracks, no music', entries: 3, totalMs: 27000, musicPath: null},
  {name: '12 tracks, no music', entries: 12, totalMs: 240000, musicPath: null},
  {name: '5 tracks, music ducked', entries: 5, totalMs: 90000, musicPath: 'bed.mp3', musicDb: -22, musicDuck: true},
  {name: '5 tracks, music no-duck', entries: 5, totalMs: 90000, musicPath: 'bed.mp3', musicDb: -18, musicDuck: false},
  {name: 'short timeline (fade clamps to 0)', entries: 2, totalMs: 1000, musicPath: 'bed.mp3', musicDb: -22, musicDuck: true}
];

for (const c of cases) {
  test(`filter_complex byte-identical to original — ${c.name}`, () => {
    const audioEntries = sampleEntries(c.entries);
    const expected = originalInline({
      audioEntries,
      totalMs: c.totalMs,
      musicPath: c.musicPath,
      musicDb: c.musicDb,
      musicDuck: c.musicDuck
    });
    const actual = buildMuxFilterComplex({
      audioEntries,
      totalMs: c.totalMs,
      music: c.musicPath ? {db: c.musicDb, duck: c.musicDuck} : null
    });
    assert.equal(actual, expected);
  });
}
