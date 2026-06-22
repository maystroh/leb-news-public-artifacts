import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';
import {computeDuelTimeline, DEFAULT_FPS} from './lib/duel-timeline.mjs';

// Splits the final QuoteDuel MP4 into:
//   - duel-NN.mp4 : each duel standalone (no intro/outro), SOURCE-ordinal so a
//     skipped duel never renumbers the survivors.
//   - quote-duel-full.mp4 : the top-3 ranked "main" duels (<=60s), built by
//     RE-ENCODING the selected ranges from the master in one ffmpeg pass
//     (trim+concat) so joins are always glitch-free regardless of clip params.
// Plan (offsets, ranking, 60s cap, skip) all come from lib/duel-timeline.mjs.

const FPS = DEFAULT_FPS;
const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  console.error('Missing folder. Usage: npm run briefing:duel:split -- --folder briefings/YYYY-MM-DD');
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
const inputPath = args.input
  ? path.resolve(cwd, args.input)
  : path.join(outputFolder, 'radar-beirut-quote-duel-final.mp4');
const segmentsFolder = args['output-dir']
  ? path.resolve(cwd, args['output-dir'])
  : path.join(outputFolder, 'duel-videos');
const manifestPath = path.join(segmentsFolder, 'manifest.json');
const mode = args.mode === 'copy' ? 'copy' : 'reencode';
const preset = args.preset || 'veryfast';
const crf = args.crf || '18';
const audioBitrate = args['audio-bitrate'] || '192k';
const ffmpegBin = args.ffmpeg || 'ffmpeg';

if (!fs.existsSync(quoteDuelPath)) {
  console.error(`Missing built quote-duel data: ${path.relative(cwd, quoteDuelPath)}`);
  process.exit(1);
}

const duel = readJson(quoteDuelPath);
const audioByDuel = fs.existsSync(audioManifestPath) ? (readJson(audioManifestPath).audioByDuel ?? {}) : {};
const merged = {
  ...duel,
  scenes: (duel.scenes ?? []).map((scene, index) => {
    const duelId = scene.id ?? `duel-${index + 1}`;
    const entry = audioByDuel[duelId];
    return entry && !entry.skipped
      ? {...scene, audio: {src: entry.src, durationSeconds: entry.durationSeconds}}
      : scene;
  })
};

// Require audio only when an audio manifest exists (the real muxed pipeline).
// A silent placeholder render (no manifest) splits by declared durations so the
// layout can be eyeballed before audio is generated. --allow-silent forces it.
const requireAudio = !args['allow-silent'] && fs.existsSync(audioManifestPath);
const timeline = computeDuelTimeline(merged, FPS, {requireAudio});
const padTwo = (n) => String(n).padStart(2, '0');

const segments = timeline.duels
  .filter((d) => !d.skipped)
  .map((d) => {
    const fileName = `duel-${padTwo(d.index)}.mp4`;
    return {
      duelId: d.duelId,
      index: d.index,
      rank: d.rank,
      main: d.main,
      startSeconds: d.startSeconds,
      durationSeconds: d.durationSeconds,
      endSeconds: d.endSeconds,
      fileName,
      outputPath: path.join(segmentsFolder, fileName)
    };
  });

const mainPlan = timeline.mainPlan
  .map((duelId) => segments.find((s) => s.duelId === duelId))
  .filter(Boolean);

const skipped = timeline.duels.filter((d) => d.skipped).map((d) => ({duelId: d.duelId, index: d.index, skipReason: d.skipReason}));

if (args['dry-run']) {
  console.log(JSON.stringify({
    inputPath: path.relative(cwd, inputPath),
    outputDir: path.relative(cwd, segmentsFolder),
    mode,
    totalSeconds: timeline.totalSeconds,
    atomic: segments.map(({fileName, duelId, rank, main, startSeconds, durationSeconds, endSeconds}) =>
      ({fileName, duelId, rank, main, startSeconds, durationSeconds, endSeconds})),
    fullReel: {fileName: 'quote-duel-full.mp4', duelIds: mainPlan.map((s) => s.duelId), seconds: timeline.fullSeconds},
    droppedFromFull: timeline.droppedFromFull,
    skipped,
    warnings: timeline.warnings
  }, null, 2));
  process.exit(0);
}

if (!segments.length) {
  console.error('No duels with audio to split.');
  process.exit(1);
}
if (!fs.existsSync(inputPath)) {
  console.error(`Missing final MP4: ${path.relative(cwd, inputPath)}`);
  console.error('Render + mux first, or pass --input <mp4>.');
  process.exit(1);
}

fs.rmSync(segmentsFolder, {recursive: true, force: true});
fs.mkdirSync(segmentsFolder, {recursive: true});

