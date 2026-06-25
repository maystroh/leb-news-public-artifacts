// Per-duel narration TTS for the Quote Duel video path.
//
// Mirrors the briefing audio contract (reuse-by-default / --force / --existing-only)
// but for duels: reads output/quote-duel.json, synthesizes scene.audioText
// (falling back to legacy scene.narration, then scene.summary), and writes WAVs
// into briefings/<date>/audio/duel-XX.wav
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
const textOverridesPath = path.join(audioDir, 'quote-duel-text-overrides.json');
const audioScriptPath = path.join(outputFolder, 'quote-duel-audio-script.json');
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
const formatDuelAudioText = (scene) => {
  const event = normalizeSpacing(scene.eventLabel || scene.contrastLabel);
  const leftOutlet = normalizeSpacing(scene.left?.outlet);
  const leftSays = normalizeSpacing(scene.left?.audioLine || scene.left?.stance || scene.left?.quote);
  const rightOutlet = normalizeSpacing(scene.right?.outlet);
  const rightSays = normalizeSpacing(scene.right?.audioLine || scene.right?.stance || scene.right?.quote);
  const lines = [];
  if (event) lines.push(`الحدث هو "${event}"`);
  if (leftOutlet && leftSays) lines.push(`"${leftOutlet}" قالت عنو "${leftSays}"`);
  if (rightOutlet && rightSays) lines.push(`"${rightOutlet}" قالت عنو "${rightSays}"`);
  return normalizeSpacing(lines.join(' '));
};
const defaultDuelText = (scene) => normalizeSpacing(scene.audioText || scene.narration || formatDuelAudioText(scene) || scene.summary);
const duelTextSource = (scene, overrideText) => {
  if (overrideText) return 'override';
  if (scene.audioText) return 'audioText';
  if (scene.narration) return 'narration';
  if (formatDuelAudioText(scene)) return 'generated-format';
  if (scene.summary) return 'summary';
  return null;
};

let textOverrides = {};
if (fs.existsSync(textOverridesPath)) {
  try {
    textOverrides = readJson(textOverridesPath);
  } catch (error) {
    throw new Error(`Could not parse ${path.relative(cwd, textOverridesPath)}: ${error.message}`);
  }
}

// Carry forward each duel's source from a prior manifest (mirrors the briefing
// manifest carry-forward); freshly generated WAVs are "ai".
let priorSourceByDuel = {};
let priorTextByDuel = {};
if (fs.existsSync(manifestPath)) {
  try {
    const prior = readJson(manifestPath);
    for (const [duelId, entry] of Object.entries(prior.audioByDuel ?? {})) {
      if (entry?.source) priorSourceByDuel[duelId] = entry.source;
      if (entry?.text) priorTextByDuel[duelId] = normalizeSpacing(entry.text);
    }
  } catch {
    priorSourceByDuel = {};
    priorTextByDuel = {};
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
  const overrideText = normalizeSpacing(textOverrides[duelId]);
  const text = overrideText || defaultDuelText(scene);
  const textSource = duelTextSource(scene, overrideText);
  const exists = fs.existsSync(outputPath);
  const priorText = priorTextByDuel[duelId] || '';
  const stale = exists && priorText && text && priorText !== text;

  let action;
  let skipReason = null;
  if (!text) {
    action = 'skip';
    skipReason = 'no-text';
  } else if (existingOnly) {
    action = exists ? 'reuse' : 'skip';
    if (!exists) skipReason = 'no-wav-existing-only';
  } else if (exists && !force && !stale) {
    action = 'reuse';
  } else {
    action = 'generate';
  }

  return {ordinal, duelId, fileName, outputPath, src: `../audio/${fileName}`, text, textSource, action, skipReason, stale};
});

// Hooks are STATIC and shared across all dates — generated once by
// scripts/generate-duel-hooks.mjs into <repo>/audio/hooks/, NOT here. This
// script only synthesizes the per-duel narration.

if (dryRun) {
  console.log(JSON.stringify({
    folder: path.relative(cwd, briefingFolder),
    mode: existingOnly ? 'existing-only' : force ? 'force' : 'reuse',
    speakerCandidates,
    dialect,
    textOverridesPath: path.relative(cwd, textOverridesPath).replace(/\\/g, '/'),
    duels: plan.map(({ordinal, duelId, fileName, textSource, action, skipReason, stale}) =>
      ({ordinal, duelId, fileName, textSource, action, skipReason, stale}))
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
      text: item.text,
      chars: item.text.length,
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
    text: item.text,
    chars: item.text.length,
    source,
    skipped: false
  };
}

writeJson(manifestPath, {
  generatedAt: new Date().toISOString(),
  sourceDataPath: path.relative(cwd, quoteDuelPath).replace(/\\/g, '/'),
  textOverridesPath: path.relative(cwd, textOverridesPath).replace(/\\/g, '/'),
  bufferSeconds: BUFFER_SECONDS,
  audioByDuel
});

writeJson(audioScriptPath, {
  meta: {
    generatedAt: new Date().toISOString(),
    sourceDataPath: path.relative(cwd, quoteDuelPath).replace(/\\/g, '/'),
    textOverridesPath: path.relative(cwd, textOverridesPath).replace(/\\/g, '/'),
    manifestPath: path.relative(cwd, manifestPath).replace(/\\/g, '/'),
    note: 'Edit audio/quote-duel-text-overrides.json with keys like "duel-1" to override one clash narration, then rerun step 19.'
  },
  duels: plan.map((item) => {
    const manifestEntry = audioByDuel[item.duelId] ?? {};
    return {
      ordinal: item.ordinal,
      duelId: item.duelId,
      eventLabel: scenes[item.ordinal - 1]?.eventLabel ?? '',
      contrastLabel: scenes[item.ordinal - 1]?.contrastLabel ?? '',
      leftOutlet: scenes[item.ordinal - 1]?.left?.outlet ?? '',
      leftQuote: scenes[item.ordinal - 1]?.left?.quote ?? '',
      rightOutlet: scenes[item.ordinal - 1]?.right?.outlet ?? '',
      rightQuote: scenes[item.ordinal - 1]?.right?.quote ?? '',
      textSource: item.textSource,
      text: item.text,
      chars: item.text.length,
      file: item.fileName,
      wavExists: fs.existsSync(item.outputPath),
      staleBeforeRun: item.stale,
      action: item.action,
      skipped: manifestEntry.skipped ?? item.action === 'skip',
      skipReason: manifestEntry.skipReason ?? item.skipReason,
      durationSeconds: manifestEntry.durationSeconds ?? null,
      bufferedSeconds: manifestEntry.bufferedSeconds ?? null
    };
  })
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
console.log(`Wrote duel audio script → ${path.relative(cwd, audioScriptPath)}`);
console.log(`Updated timingConfig.quoteDuel.scenes in ${path.relative(cwd, timingConfigPath)}`);
