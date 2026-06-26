import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {buildMuxFilterComplex} from './lib/audio-mux.mjs';
import {computeDuelTimeline, mergeDuelAudioManifest, DEFAULT_FPS} from './lib/duel-timeline.mjs';
import {normalizeHookId, resolveSharedHook, resolveSharedOutro} from './lib/duel-hooks.mjs';

// Attaches per-duel narration WAVs and the shared ending audio tail to the muted
// QuoteDuel render at their frame-accurate cumulative offsets, then muxes onto
// the video by stream-copy (finishes in seconds). Offsets come from
// lib/duel-timeline.mjs — the SAME source the comp uses — so audio lands exactly
// where each duel starts and the ending audio follows the enforced post-duel
// hold.

const FPS = DEFAULT_FPS;
const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  console.error('Missing folder. Usage: npm run briefing:duel:mux:audio -- --folder briefings/YYYY-MM-DD');
  process.exit(1);
}

let briefingFolder;
try {
  briefingFolder = resolveBriefingFolder(cwd, args.folder ?? `briefings/${args.date}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const outputFolder = path.join(briefingFolder, 'output');
const quoteDuelPath = path.join(outputFolder, 'quote-duel.json');
const audioManifestPath = path.join(briefingFolder, 'audio', 'quote-duel-manifest.json');
const audioDir = path.join(briefingFolder, 'audio');
const ffmpegBin = args.ffmpeg || 'ffmpeg';

if (!fs.existsSync(quoteDuelPath)) {
  console.error(`Missing built quote-duel data: ${path.relative(cwd, quoteDuelPath)}`);
  process.exit(1);
}

const hookId = normalizeHookId(args.hook);
const hookSuffix = hookId ? `-${hookId}` : '';
const selectedDuelId = args.duel ? String(args.duel).trim() : '';
const inputPath = args.input
  ? path.resolve(cwd, args.input)
  : path.join(outputFolder, `radar-beirut-quote-duel${hookSuffix}.mp4`);

if (!fs.existsSync(inputPath)) {
  console.error(`Missing input video: ${path.relative(cwd, inputPath)}`);
  console.error('Render it first: `npm run briefing:duel:render -- --folder briefings/YYYY-MM-DD --muted`.');
  process.exit(1);
}

const outputPath = args.output
  ? path.resolve(cwd, args.output)
  : path.join(path.dirname(inputPath), `${path.basename(inputPath, path.extname(inputPath))}-final.mp4`);

if (path.resolve(outputPath) === path.resolve(inputPath)) {
  console.error('Output path must differ from input path.');
  process.exit(1);
}

const duel = readJson(quoteDuelPath);
const manifest = fs.existsSync(audioManifestPath) ? readJson(audioManifestPath) : null;
const audioByDuel = manifest?.audioByDuel ?? {};
const activeHook = resolveSharedHook(cwd, hookId);
const activeOutro = resolveSharedOutro(cwd);
const baseMerged = mergeDuelAudioManifest(duel, manifest);
const sourceScenes = baseMerged.scenes ?? [];
const selectedSource = selectedDuelId
  ? sourceScenes
      .map((scene, index) => ({...scene, sourceIndex: index + 1, id: scene.id ?? `duel-${index + 1}`}))
      .find((scene) => scene.id === selectedDuelId)
  : null;
if (selectedDuelId && !selectedSource) {
  console.error(`Unknown duel id: ${selectedDuelId}`);
  process.exit(1);
}
const merged = {
  ...baseMerged,
  hook: activeHook ?? undefined,
  outro: {
    ...(baseMerged.outro ?? {}),
    text: activeOutro?.text ?? baseMerged.outro?.text,
    durationSeconds: activeOutro?.durationSeconds ?? baseMerged.outro?.durationSeconds
  },
  scenes: selectedDuelId
    ? [selectedSource]
    : sourceScenes.map((scene, index) => ({...scene, sourceIndex: index + 1, id: scene.id ?? `duel-${index + 1}`}))
};

const timeline = computeDuelTimeline(merged, FPS, {requireAudio: true});
const frameToMs = (frame) => Math.round((frame / FPS) * 1000);

const audioEntries = [];

// Selected hook (the shared, static spoken line from audio/hooks/) plays at the
// master start, offset 0.
if (timeline.coldOpenFrames > 0 && activeHook?.wavPath) {
  if (fs.existsSync(activeHook.wavPath)) {
    audioEntries.push({label: `hook(${activeHook.id})`, filePath: activeHook.wavPath, delayMs: 0});
  } else {
    console.warn(`Warning: missing shared hook WAV: ${path.relative(cwd, activeHook.wavPath)} — run npm run briefing:duel:hooks.`);
  }
}

for (const d of timeline.duels) {
  if (d.skipped) continue;
  const entry = audioByDuel[d.duelId];
  if (!entry || !entry.file) {
    console.warn(`Warning: no audio file for ${d.duelId}; clip will be silent.`);
    continue;
  }
  const filePath = path.join(audioDir, entry.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: missing WAV for ${d.duelId}: ${path.relative(cwd, filePath)}`);
    continue;
  }
  audioEntries.push({label: d.duelId, filePath, delayMs: frameToMs(d.startFrame)});
}