// Detect whether the master has an audio stream. The normal path (muxed final)
// does; a silent placeholder render does not, and the full-reel concat must not
// reference [0:a] when it's absent.
const probeHasAudio = (file) => {
  const probe = spawnSync(args.ffprobe || 'ffprobe',
    ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file],
    {encoding: 'utf8'});
  if (probe.error || probe.status !== 0) return true; // assume audio if ffprobe is unavailable
  return Boolean(probe.stdout && probe.stdout.trim());
};

const run = (ffmpegArgs, label) => {
  console.log(label);
  const result = spawnSync(ffmpegBin, ffmpegArgs, {cwd, stdio: args.verbose ? 'inherit' : 'pipe', encoding: 'utf8'});
  if (result.status !== 0) {
    if (!args.verbose) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`ffmpeg failed: ${label}`);
  }
};

const cutAtomic = (segment) => {
  const timing = ['-ss', String(segment.startSeconds), '-t', String(segment.durationSeconds)];
  const out = mode === 'copy'
    ? ['-c', 'copy', '-movflags', '+faststart']
    : ['-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
       '-c:a', 'aac', '-b:a', audioBitrate, '-movflags', '+faststart'];
  const ffmpegArgs = mode === 'copy'
    ? ['-y', ...timing, '-i', inputPath, ...out, segment.outputPath]
    : ['-y', '-i', inputPath, ...timing, ...out, segment.outputPath];
  run(ffmpegArgs, `Writing ${path.relative(cwd, segment.outputPath)} (${segment.startSeconds}s + ${segment.durationSeconds}s)`);
};

// Full reel: trim each main range from the master and concat in ONE re-encode
// pass (OV3 — glitch-free regardless of atomic-clip codec params).
const buildFullReel = (fullPath, hasAudio) => {
  const parts = [];
  const concatRefs = [];
  mainPlan.forEach((s, i) => {
    const end = (s.startSeconds + s.durationSeconds).toFixed(3);
    parts.push(`[0:v]trim=start=${s.startSeconds}:end=${end},setpts=PTS-STARTPTS[v${i}]`);
    if (hasAudio) {
      parts.push(`[0:a]atrim=start=${s.startSeconds}:end=${end},asetpts=PTS-STARTPTS[a${i}]`);
      concatRefs.push(`[v${i}][a${i}]`);
    } else {
      concatRefs.push(`[v${i}]`);
    }
  });
  const filter = hasAudio
    ? `${parts.join(';')};${concatRefs.join('')}concat=n=${mainPlan.length}:v=1:a=1[v][a]`
    : `${parts.join(';')};${concatRefs.join('')}concat=n=${mainPlan.length}:v=1:a=0[v]`;
  const ffmpegArgs = [
    '-y', '-i', inputPath,
    '-filter_complex', filter,
    '-map', '[v]',
    ...(hasAudio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', audioBitrate] : []),
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
    '-movflags', '+faststart',
    fullPath
  ];
  run(ffmpegArgs, `Writing ${path.relative(cwd, fullPath)} (full reel: ${mainPlan.map((s) => s.duelId).join(', ')}, ${timeline.fullSeconds}s${hasAudio ? '' : ', silent'})`);
};

try {
  for (const segment of segments) cutAtomic(segment);
  const fullPath = path.join(segmentsFolder, 'quote-duel-full.mp4');
  if (mainPlan.length) buildFullReel(fullPath, probeHasAudio(inputPath));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

for (const warning of timeline.warnings) console.warn(`Warning: ${warning}`);

writeJson(manifestPath, {
  generatedAt: new Date().toISOString(),
  sourceVideoPath: path.relative(cwd, inputPath).replace(/\\/g, '/'),
  outputDir: path.relative(cwd, segmentsFolder).replace(/\\/g, '/'),
  mode,
  totalSeconds: timeline.totalSeconds,
  fullReel: {
    fileName: 'quote-duel-full.mp4',
    duelIds: mainPlan.map((s) => s.duelId),
    seconds: timeline.fullSeconds,
    droppedFromFull: timeline.droppedFromFull
  },
  skipped,
  duels: segments.map((s) => ({
    duelId: s.duelId,
    index: s.index,
    rank: s.rank,
    main: s.main,
    startSeconds: s.startSeconds,
    durationSeconds: s.durationSeconds,
    endSeconds: s.endSeconds,
    fileName: s.fileName,
    outputPath: path.relative(cwd, s.outputPath).replace(/\\/g, '/')
  }))
});

console.log(`Wrote ${segments.length} duel clip(s) + full reel to ${segmentsFolder}`);
console.log(`Manifest: ${manifestPath}`);
