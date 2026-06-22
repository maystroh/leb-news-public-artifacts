// Per-duel narration TTS for the Quote Duel video path.
//
// Mirrors the briefing audio contract (reuse-by-default / --force / --existing-only)
// but for duels: reads output/quote-duel.json, synthesizes scene.narration (falling
// back to scene.summary), and writes WAVs into briefings/<date>/audio/duel-XX.wav
// (folder-local audio/, NOT output/audio — matches the briefing + survives the
// server rsync). Durations are written into timingConfig.quoteDuel.scenes so they
// survive `briefing:build:folder` rebuilds (output/quote-duel.json is regenerated
// wholesale by the builder, so writing them there would be clobbered). A side
// manifest (audio/quote-duel-manifest.json) carries the audio src + duration per
// duel for the render/mux/split steps to merge in.
//
// Clip identity is SOURCE-ORDINAL: duel-01 == scenes[0] regardless of skips, so a
// missing-text duel never renumbers the survivors (see lib/duel-timeline.mjs).

import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';
import {patchWavHeaderSizes} from './lib/wav-header.mjs';
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

if (!args.folder && !args.date) {
  console.error('Missing folder. Usage: npm run briefing:duel:audio -- --folder briefings/YYYY-MM-DD');
  process.exit(1);
}

const force = Boolean(args.force);
const existingOnly = Boolean(args['existing-only']);
const dryRun = Boolean(args['dry-run']);

