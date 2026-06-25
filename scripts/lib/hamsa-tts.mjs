// Hamsa realtime TTS core — extracted from audio/generate-outlet-audio.mjs so the
// quote-duel audio script can reuse the exact same provider plumbing (auth, voice
// catalog lookup, voice-pool fallback, WAV duration parsing) instead of cloning
// the 880-line monolith and drifting.
//
// Behaviour is preserved verbatim. The only structural change: the voice-fallback
// orchestration (previously module-level mutable state in the briefing generator)
// is wrapped in createHamsaVoiceRunner() so each caller gets its own isolated
// state and so it can be unit-tested by injecting `resolveVoice` / `call`.
//
// The briefing generator still owns its scene/caption/override/manifest logic;
// only the provider boundary lives here.

import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';

export const DEFAULTS = {
  endpoint: 'https://api.tryhamsa.com/v1/realtime/tts',
  projectEndpoint: 'https://api.tryhamsa.com/v1/projects/by-api-key',
  voicesEndpoint: 'https://api.tryhamsa.com/v2/tts/voices',
  speakerPool: ['Lamees', 'Marwan', 'Nabil', 'Gassan'],
  dialect: 'leb'
};

export const compactDetails = (value) => {
  const details = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!details) return '';
  return details.length > 500 ? `${details.slice(0, 497)}...` : details;
};

export const describeLikelyHamsaCause = (status, details) => {
  const normalizedDetails = String(details ?? '').toLowerCase();
  if (status === 401 || status === 403) {
    return 'The API key was sent, but Hamsa rejected authorization.';
  }
  if (status === 402 || /credit|quota|balance|payment|billing/.test(normalizedDetails)) {
    return 'The API key was sent; this looks like a credits, quota, balance, or billing issue.';
  }
  if (status === 429) {
    return 'The API key was sent; this looks like a Hamsa rate-limit or quota issue.';
  }
  return 'The API key was sent, but Hamsa returned an API error.';
};

export const formatHamsaApiError = ({status, details, context}) => {
  const cause = describeLikelyHamsaCause(status, details);
  const compacted = compactDetails(details);
  return `${context} failed with HTTP ${status}. ${cause}${compacted ? ` Details: ${compacted}` : ''}`;
};

export class HamsaApiError extends Error {
  constructor({status, details, context}) {
    super(formatHamsaApiError({status, details, context}));
    this.name = 'HamsaApiError';
    this.status = status;
    this.details = details;
    this.context = context;
  }
}

export const classifyError = (error) => {
  if (error instanceof HamsaApiError) {
    if (error.status === 401 || error.status === 403) return 'hamsa-auth';
    if (error.status === 402 || error.status === 429 || /credit|quota|balance|payment|billing/i.test(error.details)) {
      return 'hamsa-credits-or-quota';
    }
    return 'hamsa-api';
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('HAMSA_API_KEY')) return 'missing-api-key';
  return 'local-error';
};

export const loadEnvFiles = (cwd) => {
  const loaded = [];
  const shellEnvKeys = new Set(Object.keys(process.env));
  for (const fileName of ['.env', '.env.local']) {
    const filePath = path.join(cwd, fileName);
    if (!fs.existsSync(filePath)) continue;
    const parsed = parseEnv(fs.readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (!shellEnvKeys.has(key)) process.env[key] = value;
    }
    loaded.push(fileName);
  }
  return loaded;
};

export const normalizeSpacing = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const parseList = (value) => String(value ?? '')
  .split(',')
  .map((item) => normalizeSpacing(item))
  .filter(Boolean);

export const getStableHash = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const seededShuffle = (items, seed) => {
  const shuffled = [...items];
  let state = getStableHash(seed) || 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

export const getWavDurationSeconds = (buffer) => {
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    return null;
  }
  let offset = 12;
  let byteRate = null;
  let dataSize = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const effectiveChunkSize = chunkSize === 0xffffffff ? buffer.length - chunkStart : chunkSize;
    if (chunkId === 'fmt ' && chunkStart + 16 <= buffer.length) {
      byteRate = buffer.readUInt32LE(chunkStart + 8);
    }
    if (chunkId === 'data') dataSize = effectiveChunkSize;
    offset = chunkStart + effectiveChunkSize + (effectiveChunkSize % 2);
  }
  if (!byteRate || !dataSize) return null;
  return Number((dataSize / byteRate).toFixed(3));
};

export const hamsaAuthHeaders = (apiKey) => ({Authorization: `Token ${apiKey}`});

export const callHamsaRealtimeTts = async ({apiKey, text, speaker, dialect, endpoint}) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({text, speaker, dialect})
  });
  if (!response.ok) {
    const details = await response.text();
    throw new HamsaApiError({status: response.status, details, context: 'Hamsa realtime TTS'});
  }
  return Buffer.from(await response.arrayBuffer());
};

export const fetchHamsaJson = async (url, apiKey) => {
  const response = await fetch(url, {headers: hamsaAuthHeaders(apiKey)});
  const responseBody = await response.text();
  let json = null;
  try {
    json = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    json = null;
  }
  if (!response.ok || !json || json.success === false) {
    throw new HamsaApiError({
      status: response.status,
      details: json ? JSON.stringify(json) : responseBody,
      context: 'Hamsa catalog request'
    });
  }
  return json;
};

export const resolveHamsaProjectId = async (apiKey, projectEndpoint = DEFAULTS.projectEndpoint) => {
  const json = await fetchHamsaJson(process.env.HAMSA_PROJECT_ENDPOINT || projectEndpoint, apiKey);
  if (!json.data?.id) throw new Error('Hamsa project lookup did not return data.id.');
  return json.data.id;
};

