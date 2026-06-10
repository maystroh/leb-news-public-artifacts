import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  console.error('Missing folder. Usage: npm run briefing:split:mp4 -- --folder briefings/YYYY-MM-DD');
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
const inputPath = args.input
  ? path.resolve(cwd, args.input)
  : path.join(outputFolder, 'radar-beirut-briefing.mp4');
const segmentsFolder = args['output-dir']
  ? path.resolve(cwd, args['output-dir'])
  : path.join(outputFolder, 'scene-videos');
const manifestPath = path.join(segmentsFolder, 'manifest.json');
const mode = args.mode === 'copy' ? 'copy' : 'reencode';
const preset = args.preset || 'veryfast';
const crf = args.crf || '18';
const audioBitrate = args['audio-bitrate'] || '192k';
const ffmpegBin = args.ffmpeg || 'ffmpeg';

if (!fs.existsSync(briefingDataPath)) {
  console.error(`Missing built briefing data: ${path.relative(cwd, briefingDataPath)}`);
  console.error('Run `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD` first.');
  process.exit(1);
}

const toNumber = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const roundSeconds = (value) => Number(value.toFixed(3));
const slug = (value) => String(value || 'segment')
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'segment';

const briefing = readJson(briefingDataPath);
const scenes = briefing.scenes ?? [];
const introSeconds = toNumber(briefing.intro?.durationSeconds);
const outroSeconds = toNumber(briefing.outro?.durationSeconds);

if (!scenes.length) {
  console.error(`No scenes found in ${path.relative(cwd, briefingDataPath)}`);
  process.exit(1);
}

const sceneStarts = [];
let cursor = introSeconds;
for (const scene of scenes) {
  sceneStarts.push(roundSeconds(cursor));
  cursor += toNumber(scene.durationSeconds);
}
const totalDurationSeconds = roundSeconds(cursor + outroSeconds);

const createSegmentPlan = () => {
  if (scenes.length === 1) {
    return [{
      index: 1,
      id: `intro-${scenes[0].id}-outro`,
      label: `Intro + ${scenes[0].id} + outro`,
      sceneIds: [scenes[0].id],
      includesIntro: true,
      includesOutro: true,
      startSeconds: 0,
      durationSeconds: totalDurationSeconds
    }];
  }

  const segments = [{
    index: 1,
    id: `intro-${scenes[0].id}`,
    label: `Intro + ${scenes[0].id}`,
    sceneIds: [scenes[0].id],
    includesIntro: true,
    includesOutro: false,
    startSeconds: 0,
    durationSeconds: roundSeconds(introSeconds + toNumber(scenes[0].durationSeconds))
  }];

  for (let sceneIndex = 1; sceneIndex < scenes.length - 1; sceneIndex += 1) {
    const scene = scenes[sceneIndex];
    segments.push({
      index: segments.length + 1,
      id: scene.id,
      label: scene.id,
      sceneIds: [scene.id],
      includesIntro: false,
      includesOutro: false,
      startSeconds: sceneStarts[sceneIndex],
      durationSeconds: roundSeconds(toNumber(scene.durationSeconds))
    });
  }

  const lastScene = scenes[scenes.length - 1];
  segments.push({
    index: segments.length + 1,
    id: `${lastScene.id}-outro`,
    label: `${lastScene.id} + outro`,
    sceneIds: [lastScene.id],
    includesIntro: false,
    includesOutro: true,
    startSeconds: sceneStarts[scenes.length - 1],
    durationSeconds: roundSeconds(toNumber(lastScene.durationSeconds) + outroSeconds)
  });

  return segments;
};

const segments = createSegmentPlan().map((segment) => {
  const fileName = `${String(segment.index).padStart(2, '0')}-${slug(segment.id)}.mp4`;
  return {
    ...segment,
    endSeconds: roundSeconds(segment.startSeconds + segment.durationSeconds),
    fileName,
    outputPath: path.join(segmentsFolder, fileName)
  };
});

if (args['dry-run']) {
  console.log(JSON.stringify({
    inputPath: path.relative(cwd, inputPath),
    outputDir: path.relative(cwd, segmentsFolder),
    mode,
    totalDurationSeconds,
    segments: segments.map((segment) => ({
      index: segment.index,
      fileName: segment.fileName,
      startSeconds: segment.startSeconds,
      durationSeconds: segment.durationSeconds,
      endSeconds: segment.endSeconds,
      sceneIds: segment.sceneIds,
      includesIntro: segment.includesIntro,
      includesOutro: segment.includesOutro
    }))
  }, null, 2));
  process.exit(0);
}

if (!fs.existsSync(inputPath)) {
  console.error(`Missing full MP4: ${path.relative(cwd, inputPath)}`);
  console.error('Run `npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD` first, or pass --input <mp4>.');
  process.exit(1);
}

fs.rmSync(segmentsFolder, {recursive: true, force: true});
fs.mkdirSync(segmentsFolder, {recursive: true});

const runFfmpeg = (segment) => {
  const commonArgs = ['-y'];
  const timingArgs = ['-ss', String(segment.startSeconds), '-t', String(segment.durationSeconds)];
  const outputArgs = mode === 'copy'
    ? ['-c', 'copy', '-movflags', '+faststart']
    : [
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', String(crf),
      '-c:a', 'aac',
      '-b:a', audioBitrate,
      '-movflags', '+faststart'
    ];
  const ffmpegArgs = mode === 'copy'
    ? [...commonArgs, ...timingArgs, '-i', inputPath, ...outputArgs, segment.outputPath]
    : [...commonArgs, '-i', inputPath, ...timingArgs, ...outputArgs, segment.outputPath];

  console.log(`Writing ${path.relative(cwd, segment.outputPath)} (${segment.startSeconds}s + ${segment.durationSeconds}s)`);
  const result = spawnSync(ffmpegBin, ffmpegArgs, {
    cwd,
    stdio: args.verbose ? 'inherit' : 'pipe',
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    if (!args.verbose) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`ffmpeg failed for ${segment.fileName}`);
  }
};

try {
  for (const segment of segments) {
    runFfmpeg(segment);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

writeJson(manifestPath, {
  generatedAt: new Date().toISOString(),
  sourceVideoPath: path.relative(cwd, inputPath).replace(/\\/g, '/'),
  briefingDataPath: path.relative(cwd, briefingDataPath).replace(/\\/g, '/'),
  outputDir: path.relative(cwd, segmentsFolder).replace(/\\/g, '/'),
  mode,
  totalDurationSeconds,
  segments: segments.map((segment) => ({
    index: segment.index,
    id: segment.id,
    label: segment.label,
    sceneIds: segment.sceneIds,
    includesIntro: segment.includesIntro,
    includesOutro: segment.includesOutro,
    startSeconds: segment.startSeconds,
    durationSeconds: segment.durationSeconds,
    endSeconds: segment.endSeconds,
    fileName: segment.fileName,
    outputPath: path.relative(cwd, segment.outputPath).replace(/\\/g, '/')
  }))
});

console.log(`Wrote ${segments.length} scene video segment(s) to ${segmentsFolder}`);
console.log(`Manifest: ${manifestPath}`);
