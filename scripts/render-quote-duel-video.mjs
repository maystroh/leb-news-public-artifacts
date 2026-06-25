import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';
import {createAssetResolver} from './lib/remotion-assets.mjs';
import {mergeDuelAudioManifest} from './lib/duel-timeline.mjs';
import {normalizeHookId, resolveSharedHook, resolveSharedOutro} from './lib/duel-hooks.mjs';

// Renders the QuoteDuel Remotion composition for a date folder. Mirrors
// render-briefing-video.mjs but for duels: merges the per-duel audio manifest
// (audio/quote-duel-manifest.json) and resolved logo/audio srcs into the duel
// data, then renders src/index.jsx → QuoteDuel. --muted passes through so the
// server can render fast and the duel muxer attaches audio afterward.

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  console.error('Missing folder. Usage: npm run briefing:duel:render -- --folder briefings/YYYY-MM-DD');
  process.exit(1);
}

const parseEven = (value, label) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer.`);
  if (n % 2 !== 0) throw new Error(`${label} must be even for H.264.`);
  return n;
};
const parseResolution = (value) => {
  const m = String(value ?? '').trim().match(/^(\d+)x(\d+)$/i);
  if (!m) throw new Error(`Invalid resolution "${value}". Use WIDTHxHEIGHT, e.g. 720x1280.`);
  return {width: parseEven(m[1], 'Resolution width'), height: parseEven(m[2], 'Resolution height')};
};
const parseResolutions = () => {
  if (args.resolutions) {
    return String(args.resolutions).split(',').map((s) => s.trim()).filter(Boolean).map(parseResolution);
  }
  if (args.resolution) return [parseResolution(args.resolution)];
  return [{width: 720, height: 1280, isDefault: true}];
};
const padTwo = (value) => String(value).padStart(2, '0');
const splitList = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const selectedDuelIds = [...splitList(args.duels), ...splitList(args.duel)];

let renderResolutions;
try {
  renderResolutions = parseResolutions();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (args.output && renderResolutions.length > 1) {
  console.error('Cannot use --output with --resolutions (multiple files).');
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
const remotionAssetsFolder = path.join(outputFolder, 'remotion-duel-assets');
const propsPath = path.join(outputFolder, 'remotion-quote-duel-props.json');
const fontFiles = ['Dubai-Regular.ttf', 'Dubai-Medium.ttf', 'Dubai-Bold.ttf'];

if (!fs.existsSync(quoteDuelPath)) {
  console.error(`Missing built quote-duel data: ${path.relative(cwd, quoteDuelPath)}`);
  console.error('Run `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD` first.');
  process.exit(1);
}

const hookId = normalizeHookId(args.hook);
const hookSuffix = hookId ? `-${hookId}` : '';

const getOutputPath = (resolution) => {
  if (args.output) return path.resolve(cwd, args.output);
  if (selectedDuelIds.length === 1) {
    const selectedIndex = (duelForRender.scenes ?? [])[0]?.sourceIndex;
    const fileName = selectedIndex ? `duel-${padTwo(selectedIndex)}.mp4` : `${selectedDuelIds[0]}.mp4`;
    return path.join(outputFolder, `duel-videos${hookSuffix}`, 'muted', fileName);
  }
  if (resolution.width && resolution.height && !resolution.isDefault) {
    return path.join(outputFolder, `radar-beirut-quote-duel${hookSuffix}-${resolution.width}x${resolution.height}.mp4`);
  }
  return path.join(outputFolder, `radar-beirut-quote-duel${hookSuffix}.mp4`);
};

fs.mkdirSync(outputFolder, {recursive: true});
fs.rmSync(remotionAssetsFolder, {recursive: true, force: true});
fs.mkdirSync(remotionAssetsFolder, {recursive: true});

const {copyAsset, resolveAudioSrc, getLogoSrc} = createAssetResolver({
  outputFolder,
  assetsFolder: remotionAssetsFolder,
  cwd
});

const duel = readJson(quoteDuelPath);
const manifest = fs.existsSync(audioManifestPath) ? readJson(audioManifestPath) : null;
const merged = mergeDuelAudioManifest(duel, manifest);
const activeHook = resolveSharedHook(cwd, hookId);
const activeOutro = resolveSharedOutro(cwd);
const warnings = [];
if (hookId && !activeHook) {
  warnings.push(`--hook ${hookId} has no WAV in audio/hooks/ — run \`npm run briefing:duel:hooks\` first. Rendering without a hook.`);
}
if (!activeOutro) {
  warnings.push('Missing shared Quote Duel outro WAV in audio/hooks/manifest.json — run `npm run briefing:duel:hooks`.');
}

const withLogo = (outletSide, sceneId) => {
  if (!outletSide) return outletSide;
  const logoSrc = getLogoSrc(outletSide.logoFile);
  if (outletSide.logoFile && !logoSrc) {
    warnings.push(`Missing logo for ${sceneId}: public/outlet-logos/${outletSide.logoFile}`);
  }
  return {...outletSide, logoSrc};
};

