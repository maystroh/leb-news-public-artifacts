import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {buildMuxFilterComplex} from './lib/audio-mux.mjs';
import {computeDuelTimeline, mergeDuelAudioManifest, resolveDuelHook, normalizeHookId, DEFAULT_FPS} from './lib/duel-timeline.mjs';

// Attaches per-duel narration WAVs to the muted QuoteDuel render at their
// frame-accurate cumulative offsets, then muxes onto the video by stream-copy
// (finishes in seconds). Offsets come from lib/duel-timeline.mjs — the SAME
// source the comp uses — so audio lands exactly where each duel starts.

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
const activeHook = resolveDuelHook(duel, manifest, hookId);
const merged = {...mergeDuelAudioManifest(duel, manifest), hook: activeHook ?? undefined};

const timeline = computeDuelTimeline(merged, FPS, {requireAudio: true});
const frameToMs = (frame) => Math.round((frame / FPS) * 1000);

const audioEntries = [];

// Selected hook (the single shared spoken line) plays at the master start, offset 0.
if (timeline.coldOpenFrames > 0 && activeHook?.file) {
  const hookPath = path.join(audioDir, activeHook.file);
  if (fs.existsSync(hookPath)) {
    audioEntries.push({label: `hook(${activeHook.id})`, filePath: hookPath, delayMs: 0});
  } else {
    console.warn(`Warning: missing hook WAV: ${path.relative(cwd, hookPath)}`);
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
