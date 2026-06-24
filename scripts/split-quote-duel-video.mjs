import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';
import {computeDuelTimeline, mergeDuelAudioManifest, DEFAULT_FPS} from './lib/duel-timeline.mjs';
import {normalizeHookId, resolveSharedHook} from './lib/duel-hooks.mjs';

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
const hookId = normalizeHookId(args.hook);
const hookSuffix = hookId ? `-${hookId}` : '';
const inputPath = args.input
  ? path.resolve(cwd, args.input)
  : path.join(outputFolder, `radar-beirut-quote-duel${hookSuffix}-final.mp4`);
const segmentsFolder = args['output-dir']
  ? path.resolve(cwd, args['output-dir'])
  : path.join(outputFolder, `duel-videos${hookSuffix}`);
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
const manifest = fs.existsSync(audioManifestPath) ? readJson(audioManifestPath) : null;
const activeHook = resolveSharedHook(cwd, hookId);
const merged = {...mergeDuelAudioManifest(duel, manifest), hook: activeHook ?? undefined};

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
    hookSeconds: timeline.coldOpenSeconds,
    hookPrependedToEachClip: timeline.coldOpenSeconds > 0,
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

// The hook range [0, hookSeconds] is prepended to EVERY output (each short +
// the full reel) so they all open with the same attention hook (OV/user request).
const hookRange = timeline.coldOpenSeconds > 0 ? [{start: 0, end: timeline.coldOpenSeconds}] : [];

// Cut + concat the given [start,end] master ranges into one clip, re-encoding
// (one pass) so joins are glitch-free regardless of source params (OV3). A
// single range with --mode copy is stream-copied instead (fast/lossless).
const buildClip = (outputPath, ranges, hasAudio, label) => {
  if (mode === 'copy' && ranges.length === 1) {
    const r = ranges[0];
    run(['-y', '-ss', String(r.start), '-t', (r.end - r.start).toFixed(3), '-i', inputPath,
      '-c', 'copy', '-movflags', '+faststart', outputPath], label);
    return;
  }
  const parts = [];
  const refs = [];
  ranges.forEach((r, i) => {
    parts.push(`[0:v]trim=start=${r.start}:end=${Number(r.end).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    if (hasAudio) {
      parts.push(`[0:a]atrim=start=${r.start}:end=${Number(r.end).toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
      refs.push(`[v${i}][a${i}]`);
    } else {
      refs.push(`[v${i}]`);
    }
  });
  const filter = hasAudio
    ? `${parts.join(';')};${refs.join('')}concat=n=${ranges.length}:v=1:a=1[v][a]`
    : `${parts.join(';')};${refs.join('')}concat=n=${ranges.length}:v=1:a=0[v]`;
  run([
    '-y', '-i', inputPath,
    '-filter_complex', filter,
    '-map', '[v]',
    ...(hasAudio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', audioBitrate] : []),
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
    '-movflags', '+faststart',
    outputPath
  ], label);
};

if (mode === 'copy' && hookRange.length) {
  console.warn('Warning: --mode copy ignored for hook-prefixed clips (concat needs re-encode).');
}

try {
  const hasAudio = probeHasAudio(inputPath);
  for (const segment of segments) {
    const ranges = [...hookRange, {start: segment.startSeconds, end: segment.startSeconds + segment.durationSeconds}];
    buildClip(segment.outputPath, ranges, hasAudio,
      `Writing ${path.relative(cwd, segment.outputPath)} (${hookRange.length ? 'hook + ' : ''}${segment.duelId} ${segment.durationSeconds}s)`);
  }
  const fullPath = path.join(segmentsFolder, 'quote-duel-full.mp4');
  if (mainPlan.length) {
    const mainRanges = mainPlan.map((s) => ({start: s.startSeconds, end: s.startSeconds + s.durationSeconds}));
    buildClip(fullPath, [...hookRange, ...mainRanges], hasAudio,
      `Writing ${path.relative(cwd, fullPath)} (full reel: ${hookRange.length ? 'hook + ' : ''}${mainPlan.map((s) => s.duelId).join(', ')}, ${timeline.fullSeconds}s${hasAudio ? '' : ', silent'})`);
  }
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
