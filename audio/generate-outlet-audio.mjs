import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';

import {patchWavHeaderSizes} from '../scripts/lib/wav-header.mjs';

const DEFAULTS = {
  endpoint: 'https://api.tryhamsa.com/v1/realtime/tts',
  projectEndpoint: 'https://api.tryhamsa.com/v1/projects/by-api-key',
  voicesEndpoint: 'https://api.tryhamsa.com/v2/tts/voices',
  speakerPool: ['Marwan'],
  dialect: 'leb',
  outputFormat: 'wav',
  textSource: 'body'
};

class HamsaApiError extends Error {
  constructor({status, details, context}) {
    super(formatHamsaApiError({status, details, context}));
    this.name = 'HamsaApiError';
    this.status = status;
    this.details = details;
    this.context = context;
  }
}

const loadEnvFiles = (cwd) => {
  const loaded = [];
  const shellEnvKeys = new Set(Object.keys(process.env));

  for (const fileName of ['.env', '.env.local']) {
    const filePath = path.join(cwd, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = parseEnv(fs.readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (!shellEnvKeys.has(key)) {
        process.env[key] = value;
      }
    }
    loaded.push(fileName);
  }

  return loaded;
};

const compactDetails = (value) => {
  const details = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!details) {
    return '';
  }
  return details.length > 500 ? `${details.slice(0, 497)}...` : details;
};

const describeLikelyHamsaCause = (status, details) => {
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

const formatHamsaApiError = ({status, details, context}) => {
  const cause = describeLikelyHamsaCause(status, details);
  const compacted = compactDetails(details);
  return `${context} failed with HTTP ${status}. ${cause}${compacted ? ` Details: ${compacted}` : ''}`;
};

const classifyError = (error) => {
  if (error instanceof HamsaApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'hamsa-auth';
    }
    if (error.status === 402 || error.status === 429 || /credit|quota|balance|payment|billing/i.test(error.details)) {
      return 'hamsa-credits-or-quota';
    }
    return 'hamsa-api';
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('HAMSA_API_KEY')) {
    return 'missing-api-key';
  }
  return 'local-error';
};

const parseCliArgs = (argv) => {
  const args = {
    date: null,
    folder: null,
    force: false,
    dryRun: false,
    first: false,
    limit: null,
    existingOnly: false,
    textSource: DEFAULTS.textSource
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--date') {
      args.date = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--folder') {
      args.folder = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--existing-only') {
      args.existingOnly = true;
      continue;
    }
    if (arg === '--first') {
      args.first = true;
      args.limit = 1;
      continue;
    }
    if (arg === '--limit') {
      const rawLimit = argv[index + 1];
      const limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error(`Invalid --limit value: ${rawLimit}`);
      }
      args.limit = limit;
      index += 1;
      continue;
    }
    if (arg === '--text-source') {
      args.textSource = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
};

const findLatestBriefingFolder = (cwd) => {
  const briefingsDir = path.join(cwd, 'briefings');
  const entries = fs.existsSync(briefingsDir)
    ? fs.readdirSync(briefingsDir, {withFileTypes: true})
    : [];
  const dateFolders = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (dateFolders.length === 0) {
    throw new Error('No briefings/YYYY-MM-DD folders found.');
  }

  return path.join(briefingsDir, dateFolders[dateFolders.length - 1]);
};

const normalizeSpacing = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const SCENE_2_GREETING_PREFIX = 'صباح الخير من رادار بيروت';
const SCENE_2_AUDIO_PREFIX = 'صباح الخير من رادار بيروت؛ بملخص الصحافة اليوم منبلش من';
const QUESTION_HANDOFF_AUDIO_SUFFIX = '... وهيك منوصل لسؤال اليوم';
const LEGACY_QUESTION_HANDOFF_AUDIO_SUFFIX = '.. ... وهيك منوصل لسؤال اليوم';

const parseList = (value) => String(value ?? '')
  .split(',')
  .map((item) => normalizeSpacing(item))
  .filter(Boolean);