if (timeline.outroFrames > 0 && activeOutro?.wavPath) {
  if (fs.existsSync(activeOutro.wavPath)) {
    audioEntries.push({label: 'outro', filePath: activeOutro.wavPath, delayMs: frameToMs(timeline.outroStartFrame)});
  } else {
    console.warn(`Warning: missing shared outro WAV: ${path.relative(cwd, activeOutro.wavPath)} — run npm run briefing:duel:hooks.`);
  }
} else if (timeline.outroFrames > 0) {
  console.warn('Warning: no shared outro audio found; run npm run briefing:duel:hooks.');
}

if (!audioEntries.length) {
  console.error('No duel audio files found to mux.');
  process.exit(1);
}

const totalMs = frameToMs(timeline.totalFrames);

const DEFAULT_MUSIC_PATH = path.join(cwd, 'audio', 'ambient-radar-bed.mp3');
const musicPath = args.music === true ? DEFAULT_MUSIC_PATH : args.music ? path.resolve(cwd, args.music) : null;
const musicDb = Number.isFinite(Number(args['music-db'])) ? Number(args['music-db']) : -22;
const musicDuck = `${args['music-duck'] ?? 'on'}` !== 'off' && `${args['music-duck']}` !== 'false';
if (musicPath && !fs.existsSync(musicPath)) {
  console.error(`Missing music bed: ${path.relative(cwd, musicPath)}`);
  process.exit(1);
}

const filterComplex = buildMuxFilterComplex({
  audioEntries,
  totalMs,
  music: musicPath ? {db: musicDb, duck: musicDuck} : null
});

const ffmpegArgs = [
  '-y',
  '-i', inputPath,
  ...audioEntries.flatMap((entry) => ['-i', entry.filePath]),
  ...(musicPath ? ['-stream_loop', '-1', '-i', musicPath] : []),
  '-filter_complex', filterComplex,
  '-map', '0:v',
  '-map', '[aout]',
  '-c:v', 'copy',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-shortest',
  '-movflags', '+faststart',
  outputPath
];

console.log(`Muxing ${audioEntries.length} duel narration tracks into ${path.relative(cwd, outputPath)}`);
for (const entry of audioEntries) {
  console.log(`  ${entry.label.padEnd(10)} @ ${(entry.delayMs / 1000).toFixed(3)}s  ${path.relative(cwd, entry.filePath)}`);
}
if (musicPath) {
  console.log(`  music bed  ${path.relative(cwd, musicPath)} @ ${musicDb}dB, duck=${musicDuck ? 'on' : 'off'}`);
}

const result = spawnSync(ffmpegBin, ffmpegArgs, {cwd, stdio: 'inherit'});
if (result.error?.code === 'ENOENT') {
  console.error(`ffmpeg not found ("${ffmpegBin}"). Install it or pass --ffmpeg <path>.`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error('ffmpeg mux failed.');
  process.exit(result.status ?? 1);
}
console.log(`Final duel video with audio at ${outputPath}`);

if (selectedDuelId) {
  const manifestPath = path.join(path.dirname(outputPath), 'manifest.json');
  let prior = {};
  try {
    prior = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    prior = {};
  }
  const fileName = path.basename(outputPath);
  const nextEntry = {
    duelId: selectedDuelId,
    index: selectedSource.sourceIndex,
    fileName,
    rank: selectedSource.rank ?? selectedSource.sourceIndex,
    source: 'server-render'
  };
  const duels = [...(prior.duels ?? []).filter((entry) => entry.duelId !== selectedDuelId), nextEntry]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  fs.writeFileSync(manifestPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    hook: hookId || null,
    duels
  }, null, 2));
  console.log(`Updated duel video manifest at ${manifestPath}`);
}