export const resolveHamsaVoice = async ({apiKey, speaker, dialect, voicesEndpoint = DEFAULTS.voicesEndpoint}) => {
  if (process.env.HAMSA_TTS_SPEAKER_ID) {
    return {id: process.env.HAMSA_TTS_SPEAKER_ID, name: speaker, dialect: {languageCode: dialect}, source: 'env'};
  }
  const projectId = process.env.HAMSA_PROJECT_ID || await resolveHamsaProjectId(apiKey);
  const url = new URL(process.env.HAMSA_TTS_VOICES_ENDPOINT || voicesEndpoint);
  url.searchParams.set('q', speaker);
  url.searchParams.set('page', '1');
  url.searchParams.set('perPage', '20');
  url.searchParams.set('source', 'jobs');
  url.searchParams.set('projectId', projectId);

  const json = await fetchHamsaJson(url, apiKey);
  const normalizedSpeaker = speaker.trim().toLowerCase();
  const voice = (json.data?.voices ?? []).find((entry) => {
    const nameMatches = entry.name?.trim().toLowerCase() === normalizedSpeaker;
    const dialectMatches = !dialect || entry.dialect?.languageCode === dialect;
    return nameMatches && dialectMatches;
  });
  if (!voice) throw new Error(`Could not find Hamsa voice "${speaker}" for dialect "${dialect}".`);
  return {...voice, projectId, source: 'catalog'};
};

export const getRealtimeTtsSpeaker = (voice, fallbackSpeaker) => {
  if (voice.source === 'env' && voice.id) return voice.id;
  return normalizeSpacing(voice.name || fallbackSpeaker);
};

export const shouldTryNextVoice = (error) => {
  if (error instanceof HamsaApiError) return ![401, 402, 403, 429].includes(error.status);
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Could not find Hamsa voice');
};

/**
 * Voice-pool fallback runner. Encapsulates the per-run state (resolved voices,
 * failed speakers, the sticky selected speaker) that the briefing generator kept
 * at module scope. Stateful within a run; one runner per generation batch.
 *
 *   try speaker → resolve voice → call TTS
 *     ok        → stick to this speaker for the rest of the batch, return audio
 *     retryable → mark failed, try next candidate
 *     fatal     → (401/402/403/429) stop, rethrow
 *
 * @param {object} cfg
 * @param {string} cfg.apiKey
 * @param {string} cfg.dialect
 * @param {string[]} cfg.speakerCandidates - ordered candidate pool
 * @param {string} [cfg.endpoint]
 * @param {(speaker:string)=>Promise<object>} [cfg.resolveVoice] - injectable for tests/dry-run
 * @param {(args:object)=>Promise<Buffer>} [cfg.call] - injectable TTS call for tests
 */
export const createHamsaVoiceRunner = ({
  apiKey,
  dialect,
  speakerCandidates,
  endpoint = DEFAULTS.endpoint,
  resolveVoice,
  call = callHamsaRealtimeTts
}) => {
  const resolvedVoiceBySpeaker = new Map();
  const failedSpeakers = new Set();
  const fallbackAttempts = [];
  let selectedSpeaker = null;
  let selectedVoice = null;

  const defaultResolve = (speaker) => resolveHamsaVoice({apiKey, speaker, dialect});
  const resolve = resolveVoice ?? defaultResolve;

  const getResolvedVoice = async (speaker) => {
    if (resolvedVoiceBySpeaker.has(speaker)) return resolvedVoiceBySpeaker.get(speaker);
    const voice = await resolve(speaker);
    resolvedVoiceBySpeaker.set(speaker, voice);
    return voice;
  };

  const attemptOrder = () => [
    ...(selectedSpeaker && !failedSpeakers.has(selectedSpeaker) ? [selectedSpeaker] : []),
    ...speakerCandidates.filter((s) => s !== selectedSpeaker && !failedSpeakers.has(s))
  ];

  const generate = async (text) => {
    const attempts = [];
    for (const candidateSpeaker of attemptOrder()) {
      try {
        const voice = await getResolvedVoice(candidateSpeaker);
        const ttsSpeaker = getRealtimeTtsSpeaker(voice, candidateSpeaker);
        const audio = await call({apiKey, text, speaker: ttsSpeaker, dialect, endpoint});
        selectedVoice = voice;
        selectedSpeaker = candidateSpeaker;
        return {audio, voice, ttsSpeaker, attempts};
      } catch (error) {
        const attempt = {
          speaker: candidateSpeaker,
          status: error instanceof HamsaApiError ? error.status : null,
          errorCategory: classifyError(error),
          error: error instanceof Error ? error.message : String(error)
        };
        attempts.push(attempt);
        fallbackAttempts.push(attempt);
        if (!shouldTryNextVoice(error)) {
          error.voiceAttempts = attempts;
          throw error;
        }
        failedSpeakers.add(candidateSpeaker);
      }
    }
    const lastAttempt = attempts[attempts.length - 1];
    const error = new Error(lastAttempt
      ? `All Hamsa voice candidates failed. Last error for ${lastAttempt.speaker}: ${lastAttempt.error}`
      : 'No Hamsa voice candidates were available.');
    error.voiceAttempts = attempts;
    throw error;
  };

  return {
    generate,
    fallbackAttempts,
    get selectedSpeaker() {
      return selectedSpeaker;
    },
    get selectedVoice() {
      return selectedVoice;
    }
  };
};