const getStableHash = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededShuffle = (items, seed) => {
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

const textFingerprint = (value) => String(getStableHash(normalizeSpacing(value)));

const normalizeOverrideStore = (raw) => {
  if (!raw || typeof raw !== 'object') return {};
  return raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : raw;
};

const resolveOverrideText = ({overrides, sceneId, defaultText}) => {
  const entry = overrides?.[sceneId];
  if (typeof entry === 'string') return normalizeSpacing(entry);
  if (!entry || typeof entry !== 'object') return '';
  if (entry.defaultTextHash && entry.defaultTextHash !== textFingerprint(defaultText)) return '';
  return normalizeSpacing(entry.text);
};

const selectSceneText = (scene, textSource) => {
  if (textSource === 'body') {
    return normalizeSpacing(scene.audioText || scene.body);
  }

  if (textSource === 'visual-summary') {
    return normalizeSpacing(scene.visual?.summary);
  }

  if (textSource === 'visual-layer') {
    return normalizeSpacing([
      scene.visual?.headline,
      scene.visual?.summary,
      scene.visual?.quote
    ].filter(Boolean).join('. '));
  }

  throw new Error(`Unsupported --text-source value: ${textSource}`);
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const removeScene2OutletHandoff = (text, outletName) => {
  let cleaned = normalizeSpacing(text);
  if (!outletName) return cleaned;
  const outletPattern = escapeRegExp(outletName);
  const patterns = [
    new RegExp(`^نبدأ\\s+من\\s+${outletPattern}\\s*[.،,]?\\s*`),
    new RegExp(`^منبلش\\s+من\\s+${outletPattern}\\s*[.،,]?\\s*`),
    new RegExp(`^${outletPattern}\\s*[.،,]?\\s*`)
  ];

  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  return cleaned;
};

const ensureScene2AudioPrefix = (scene, text) => {
  const normalized = normalizeSpacing(text);
  if (
    scene.id !== 'scene-2' ||
    !normalized ||
    normalized.startsWith(SCENE_2_AUDIO_PREFIX) ||
    normalized.startsWith(SCENE_2_GREETING_PREFIX)
  ) {
    return normalized;
  }

  const outletName = normalizeSpacing(scene.outlet?.name || scene.shortLabel || '');
  const withoutHandoff = removeScene2OutletHandoff(normalized, outletName);
  if (!outletName) return `${SCENE_2_AUDIO_PREFIX} ${withoutHandoff}`.trim();
  return `${SCENE_2_AUDIO_PREFIX} ${outletName}${withoutHandoff ? `، ${withoutHandoff}` : ''}`;
};

const isQuestionHandoffScene = (scene) => scene?.questionHandoff === true || scene?.id === 'scene-11';

const ensureQuestionHandoffSuffix = (scene, text) => {
  let normalized = normalizeSpacing(text);
  if (!isQuestionHandoffScene(scene) || !normalized) {
    return normalized;
  }

  for (const suffix of [LEGACY_QUESTION_HANDOFF_AUDIO_SUFFIX, QUESTION_HANDOFF_AUDIO_SUFFIX]) {
    if (normalized.endsWith(suffix)) {
      normalized = normalizeSpacing(normalized.slice(0, -suffix.length));
      break;
    }
  }

  const withoutStackedPause = normalizeSpacing(normalized.replace(/(?:\s*[.…]{2,})+$/u, ''));
  return `${withoutStackedPause} ${QUESTION_HANDOFF_AUDIO_SUFFIX}`;
};

const materializeSceneAudioText = (scene, text) => ensureQuestionHandoffSuffix(
  scene,
  ensureScene2AudioPrefix(scene, text)
);

const getScene2CaptionText = (scene, audioText) => {
  let captionText = normalizeSpacing(audioText);
  if (scene.id !== 'scene-2') return captionText;

  if (captionText.startsWith(SCENE_2_AUDIO_PREFIX)) {
    captionText = captionText.slice(SCENE_2_AUDIO_PREFIX.length).trim();
  } else if (captionText.startsWith(SCENE_2_GREETING_PREFIX)) {
    captionText = captionText.slice(SCENE_2_GREETING_PREFIX.length).trim();
    captionText = captionText
      .replace(/^[؛،,.!؟\s]*/, '')
      .replace(/^(?:ب?ملخص\s+الصحافة\s+اليوم|اليوم\s+البداية\s+من)\s*/u, '')
      .trim();
  }

  const outletName = normalizeSpacing(scene.outlet?.name || scene.shortLabel || '');
  captionText = removeScene2OutletHandoff(captionText, outletName);
  captionText = captionText.replace(/^حيث\s+/, '').trim();
  return captionText;
};

const stripTtsCueTextForCaptions = (text) => normalizeSpacing(String(text ?? '')
  // Pause/emotion cues may be useful for Hamsa, but should not leak into the
  // karaoke captions displayed on video.
  .replace(/\p{Extended_Pictographic}/gu, '')
  .replace(/\uFE0F/gu, '')
  .replace(/\.{3,}|…/g, ''));

const getCaptionStartOffsetSeconds = ({scene, audioText, captionText, audioDurationSeconds}) => {
  if (scene.id !== 'scene-2' || typeof audioDurationSeconds !== 'number' || audioDurationSeconds <= 0) {
    return 0;
  }

  const normalizedAudioText = normalizeSpacing(audioText);
  const normalizedCaptionText = normalizeSpacing(captionText);
  if (!normalizedAudioText || !normalizedCaptionText || !normalizedAudioText.endsWith(normalizedCaptionText)) {
    return 0;
  }

  const prefixChars = normalizedAudioText.length - normalizedCaptionText.length;
  if (prefixChars <= 0) return 0;
  return Number(((prefixChars / normalizedAudioText.length) * audioDurationSeconds).toFixed(3));
};

const getWavDurationSeconds = (buffer) => {
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

    if (chunkId === 'data') {
      dataSize = effectiveChunkSize;
    }

    offset = chunkStart + effectiveChunkSize + (effectiveChunkSize % 2);
  }

  if (!byteRate || !dataSize) {
    return null;
  }

  return Number((dataSize / byteRate).toFixed(3));
};

const callHamsaRealtimeTts = async ({apiKey, text, speaker, dialect, endpoint}) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      speaker,
      dialect
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new HamsaApiError({
      status: response.status,
      details,
      context: 'Hamsa realtime TTS'
    });
  }

  return Buffer.from(await response.arrayBuffer());
};

