// Synthesizes the STATIC, shared Quote Duel attention-hook WAVs ONCE into
// <repo>/audio/hooks/<id>.wav plus the shared outro line
// <repo>/audio/hooks/outro.wav (+ manifest.json). These lines are the same
// across every date and every duel, so they are generated globally here rather
// than per date. The per-date render/mux/split read these shared WAVs.
//
// To add or change a hook: edit DEFAULT_DUEL_HOOKS in scripts/lib/duel-hooks.mjs,
// then run this (npm run briefing:duel:hooks). Existing WAVs are reused unless
// --force; --existing-only refreshes the manifest from WAVs on disk (no Hamsa);
// --dry-run prints the plan.

import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, writeJson} from './lib/briefing-helpers.mjs';
import {patchWavHeaderSizes} from './lib/wav-header.mjs';
import {
  DEFAULT_DUEL_HOOKS,
  DEFAULT_DUEL_OUTRO_AUDIO,
  sharedHooksDir,
  sharedHooksManifestPath,
  loadSharedHooksManifest
} from './lib/duel-hooks.mjs';
import {
  DEFAULTS,
  loadEnvFiles,
  normalizeSpacing,
  parseList,
  seededShuffle,
  getWavDurationSeconds,
  createHamsaVoiceRunner
} from './lib/hamsa-tts.mjs';

const BUFFER_SECONDS = 0.5;
const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const loadedEnvFiles = loadEnvFiles(cwd);

const force = Boolean(args.force);
const existingOnly = Boolean(args['existing-only']);
const dryRun = Boolean(args['dry-run']);

const hooksDir = sharedHooksDir(cwd);
const manifestPath = sharedHooksManifestPath(cwd);

const hooks = DEFAULT_DUEL_HOOKS.map((h) => ({id: h.id, text: normalizeSpacing(h.text)})).filter((h) => h.text);
if (!hooks.length) {
  console.error('No hooks defined in DEFAULT_DUEL_HOOKS.');
  process.exit(1);
}
const outro = {
  id: DEFAULT_DUEL_OUTRO_AUDIO.id,
  fileName: DEFAULT_DUEL_OUTRO_AUDIO.file,
  text: normalizeSpacing(DEFAULT_DUEL_OUTRO_AUDIO.text)
};

const makePlanItem = ({id, text, fileName = `${id}.wav`, type = 'hook'}) => {
  const outputPath = path.join(hooksDir, fileName);
  const exists = fs.existsSync(outputPath);
  const priorEntry = type === 'outro' ? loadSharedHooksManifest(cwd)?.outro : loadSharedHooksManifest(cwd)?.hooks?.[id];
  const stale = exists && normalizeSpacing(priorEntry?.text) && normalizeSpacing(priorEntry.text) !== text;
  let action;
  let skipReason = null;
  if (existingOnly) {
    action = exists ? 'reuse' : 'skip';
    if (!exists) skipReason = 'no-wav-existing-only';
  } else if (exists && !force && !stale) {
    action = 'reuse';
  } else {
    action = 'generate';
  }
  return {type, id, text, fileName, outputPath, action, skipReason, stale};
};

const hookPlan = hooks.map((h) => makePlanItem({id: h.id, text: h.text, type: 'hook'}));
const outroPlan = outro.text ? makePlanItem({...outro, type: 'outro'}) : null;
const plan = [...hookPlan, ...(outroPlan ? [outroPlan] : [])];

if (dryRun) {
  console.log(JSON.stringify({
    hooksDir: path.relative(cwd, hooksDir),
    mode: existingOnly ? 'existing-only' : force ? 'force' : 'reuse',
    hooks: hookPlan.map(({id, fileName, action, skipReason, stale}) => ({id, fileName, action, skipReason, stale})),
    outro: outroPlan ? {
      fileName: outroPlan.fileName,
      text: outroPlan.text,
      action: outroPlan.action,
      skipReason: outroPlan.skipReason,
      stale: outroPlan.stale
    } : null
  }, null, 2));
  process.exit(0);
}

fs.mkdirSync(hooksDir, {recursive: true});

