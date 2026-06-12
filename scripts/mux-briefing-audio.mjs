import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';

const FPS = 30;

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  console.error('Missing folder. Usage: npm run briefing:mux:audio -- --folder briefings/YYYY-MM-DD [--input video.mp4] [--output final.mp4]');
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
const briefingDataPath = path.join(outputFolder, 'briefing.json');
const introAudioPath = path.join(cwd, 'templates', 'radar-beirut-into-audio-new.mp3');
const ffmpegBin = args.ffmpeg || 'ffmpeg';

if (!fs.existsSync(briefingDataPath)) {
  console.error(`Missing built briefing data: ${path.relative(cwd, briefingDataPath)}`);
  console.error('Run `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD` first.');
  process.exit(1);
}

const inputPath = args.input
  ? path.resolve(cwd, args.input)
  : path.join(outputFolder, 'radar-beirut-briefing.mp4');

if (!fs.existsSync(inputPath)) {
  console.error(`Missing input video: ${path.relative(cwd, inputPath)}`);
  console.error('Render it first, e.g. `npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD --muted`.');
  process.exit(1);
}

const outputPath = args.output
  ? path.resolve(cwd, args.output)
  : path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}-final.mp4`
    );

if (path.resolve(outputPath) === path.resolve(inputPath)) {
  console.error('Output path must differ from input path.');
  process.exit(1);
}

const briefing = readJson(briefingDataPath);

// Mirrors fpsFromSeconds() in src/ProductionBriefingVideo.jsx — offsets must
// match the frame the composition starts each <Sequence> on.
const fpsFromSeconds = (seconds) => Math.max(1, Math.round((seconds || 0) * FPS));
const frameToMs = (frame) => Math.round((frame / FPS) * 1000);

const audioEntries = [];

if (fs.existsSync(introAudioPath)) {
  audioEntries.push({label: 'intro', filePath: introAudioPath, delayMs: 0});
} else {
  console.warn(`Warning: missing intro audio: ${path.relative(cwd, introAudioPath)}`);
}

let cursor = fpsFromSeconds(briefing.intro?.durationSeconds);

for (const scene of briefing.scenes ?? []) {
  const durationInFrames = fpsFromSeconds(scene.durationSeconds);
  if (scene.audio?.src) {
    const filePath = path.resolve(outputFolder, scene.audio.src);
    if (fs.existsSync(filePath)) {
      audioEntries.push({label: scene.id, filePath, delayMs: frameToMs(cursor)});
    } else {
      console.warn(`Warning: missing audio for ${scene.id}: ${scene.audio.src}`);
    }
  }
  cursor += durationInFrames;
}

if (briefing.outro?.audio?.src) {
  const filePath = path.resolve(outputFolder, briefing.outro.audio.src);
  if (fs.existsSync(filePath)) {
    audioEntries.push({label: 'outro', filePath, delayMs: frameToMs(cursor)});
  } else {
    console.warn(`Warning: missing outro audio: ${briefing.outro.audio.src}`);
  }
}

if (!audioEntries.length) {
  console.error('No audio files found to mux.');
  process.exit(1);
}

// Optional background music bed: --music [path] (default audio/ambient-radar-bed.mp3),
// --music-db <level, default -22>, --music-duck off to disable sidechain ducking.
const DEFAULT_MUSIC_PATH = path.join(cwd, 'audio', 'ambient-radar-bed.mp3');
const musicPath = args.music === true
  ? DEFAULT_MUSIC_PATH
  : args.music
    ? path.resolve(cwd, args.music)
    : null;
const musicDb = Number.isFinite(Number(args['music-db'])) ? Number(args['music-db']) : -22;
const musicDuck = `${args['music-duck'] ?? 'on'}` !== 'off' && `${args['music-duck']}` !== 'false';

if (musicPath && !fs.existsSync(musicPath)) {
  console.error(`Missing music bed: ${path.relative(cwd, musicPath)}`);
  process.exit(1);
}

let totalMs = frameToMs(cursor);
if (briefing.outro?.durationSeconds) {
  totalMs += Math.round(briefing.outro.durationSeconds * 1000);
}

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

console.log(`Muxing ${audioEntries.length} narration tracks into ${path.relative(cwd, outputPath)}`);
for (const entry of audioEntries) {
  console.log(`  ${entry.label.padEnd(10)} @ ${(entry.delayMs / 1000).toFixed(3)}s  ${path.relative(cwd, entry.filePath)}`);
}
if (musicPath) {
  console.log(`  music bed  ${path.relative(cwd, musicPath)} @ ${musicDb}dB, duck=${musicDuck ? 'on' : 'off'}, fade-out 1.5s`);
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

console.log(`Final video with audio at ${outputPath}`);