const hamsaAuthHeaders = (apiKey) => ({
  Authorization: `Token ${apiKey}`
});

const fetchHamsaJson = async (url, apiKey) => {
  const response = await fetch(url, {
    headers: hamsaAuthHeaders(apiKey)
  });

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

const resolveHamsaProjectId = async (apiKey) => {
  const json = await fetchHamsaJson(process.env.HAMSA_PROJECT_ENDPOINT || DEFAULTS.projectEndpoint, apiKey);
  if (!json.data?.id) {
    throw new Error('Hamsa project lookup did not return data.id.');
  }
  return json.data.id;
};

const resolveHamsaVoice = async ({apiKey, speaker, dialect}) => {
  if (process.env.HAMSA_TTS_SPEAKER_ID) {
    return {
      id: process.env.HAMSA_TTS_SPEAKER_ID,
      name: speaker,
      dialect: {languageCode: dialect},
      source: 'env'
    };
  }

  const projectId = process.env.HAMSA_PROJECT_ID || await resolveHamsaProjectId(apiKey);
  const url = new URL(process.env.HAMSA_TTS_VOICES_ENDPOINT || DEFAULTS.voicesEndpoint);
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

  if (!voice) {
    throw new Error(`Could not find Hamsa voice "${speaker}" for dialect "${dialect}".`);
  }

  return {
    ...voice,
    projectId,
    source: 'catalog'
  };
};

const getRealtimeTtsSpeaker = (voice, fallbackSpeaker) => {
  // Prefer the resolved voice ID (catalog or env). The catalog lookup already
  // filtered by dialect, so the ID pins the exact voice the Hamsa website uses.
  // Passing the bare name lets the realtime endpoint re-resolve "Marwan"
  // ambiguously (wrong accent). Fall back to the name only when no ID exists.
  if (voice.id) {
    return voice.id;
  }

  return normalizeSpacing(voice.name || fallbackSpeaker);
};

const shouldTryNextVoice = (error) => {
  if (error instanceof HamsaApiError) {
    return ![401, 402, 403, 429].includes(error.status);
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Could not find Hamsa voice');
};

const cwd = process.cwd();
const loadedEnvFiles = loadEnvFiles(cwd);
const args = parseCliArgs(process.argv.slice(2));
const briefingFolder = args.folder
  ? path.resolve(cwd, args.folder)
  : args.date
    ? path.join(cwd, 'briefings', args.date)
  : findLatestBriefingFolder(cwd);
const briefingPath = path.join(briefingFolder, 'output', 'briefing.json');
const audioDir = path.join(briefingFolder, 'audio');
const manifestPath = path.join(audioDir, 'manifest.json');

if (!fs.existsSync(briefingPath)) {
  throw new Error(`Missing built briefing data: ${path.relative(cwd, briefingPath)}. Run npm run briefing:build:folder first.`);
}

const briefing = JSON.parse(fs.readFileSync(briefingPath, 'utf8'));
const briefingScenes = briefing.scenes ?? [];
const audioScenes = [
  ...briefingScenes.map((scene, index) => ({
    ...scene,
    segmentType: 'scene',
    questionHandoff: Boolean(briefing.outro && index === briefingScenes.length - 1)
  })),
  briefing.outro
    ? {
        id: 'outro',
        shortLabel: briefing.outro.title,
        title: briefing.outro.title,
        body: briefing.outro.body,
        durationSeconds: briefing.outro.durationSeconds,
        visual: null,
        outlet: null,
        audioKey: 'open-question',
        segmentType: 'outro'
      }
    : null
].filter(Boolean).slice(0, args.limit ?? undefined);
const voiceSelectionSeed = path.basename(briefingFolder);
const configuredSpeakerPool = process.env.HAMSA_TTS_SPEAKER
  ? [process.env.HAMSA_TTS_SPEAKER]
  : parseList(process.env.HAMSA_TTS_SPEAKERS);
const hamsaSpeakerCandidates = process.env.HAMSA_TTS_SPEAKER
  ? configuredSpeakerPool
  : seededShuffle(configuredSpeakerPool.length ? configuredSpeakerPool : DEFAULTS.speakerPool, voiceSelectionSeed);
const hamsaSpeaker = hamsaSpeakerCandidates[0] || DEFAULTS.speakerPool[0];
const hamsaDialect = process.env.HAMSA_TTS_DIALECT || DEFAULTS.dialect;
const resolvedVoiceBySpeaker = new Map();
const failedSpeakers = new Set();
const voiceFallbackAttempts = [];
let selectedResolvedVoice = null;
let selectedTtsSpeaker = null;

const getResolvedVoice = async (speaker) => {
  if (resolvedVoiceBySpeaker.has(speaker)) {
    return resolvedVoiceBySpeaker.get(speaker);
  }

  if (args.dryRun) {
    const dryRunVoice = {
      id: null,
      name: speaker,
      dialect: {languageCode: hamsaDialect},
      source: 'dry-run'
    };
    resolvedVoiceBySpeaker.set(speaker, dryRunVoice);
    return dryRunVoice;
  }

  if (!process.env.HAMSA_API_KEY) {
    const envHint = loadedEnvFiles.length
      ? `Loaded ${loadedEnvFiles.join(', ')}, but HAMSA_API_KEY was not set there or in the shell.`
      : 'No .env or .env.local file was found, and HAMSA_API_KEY was not set in the shell.';
    throw new Error(`${envHint} Set HAMSA_API_KEY to generate missing audio, or use --existing-only to refresh the manifest without calling Hamsa.`);
  }

  const resolvedVoice = await resolveHamsaVoice({
    apiKey: process.env.HAMSA_API_KEY,
    speaker,
    dialect: hamsaDialect
  });

  resolvedVoiceBySpeaker.set(speaker, resolvedVoice);
  return resolvedVoice;
};

const getVoiceAttemptOrder = () => [
  ...(selectedTtsSpeaker && !failedSpeakers.has(selectedTtsSpeaker) ? [selectedTtsSpeaker] : []),
  ...hamsaSpeakerCandidates.filter((speaker) => speaker !== selectedTtsSpeaker && !failedSpeakers.has(speaker))
];

const generateHamsaAudioWithFallback = async (text) => {
  const attempts = [];

  for (const candidateSpeaker of getVoiceAttemptOrder()) {
    try {
      const voice = await getResolvedVoice(candidateSpeaker);
      const ttsSpeaker = getRealtimeTtsSpeaker(voice, candidateSpeaker);
      const audio = await callHamsaRealtimeTts({
        apiKey: process.env.HAMSA_API_KEY,
        text,
        speaker: ttsSpeaker,
        dialect: hamsaDialect,
        endpoint: process.env.HAMSA_TTS_ENDPOINT || DEFAULTS.endpoint
      });

      selectedResolvedVoice = voice;
      selectedTtsSpeaker = candidateSpeaker;
      return {
        audio,
        voice,
        ttsSpeaker,
        attempts
      };
    } catch (error) {
      const attempt = {
        speaker: candidateSpeaker,
        status: error instanceof HamsaApiError ? error.status : null,
        errorCategory: classifyError(error),
        error: error instanceof Error ? error.message : String(error)
      };
      attempts.push(attempt);
      voiceFallbackAttempts.push(attempt);

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

fs.mkdirSync(audioDir, {recursive: true});

// Optional per-scene narration text overrides, keyed by scene id ("scene-2",
// "scene-11", "outro"). Survives briefing rebuilds; edited from the dashboard.
const textOverridesPath = path.join(audioDir, 'text-overrides.json');
let textOverrides = {};
if (fs.existsSync(textOverridesPath)) {
  try {
    textOverrides = normalizeOverrideStore(JSON.parse(fs.readFileSync(textOverridesPath, 'utf8')));
  } catch (error) {
    throw new Error(`Could not parse ${path.relative(cwd, textOverridesPath)}: ${error.message}`);
  }
}

// The manifest is rebuilt from scratch on every run, so a scene's "source"
// (how its WAV was produced: "ai" Hamsa vs "recorded") would be lost whenever
// any *other* scene is regenerated. Read the prior manifest and carry each
// scene's source forward for WAVs we reuse; freshly generated WAVs are "ai".
let priorSourceByScene = {};
let priorEntryByScene = {};
if (fs.existsSync(manifestPath)) {
  try {
    const priorManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const entry of priorManifest.entries ?? []) {
      if (!entry?.sceneId) continue;
      priorEntryByScene[entry.sceneId] = entry;
      if (entry.source) priorSourceByScene[entry.sceneId] = entry.source;
    }
  } catch {
    priorSourceByScene = {};
    priorEntryByScene = {};
  }
}

const entries = [];

for (const scene of audioScenes) {
  const defaultText = materializeSceneAudioText(scene, selectSceneText(scene, args.textSource));
  const overrideText = resolveOverrideText({
    overrides: textOverrides,
    sceneId: scene.id,
    defaultText
  });
  const text = materializeSceneAudioText(scene, overrideText || defaultText);
  const effectiveTextSource = overrideText ? 'override' : args.textSource;
  const rawCaptionText = getScene2CaptionText(scene, text);
  const captionText = stripTtsCueTextForCaptions(rawCaptionText);
  const audioKey = scene.outlet?.key || scene.audioKey || scene.id;
  const carriedSource = priorSourceByScene[scene.id] || 'ai';
  const priorEntry = priorEntryByScene[scene.id] ?? {};
  const carriedSpeakerCandidate = priorEntry.speakerCandidate ?? priorEntry.speaker ?? null;
  const carriedTtsSpeaker = priorEntry.ttsSpeaker ?? priorEntry.speaker ?? null;
  const carriedVoiceName = priorEntry.voiceName ?? priorEntry.resolvedSpeakerName ?? null;
  if (!text) {
    entries.push({
      id: scene.id,
      sceneId: scene.id,
      sceneTitle: scene.title,
      segmentType: scene.segmentType,
      outletKey: scene.outlet?.key ?? null,
      outletName: scene.outlet?.name ?? null,
      outletLogoFile: scene.outlet?.logoFile ?? null,
      outletLogoPath: scene.outlet?.logoPath ?? null,
      outlet: scene.outlet,
      textSource: effectiveTextSource,
      source: carriedSource,
      speakerCandidate: carriedSpeakerCandidate,
      ttsSpeaker: carriedTtsSpeaker,
      voiceName: carriedVoiceName,
      text: '',
      captionText: '',
      captionStartOffsetSeconds: 0,
      chars: 0,
      requestedSceneDurationSeconds: scene.durationSeconds ?? null,
      audioDurationSeconds: null,
      audioPath: null,
      status: 'missing',
      error: `Scene has no text for source "${args.textSource}".`
    });
    continue;
  }

  const fileName = `${scene.id}-${audioKey}.${DEFAULTS.outputFormat}`;
  const outputPath = path.join(audioDir, fileName);
  const relativeOutputPath = path.relative(cwd, outputPath).replace(/\\/g, '/');

  const baseEntry = {
    id: `${scene.id}-${audioKey}`,
    sceneId: scene.id,
    sceneTitle: scene.title,
    segmentType: scene.segmentType,
    outletKey: scene.outlet?.key ?? null,
    outletName: scene.outlet?.name ?? scene.shortLabel ?? scene.title ?? null,
    outletLogoFile: scene.outlet?.logoFile ?? null,
    outletLogoPath: scene.outlet?.logoPath ?? null,
    outlet: scene.outlet ?? null,
    textSource: effectiveTextSource,
    source: carriedSource,
    speakerCandidate: carriedSpeakerCandidate,
    ttsSpeaker: carriedTtsSpeaker,
    voiceName: carriedVoiceName,
    text,
    captionText,
    captionStartOffsetSeconds: 0,
    chars: text.length,
    requestedSceneDurationSeconds: scene.durationSeconds ?? null,
    audioDurationSeconds: null,
    audioPath: relativeOutputPath
  };

  if (args.dryRun) {
    entries.push({...baseEntry, status: 'dry-run'});
    continue;
  }

  if (!args.force && fs.existsSync(outputPath)) {
    const priorEntry = priorEntryByScene[scene.id];
    const priorText = normalizeSpacing(priorEntry?.text);
    const priorAudioPath = normalizeSpacing(priorEntry?.audioPath);
    const existingAudioMatchesText = priorText === text && priorAudioPath === relativeOutputPath;

    if (!existingAudioMatchesText) {
      const staleReason = priorEntry
        ? 'Existing WAV was created for different narration text; regenerate audio before muxing.'
        : 'Existing WAV has no prior manifest text; regenerate audio before muxing.';

      if (args.existingOnly) {
        entries.push({
          ...baseEntry,
          audioPath: null,
          staleAudioPath: relativeOutputPath,
          priorText: priorText || null,
          status: 'stale',
          error: staleReason
        });
        continue;
      }

      console.log(`Regenerating stale audio: ${relativeOutputPath}`);
    } else {
      const existingBuffer = fs.readFileSync(outputPath);
      if (patchWavHeaderSizes(existingBuffer)) {
        fs.writeFileSync(outputPath, existingBuffer);
        console.log(`Repaired WAV header sizes: ${relativeOutputPath}`);
      }
      const audioDurationSeconds = getWavDurationSeconds(existingBuffer);
      entries.push({
        ...baseEntry,
        captionStartOffsetSeconds: getCaptionStartOffsetSeconds({
          scene,
          audioText: text,
          captionText: rawCaptionText,
          audioDurationSeconds
        }),
        audioDurationSeconds,
        status: 'reused'
      });
      continue;
    }
  }

  if (args.existingOnly) {
    entries.push({
      ...baseEntry,
      status: 'missing'
    });
    continue;
  }

  try {
    const result = await generateHamsaAudioWithFallback(text);

    patchWavHeaderSizes(result.audio);
    fs.writeFileSync(outputPath, result.audio);
    entries.push({
      ...baseEntry,
      // Freshly generated by Hamsa — always "ai", overriding any carried-forward
      // value (e.g. re-generating a previously recorded scene flips it back to ai).
      source: 'ai',
      speaker: result.ttsSpeaker,
      speakerCandidate: selectedTtsSpeaker ?? result.ttsSpeaker,
      ttsSpeaker: result.ttsSpeaker,
      voiceName: result.voice.name ?? result.ttsSpeaker,
      resolvedSpeakerId: result.voice.id ?? null,
      resolvedSpeakerName: result.voice.name ?? null,
      resolvedSpeakerSource: result.voice.source ?? null,
      voiceFallbackAttempts: result.attempts,
      audioDurationSeconds: getWavDurationSeconds(result.audio),
      captionStartOffsetSeconds: getCaptionStartOffsetSeconds({
        scene,
        audioText: text,
        captionText: rawCaptionText,
        audioDurationSeconds: getWavDurationSeconds(result.audio)
      }),
      status: 'generated'
    });
  } catch (error) {
    entries.push({
      ...baseEntry,
      status: 'failed',
      errorCategory: classifyError(error),
      errorStatus: error instanceof HamsaApiError ? error.status : null,
      voiceFallbackAttempts: error.voiceAttempts ?? [],
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

const manifest = {
  meta: {
    generatedAt: new Date().toISOString(),
    sourceBriefingPath: path.relative(cwd, briefingPath).replace(/\\/g, '/'),
    briefingFolder: path.relative(cwd, briefingFolder).replace(/\\/g, '/'),
    provider: 'hamsa',
    endpoint: process.env.HAMSA_TTS_ENDPOINT || DEFAULTS.endpoint,
    speaker: selectedTtsSpeaker ?? hamsaSpeaker,
    speakerCandidate: selectedTtsSpeaker ?? hamsaSpeaker,
    ttsSpeaker: selectedTtsSpeaker ?? hamsaSpeaker,
    voiceName: selectedResolvedVoice?.name ?? selectedTtsSpeaker ?? hamsaSpeaker,
    speakerCandidates: hamsaSpeakerCandidates,
    speakerSelectionSeed: voiceSelectionSeed,
    voiceFallbackAttempts,
    resolvedSpeakerId: selectedResolvedVoice?.id ?? null,
    resolvedSpeakerName: selectedResolvedVoice?.name ?? null,
    resolvedSpeakerSource: selectedResolvedVoice?.source ?? null,
    dialect: hamsaDialect,
    outputFormat: DEFAULTS.outputFormat,
    textSource: args.textSource,
    dryRun: args.dryRun,
    firstOnly: args.first,
    limit: args.limit,
    existingOnly: args.existingOnly,
    envFilesLoaded: loadedEnvFiles,
    hasHamsaApiKey: Boolean(process.env.HAMSA_API_KEY),
    totalAudioEntries: entries.length,
    totalOutlets: entries.filter((entry) => entry.outletKey).length
  },
  audioByOutlet: Object.fromEntries(
    entries.filter((entry) => entry.outletKey).map((entry) => [
      entry.outletKey,
      {
        outletKey: entry.outletKey,
        outletName: entry.outletName,
        sceneId: entry.sceneId,
        audioPath: entry.audioPath,
        durationSeconds: entry.audioDurationSeconds,
        captionText: entry.captionText,
        captionStartOffsetSeconds: entry.captionStartOffsetSeconds,
        status: entry.status
      }
    ])
  ),
  audioByScene: Object.fromEntries(
    entries.map((entry) => [
      entry.sceneId,
      {
        sceneId: entry.sceneId,
        outletKey: entry.outletKey,
        outletName: entry.outletName,
        audioPath: entry.audioPath,
        durationSeconds: entry.audioDurationSeconds,
        captionText: entry.captionText,
        captionStartOffsetSeconds: entry.captionStartOffsetSeconds,
        status: entry.status
      }
    ])
  ),
  entries
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const generatedCount = entries.filter((entry) => entry.status === 'generated').length;
const reusedCount = entries.filter((entry) => entry.status === 'reused').length;
const missingCount = entries.filter((entry) => entry.status === 'missing').length;
const failedCount = entries.filter((entry) => entry.status === 'failed').length;
const staleCount = entries.filter((entry) => entry.status === 'stale').length;
const actionLabel = args.dryRun ? 'Prepared' : 'Processed';
console.log(`${actionLabel} ${entries.length} briefing audio entries (${generatedCount} generated, ${reusedCount} reused, ${staleCount} stale, ${missingCount} missing, ${failedCount} failed).`);
console.log(`Manifest: ${path.relative(cwd, manifestPath)}`);
if (entries.some((entry) => entry.status === 'missing' || entry.status === 'failed' || entry.status === 'stale')) {
  console.log('Audio issues:');
  for (const entry of entries.filter((item) => item.status === 'missing' || item.status === 'failed' || item.status === 'stale')) {
    const label = [entry.sceneId, entry.outletName || entry.outletKey].filter(Boolean).join(' / ');
    console.log(`- ${label}: ${entry.status}${entry.error ? ` (${entry.error})` : ''}`);
  }
}
