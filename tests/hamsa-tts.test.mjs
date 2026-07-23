import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HamsaApiError,
  classifyError,
  describeLikelyHamsaCause,
  formatHamsaApiError,
  compactDetails,
  shouldTryNextVoice,
  getStableHash,
  seededShuffle,
  getWavDurationSeconds,
  getRealtimeTtsSpeaker,
  resolveHamsaVoice,
  createHamsaVoiceRunner
} from '../scripts/lib/hamsa-tts.mjs';

// Build a minimal valid WAV so getWavDurationSeconds has a known answer.
const makeWav = (byteRate, dataSize) => {
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24); // sample rate
  buf.writeUInt32LE(byteRate, 28); // byte rate
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  return buf;
};

test('getWavDurationSeconds parses RIFF/fmt/data; rejects non-WAV', () => {
  // 32000 byte/s, 64000 bytes data → 2.0s
  assert.equal(getWavDurationSeconds(makeWav(32000, 64000)), 2);
  assert.equal(getWavDurationSeconds(Buffer.from('not a wav file at all')), null);
});

test('seededShuffle is deterministic per seed and a permutation', () => {
  const pool = ['Lamees', 'Marwan', 'Nabil', 'Gassan'];
  const a = seededShuffle(pool, '2026-06-19');
  const b = seededShuffle(pool, '2026-06-19');
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [...pool].sort());
  // different seed → (very likely) different order, still a permutation
  assert.deepEqual([...seededShuffle(pool, 'other')].sort(), [...pool].sort());
});

test('getStableHash is stable and unsigned', () => {
  assert.equal(getStableHash('abc'), getStableHash('abc'));
  assert.ok(getStableHash('abc') >= 0);
});

test('error classification matches provider semantics', () => {
  assert.equal(classifyError(new HamsaApiError({status: 401, details: '', context: 'x'})), 'hamsa-auth');
  assert.equal(classifyError(new HamsaApiError({status: 402, details: '', context: 'x'})), 'hamsa-credits-or-quota');
  assert.equal(classifyError(new HamsaApiError({status: 429, details: '', context: 'x'})), 'hamsa-credits-or-quota');
  assert.equal(classifyError(new HamsaApiError({status: 500, details: '', context: 'x'})), 'hamsa-api');
  assert.equal(classifyError(new Error('HAMSA_API_KEY missing')), 'missing-api-key');
  assert.equal(classifyError(new Error('boom')), 'local-error');
});

test('describeLikelyHamsaCause + formatHamsaApiError + compactDetails', () => {
  assert.match(describeLikelyHamsaCause(401), /rejected authorization/);
  assert.match(describeLikelyHamsaCause(402), /credits, quota/);
  assert.match(describeLikelyHamsaCause(500, 'balance too low'), /credits, quota/);
  assert.match(formatHamsaApiError({status: 429, details: 'slow down', context: 'TTS'}), /HTTP 429.*rate-limit/);
  assert.equal(compactDetails('  a   b  '), 'a b');
  assert.equal(compactDetails('x'.repeat(600)).length, 500);
});

test('shouldTryNextVoice: retry transient/not-found, stop on auth/credits/rate', () => {
  assert.equal(shouldTryNextVoice(new HamsaApiError({status: 500, details: '', context: 'x'})), true);
  assert.equal(shouldTryNextVoice(new Error('Could not find Hamsa voice "X"')), true);
  for (const status of [401, 402, 403, 429]) {
    assert.equal(shouldTryNextVoice(new HamsaApiError({status, details: '', context: 'x'})), false);
  }
  assert.equal(shouldTryNextVoice(new Error('totally unrelated')), false);
});

test('getRealtimeTtsSpeaker prefers any resolved id, else normalized name', () => {
  assert.equal(getRealtimeTtsSpeaker({source: 'env', id: 'voice_123'}, 'Lamees'), 'voice_123');
  // Catalog voices carry an id too — pin it so the realtime endpoint uses the
  // exact dialect-filtered voice instead of re-resolving the ambiguous name.
  assert.equal(getRealtimeTtsSpeaker({source: 'catalog', id: 'voice_abc', name: 'Marwan'}, 'Lamees'), 'voice_abc');
  assert.equal(getRealtimeTtsSpeaker({source: 'catalog', name: '  Nabil  '}, 'Lamees'), 'Nabil');
});

test('resolveHamsaVoice matches name+dialect via injected fetch', async () => {
  const origFetch = global.fetch;
  const origEnv = {...process.env};
  process.env.HAMSA_PROJECT_ID = 'proj-1';
  delete process.env.HAMSA_TTS_SPEAKER_ID;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      success: true,
      data: {voices: [
        {name: 'Lamees', dialect: {languageCode: 'leb'}, id: 'v1'},
        {name: 'Nabil', dialect: {languageCode: 'leb'}, id: 'v2'}
      ]}
    })
  });
  try {
    const voice = await resolveHamsaVoice({apiKey: 'k', speaker: 'Nabil', dialect: 'leb'});
    assert.equal(voice.id, 'v2');
    assert.equal(voice.source, 'catalog');
    await assert.rejects(
      resolveHamsaVoice({apiKey: 'k', speaker: 'Ghassan', dialect: 'leb'}),
      /Could not find Hamsa voice/
    );
  } finally {
    global.fetch = origFetch;
    process.env = origEnv;
  }
});

test('voice runner falls through retryable failures to the next candidate', async () => {
  const calls = [];
  const runner = createHamsaVoiceRunner({
    apiKey: 'k',
    dialect: 'leb',
    speakerCandidates: ['Lamees', 'Nabil'],
    resolveVoice: async (speaker) => ({source: 'catalog', name: speaker}),
    call: async ({speaker}) => {
      calls.push(speaker);
      if (speaker === 'Lamees') throw new HamsaApiError({status: 500, details: '', context: 'x'});
      return Buffer.from('audio');
    }
  });
  const result = await runner.generate('مرحبا');
  assert.equal(result.ttsSpeaker, 'Nabil');
  assert.deepEqual(calls, ['Lamees', 'Nabil']);
  assert.equal(runner.selectedSpeaker, 'Nabil');
  assert.equal(runner.fallbackAttempts.length, 1);
});

test('voice runner stops immediately on a fatal auth error', async () => {
  const runner = createHamsaVoiceRunner({
    apiKey: 'k',
    dialect: 'leb',
    speakerCandidates: ['Lamees', 'Nabil'],
    resolveVoice: async (speaker) => ({source: 'catalog', name: speaker}),
    call: async () => {
      throw new HamsaApiError({status: 401, details: 'nope', context: 'x'});
    }
  });
  await assert.rejects(runner.generate('x'), (err) => err.status === 401);
});

test('voice runner sticks to the selected speaker on subsequent generates', async () => {
  let lameesCalls = 0;
  const runner = createHamsaVoiceRunner({
    apiKey: 'k',
    dialect: 'leb',
    speakerCandidates: ['Lamees', 'Nabil'],
    resolveVoice: async (speaker) => ({source: 'catalog', name: speaker}),
    call: async ({speaker}) => {
      if (speaker === 'Lamees') lameesCalls += 1;
      return Buffer.from('a');
    }
  });
  await runner.generate('one');
  await runner.generate('two');
  // Lamees succeeded first; it should be reused (sticky), not re-shuffled.
  assert.equal(lameesCalls, 2);
  assert.equal(runner.selectedSpeaker, 'Lamees');
});