const allScenes = merged.scenes ?? [];
const requestedDuelSet = new Set(selectedDuelIds);
const selectedScenes = requestedDuelSet.size
  ? allScenes
      .map((scene, index) => ({...scene, sourceIndex: index + 1, id: scene.id ?? `duel-${index + 1}`}))
      .filter((scene) => requestedDuelSet.has(scene.id))
  : allScenes.map((scene, index) => ({...scene, sourceIndex: index + 1, id: scene.id ?? `duel-${index + 1}`}));

if (requestedDuelSet.size && selectedScenes.length !== requestedDuelSet.size) {
  const found = new Set(selectedScenes.map((scene) => scene.id));
  const missing = [...requestedDuelSet].filter((duelId) => !found.has(duelId));
  console.error(`Unknown duel id(s): ${missing.join(', ')}`);
  process.exit(1);
}
if (requestedDuelSet.size > 1 && !args.output) {
  console.error('Pass one --duel per render, or provide --output when rendering multiple selected duels.');
  process.exit(1);
}

const duelForRender = {
  ...merged,
  hooks: undefined,
  assets: {
    ...(merged.assets ?? {}),
    introBackgroundSrc: copyAsset(path.join(cwd, 'logos', 'video-front-page-3.png'), 'logos/video-front-page-3.png')
  },
  // The hook WAV is a shared asset under audio/hooks/ — copy it into the render
  // staging dir from its absolute path (not output-relative).
  hook: activeHook
    ? {
        id: activeHook.id,
        text: activeHook.text,
        durationSeconds: activeHook.durationSeconds,
        audioSrc: copyAsset(activeHook.wavPath, `audio/${activeHook.file}`)
      }
    : undefined,
  outro: {
    ...(merged.outro ?? {}),
    text: activeOutro?.text ?? merged.outro?.text,
    durationSeconds: activeOutro?.durationSeconds ?? merged.outro?.durationSeconds,
    audioSrc: activeOutro ? copyAsset(activeOutro.wavPath, `audio/${activeOutro.file}`) : undefined
  },
  scenes: selectedScenes.map((scene) => {
    const duelId = scene.id;
    let audio = scene.audio ?? null;
    if (audio?.src) {
      const src = resolveAudioSrc(audio.src);
      if (!src) warnings.push(`Missing audio for ${duelId}: ${audio.src}`);
      audio = {...audio, src};
    }
    return {
      ...scene,
      left: withLogo(scene.left, duelId),
      right: withLogo(scene.right, duelId),
      audio
    };
  })
};

for (const fontFile of fontFiles) {
  if (!copyAsset(path.join(cwd, 'fonts', fontFile), `fonts/${fontFile}`)) {
    warnings.push(`Missing font: fonts/${fontFile}`);
  }
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);

writeJson(propsPath, {duel: duelForRender});

const remotionCliPath = path.join(cwd, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const nodeOptions = process.env.NODE_OPTIONS ?? '';
const dnsOption = '--dns-result-order=ipv4first';
const isLinux = process.platform === 'linux';

for (const resolution of renderResolutions) {
  const outputPath = getOutputPath(resolution);
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  const label = `${resolution.width}x${resolution.height}${resolution.isDefault ? ' (default)' : ''}`;
  const remotionArgs = [
    remotionCliPath,
    'render',
    path.join('src', 'index.jsx'),
    'QuoteDuel',
    `--output=${outputPath}`,
    `--props=${propsPath}`,
    `--public-dir=${remotionAssetsFolder}`,
    '--overwrite',
    '--codec=h264',
    '--audio-codec=aac',
    `--timeout=${args.timeout ?? 120000}`,
    `--width=${resolution.width}`,
    `--height=${resolution.height}`,
    `--concurrency=${args.concurrency ?? 12}`
  ];

  if (args.frames) remotionArgs.push(`--frames=${args.frames}`);
  if (args.log) remotionArgs.push(`--log=${args.log}`);

  const glRenderer = args.gl ?? (isLinux ? 'angle-egl' : 'angle');
  if (glRenderer !== 'off') remotionArgs.push(`--gl=${glRenderer}`);
  const chromeMode = args['chrome-mode'] ?? (isLinux && glRenderer !== 'off' ? 'chrome-for-testing' : undefined);
  if (chromeMode) remotionArgs.push(`--chrome-mode=${chromeMode}`);

  if (args.muted) remotionArgs.push('--muted');

  console.log(`Rendering QuoteDuel MP4 (${label} @ 30fps): ${path.relative(cwd, outputPath)}`);
  const result = spawnSync(process.execPath, remotionArgs, {
    cwd,
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions.includes(dnsOption) ? nodeOptions : [nodeOptions, dnsOption].filter(Boolean).join(' ')
    },
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error('Remotion render failed.');
    process.exit(result.status ?? 1);
  }
  console.log(`Rendered QuoteDuel MP4 at ${outputPath}`);
}
