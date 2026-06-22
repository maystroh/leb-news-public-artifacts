import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';
import {createAssetResolver} from './lib/remotion-assets.mjs';

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

const getOutputPath = (resolution) => {
  if (args.output) return path.resolve(cwd, args.output);
  if (resolution.width && resolution.height && !resolution.isDefault) {
    return path.join(outputFolder, `radar-beirut-quote-duel-${resolution.width}x${resolution.height}.mp4`);
  }
  return path.join(outputFolder, 'radar-beirut-quote-duel.mp4');
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
const audioByDuel = fs.existsSync(audioManifestPath) ? (readJson(audioManifestPath).audioByDuel ?? {}) : {};
const warnings = [];

const withLogo = (outletSide, sceneId) => {
  if (!outletSide) return outletSide;
  const logoSrc = getLogoSrc(outletSide.logoFile);
  if (outletSide.logoFile && !logoSrc) {
    warnings.push(`Missing logo for ${sceneId}: public/outlet-logos/${outletSide.logoFile}`);
  }
  return {...outletSide, logoSrc};
};

const duelForRender = {
  ...duel,
  scenes: (duel.scenes ?? []).map((scene, index) => {
    const duelId = scene.id ?? `duel-${index + 1}`;
    const audioEntry = audioByDuel[duelId];
    let audio = scene.audio ?? null;
    if (audioEntry && !audioEntry.skipped) {
      const src = resolveAudioSrc(audioEntry.src);
      if (!src) warnings.push(`Missing audio for ${duelId}: ${audioEntry.src}`);
      audio = {src, durationSeconds: audioEntry.durationSeconds};
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