const needsGeneration = plan.some((p) => p.action === 'generate');
let runner = null;
if (needsGeneration) {
  if (!process.env.HAMSA_API_KEY) {
    const hint = loadedEnvFiles.length
      ? `Loaded ${loadedEnvFiles.join(', ')}, but HAMSA_API_KEY was not set there or in the shell.`
      : 'No .env or .env.local file was found, and HAMSA_API_KEY was not set in the shell.';
    console.error(`${hint} Set HAMSA_API_KEY to generate hook audio, or use --existing-only.`);
    process.exit(1);
  }
  // Stable voice for hooks/outro (not date-seeded — these are global assets).
  const priorManifest = loadSharedHooksManifest(cwd);
  const priorSpeaker = priorManifest?.speaker;
  const priorSpeakerName = normalizeSpacing(priorSpeaker?.speakerCandidate || priorSpeaker?.voiceName || priorSpeaker?.ttsSpeaker);
  const configuredPool = process.env.HAMSA_TTS_SPEAKER
    ? [process.env.HAMSA_TTS_SPEAKER]
    : parseList(process.env.HAMSA_TTS_SPEAKERS);
  const speakerCandidates = priorSpeakerName
    ? [priorSpeakerName]
    : process.env.HAMSA_TTS_SPEAKER
    ? configuredPool
    : seededShuffle(configuredPool.length ? configuredPool : DEFAULTS.speakerPool, 'duel-hooks');
  runner = createHamsaVoiceRunner({
    apiKey: process.env.HAMSA_API_KEY,
    dialect: process.env.HAMSA_TTS_DIALECT || DEFAULTS.dialect,
    speakerCandidates,
    endpoint: process.env.HAMSA_TTS_ENDPOINT || DEFAULTS.endpoint
  });
}

// Carry forward source/text from a prior manifest where we reuse a WAV.
const priorManifest = loadSharedHooksManifest(cwd) ?? {};
const prior = priorManifest.hooks ?? {};
const priorOutro = priorManifest.outro ?? {};
const measure = (filePath) => getWavDurationSeconds(fs.readFileSync(filePath));

const hookResult = {};
let outroResult = null;
const warnings = [];
for (const item of plan) {
  if (item.action === 'skip') {
    warnings.push(`Skipping ${item.id}: ${item.skipReason}.`);
    continue;
  }
  let durationSeconds = null;
  const priorEntry = item.type === 'outro' ? priorOutro : prior[item.id];
  let speakerCandidate = priorEntry?.speakerCandidate ?? priorManifest.speaker?.speakerCandidate ?? null;
  let ttsSpeaker = priorEntry?.ttsSpeaker ?? priorManifest.speaker?.ttsSpeaker ?? null;
  let voiceName = priorEntry?.voiceName ?? priorManifest.speaker?.voiceName ?? null;
  if (item.action === 'reuse') {
    durationSeconds = measure(item.outputPath);
    console.log(`Reusing ${item.fileName} (${durationSeconds ?? '?'}s)`);
  } else {
    const gen = await runner.generate(item.text);
    patchWavHeaderSizes(gen.audio);
    fs.writeFileSync(item.outputPath, gen.audio);
    durationSeconds = getWavDurationSeconds(gen.audio);
    speakerCandidate = runner.selectedSpeaker;
    ttsSpeaker = gen.ttsSpeaker;
    voiceName = gen.voice?.name ?? gen.ttsSpeaker;
    console.log(`Generated ${item.fileName} via ${gen.ttsSpeaker} (${durationSeconds ?? '?'}s)`);
  }
  const entry = {
    file: item.fileName,
    text: item.text,
    durationSeconds,
    bufferedSeconds: durationSeconds != null ? Number((durationSeconds + BUFFER_SECONDS).toFixed(3)) : null,
    source: priorEntry?.source || 'ai',
    speakerCandidate,
    ttsSpeaker,
    voiceName
  };
  if (item.type === 'outro') {
    outroResult = entry;
  } else {
    hookResult[item.id] = entry;
  }
}

const manifestSpeaker = [outroResult, ...Object.values(hookResult)].find((entry) => entry?.ttsSpeaker || entry?.speakerCandidate);
writeJson(manifestPath, {
  generatedAt: new Date().toISOString(),
  bufferSeconds: BUFFER_SECONDS,
  speaker: manifestSpeaker ? {
    speakerCandidate: manifestSpeaker.speakerCandidate ?? null,
    ttsSpeaker: manifestSpeaker.ttsSpeaker ?? null,
    voiceName: manifestSpeaker.voiceName ?? null
  } : null,
  hooks: hookResult,
  outro: outroResult
});

for (const w of warnings) console.warn(`Warning: ${w}`);
console.log(`Wrote shared duel hooks manifest (${Object.keys(hookResult).length} hooks + ${outroResult ? 'outro' : 'no outro'}) → ${path.relative(cwd, manifestPath)}`);