let briefingFolder;
try {
  briefingFolder = resolveBriefingFolder(cwd, args.folder ?? `briefings/${args.date}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const outputFolder = path.join(briefingFolder, 'output');
const quoteDuelPath = path.join(outputFolder, 'quote-duel.json');
const audioDir = path.join(briefingFolder, 'audio');
const manifestPath = path.join(audioDir, 'quote-duel-manifest.json');
const timingConfigPath = path.join(outputFolder, 'timing-config.json');

if (!fs.existsSync(quoteDuelPath)) {
  console.error(`Missing built quote-duel data: ${path.relative(cwd, quoteDuelPath)}`);
  console.error('Run `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD` first.');
  process.exit(1);
}

const quoteDuel = readJson(quoteDuelPath);
const scenes = Array.isArray(quoteDuel.scenes) ? quoteDuel.scenes : [];
if (!scenes.length) {
  console.error(`No duels found in ${path.relative(cwd, quoteDuelPath)}`);
  process.exit(1);
}

const padTwo = (n) => String(n).padStart(2, '0');
const duelText = (scene) => normalizeSpacing(scene.narration || scene.summary);

// Carry forward each duel's source from a prior manifest (mirrors the briefing
// manifest carry-forward); freshly generated WAVs are "ai".
let priorSourceByDuel = {};
if (fs.existsSync(manifestPath)) {
  try {
    const prior = readJson(manifestPath);
    for (const [duelId, entry] of Object.entries(prior.audioByDuel ?? {})) {
      if (entry?.source) priorSourceByDuel[duelId] = entry.source;
    }
  } catch {
    priorSourceByDuel = {};
  }
}

// Voice pool selection (same seeded-shuffle as the briefing).
const voiceSelectionSeed = path.basename(briefingFolder);
const configuredPool = process.env.HAMSA_TTS_SPEAKER
  ? [process.env.HAMSA_TTS_SPEAKER]
  : parseList(process.env.HAMSA_TTS_SPEAKERS);
const speakerCandidates = process.env.HAMSA_TTS_SPEAKER
  ? configuredPool
  : seededShuffle(configuredPool.length ? configuredPool : DEFAULTS.speakerPool, voiceSelectionSeed);
const dialect = process.env.HAMSA_TTS_DIALECT || DEFAULTS.dialect;

// Plan: decide per-duel action without side effects (drives --dry-run + tests).
const plan = scenes.map((scene, index) => {
  const ordinal = index + 1;
  const duelId = scene.id ?? `duel-${ordinal}`;
  const fileName = `duel-${padTwo(ordinal)}.wav`;
  const outputPath = path.join(audioDir, fileName);
  const text = duelText(scene);
  const textSource = scene.narration ? 'narration' : scene.summary ? 'summary' : null;
  const exists = fs.existsSync(outputPath);

  let action;
  let skipReason = null;
  if (!text) {
    action = 'skip';
    skipReason = 'no-text';
  } else if (existingOnly) {
    action = exists ? 'reuse' : 'skip';
    if (!exists) skipReason = 'no-wav-existing-only';
  } else if (exists && !force) {
    action = 'reuse';
  } else {
    action = 'generate';
  }

  return {ordinal, duelId, fileName, outputPath, src: `../audio/${fileName}`, text, textSource, action, skipReason};
});

if (dryRun) {
  console.log(JSON.stringify({
    folder: path.relative(cwd, briefingFolder),
    mode: existingOnly ? 'existing-only' : force ? 'force' : 'reuse',
    speakerCandidates,
    dialect,
    duels: plan.map(({ordinal, duelId, fileName, textSource, action, skipReason}) =>
      ({ordinal, duelId, fileName, textSource, action, skipReason}))
  }, null, 2));
  process.exit(0);
}

fs.mkdirSync(audioDir, {recursive: true});

const needsGeneration = plan.some((p) => p.action === 'generate');
let runner = null;
if (needsGeneration) {
  if (!process.env.HAMSA_API_KEY) {
    const hint = loadedEnvFiles.length
      ? `Loaded ${loadedEnvFiles.join(', ')}, but HAMSA_API_KEY was not set there or in the shell.`
      : 'No .env or .env.local file was found, and HAMSA_API_KEY was not set in the shell.';
    console.error(`${hint} Set HAMSA_API_KEY to generate missing duel audio, or use --existing-only to refresh the manifest without calling Hamsa.`);
    process.exit(1);
  }
  runner = createHamsaVoiceRunner({
    apiKey: process.env.HAMSA_API_KEY,
    dialect,
    speakerCandidates,
    endpoint: process.env.HAMSA_TTS_ENDPOINT || DEFAULTS.endpoint
  });
}

const audioByDuel = {};
const warnings = [];

const measure = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  return getWavDurationSeconds(buffer);
};

for (const item of plan) {
  if (item.action === 'skip') {
    warnings.push(`Skipping ${item.duelId}: ${item.skipReason}.`);
    audioByDuel[item.duelId] = {
      file: item.fileName,
      src: item.src,
      durationSeconds: null,
      textSource: item.textSource,
      source: priorSourceByDuel[item.duelId] || 'ai',
      skipped: true,
      skipReason: item.skipReason
    };
    continue;
  }

  let durationSeconds = null;
  let source = priorSourceByDuel[item.duelId] || 'ai';

  if (item.action === 'reuse') {
    durationSeconds = measure(item.outputPath);
    console.log(`Reusing ${item.fileName} (${durationSeconds ?? '?'}s)`);
  } else {
    const result = await runner.generate(item.text);
    patchWavHeaderSizes(result.audio);
    fs.writeFileSync(item.outputPath, result.audio);
    durationSeconds = getWavDurationSeconds(result.audio);
    source = 'ai';
    console.log(`Generated ${item.fileName} via ${result.ttsSpeaker} (${durationSeconds ?? '?'}s)`);
  }

  audioByDuel[item.duelId] = {
    file: item.fileName,
    src: item.src,
    durationSeconds,
    bufferedSeconds: durationSeconds != null ? Number((durationSeconds + BUFFER_SECONDS).toFixed(3)) : null,
    textSource: item.textSource,
    source,
    skipped: false
  };
}

writeJson(manifestPath, {
  generatedAt: new Date().toISOString(),
  sourceDataPath: path.relative(cwd, quoteDuelPath).replace(/\\/g, '/'),
  bufferSeconds: BUFFER_SECONDS,
  audioByDuel
});

// Persist audio-driven durations into timingConfig.quoteDuel.scenes so the
// builder re-applies them on the next build:folder (A2 — no clobber).
let timingConfig = fs.existsSync(timingConfigPath) ? readJson(timingConfigPath) : {};
timingConfig.quoteDuel ??= {};
timingConfig.quoteDuel.scenes ??= {};
for (const [duelId, entry] of Object.entries(audioByDuel)) {
  if (entry.bufferedSeconds != null) {
    timingConfig.quoteDuel.scenes[duelId] = entry.bufferedSeconds;
  }
}
writeJson(timingConfigPath, timingConfig);

for (const warning of warnings) console.warn(`Warning: ${warning}`);
const made = Object.values(audioByDuel).filter((e) => !e.skipped).length;
console.log(`Wrote duel audio manifest (${made}/${plan.length} duels) → ${path.relative(cwd, manifestPath)}`);
console.log(`Updated timingConfig.quoteDuel.scenes in ${path.relative(cwd, timingConfigPath)}`);
