import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  console.error('Missing folder. Usage: npm run briefing:render:intro -- --folder briefings/YYYY-MM-DD');
  process.exit(1);
}

const parsePositiveInteger = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  if (parsed % 2 !== 0) {
    throw new Error(`${label} must be an even number for H.264 output.`);
  }
  return parsed;
};

const parseResolution = (value) => {
  const match = String(value ?? '').trim().match(/^(\d+)x(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid resolution "${value}". Use WIDTHxHEIGHT, for example 540x960.`);
  }
  return {
    width: parsePositiveInteger(match[1], 'Resolution width'),
    height: parsePositiveInteger(match[2], 'Resolution height')
  };
};

let resolution = {width: null, height: null};
try {
  if (args.resolution) {
    resolution = parseResolution(args.resolution);
  } else if (args.width || args.height) {
    if (!args.width || !args.height) {
      throw new Error('Pass both --width and --height, or use --resolution WIDTHxHEIGHT.');
    }
    resolution = {
      width: parsePositiveInteger(args.width, 'Width'),
      height: parsePositiveInteger(args.height, 'Height')
    };
  }
} catch (error) {
  console.error(error.message);
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
const propsPath = path.join(outputFolder, 'remotion-intro-props.json');
const remotionAssetsFolder = path.join(outputFolder, 'remotion-intro-assets');
const introAudioPath = path.join(cwd, 'templates', 'radar-beirut-into-audio-new.mp3');
const frontPagePath = path.join(cwd, 'public', 'video-front-page-3.png');
const fontFiles = ['Dubai-Regular.ttf', 'Dubai-Medium.ttf', 'Dubai-Bold.ttf'];

if (!fs.existsSync(briefingDataPath)) {
  console.error(`Missing built briefing data: ${path.relative(cwd, briefingDataPath)}`);
  console.error('Run `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD` first.');
  process.exit(1);
}

fs.mkdirSync(outputFolder, {recursive: true});
fs.rmSync(remotionAssetsFolder, {recursive: true, force: true});
fs.mkdirSync(remotionAssetsFolder, {recursive: true});

const copyAsset = (sourcePath, targetRelativePath) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const normalizedTarget = targetRelativePath.replace(/\\/g, '/');
  const targetPath = path.join(remotionAssetsFolder, normalizedTarget);
  fs.mkdirSync(path.dirname(targetPath), {recursive: true});
  fs.copyFileSync(sourcePath, targetPath);
  return normalizedTarget;
};

const warnings = [];
const briefing = readJson(briefingDataPath);
const props = {
  briefing,
  assets: {
    introAudioSrc: copyAsset(introAudioPath, `audio/${path.basename(introAudioPath)}`),
    frontPageSrc: copyAsset(frontPagePath, `background/${path.basename(frontPagePath)}`)
  }
};

if (!props.assets.introAudioSrc) warnings.push(`Missing intro audio: ${path.relative(cwd, introAudioPath)}`);
if (!props.assets.frontPageSrc) warnings.push(`Missing intro background: ${path.relative(cwd, frontPagePath)}`);

for (const fontFile of fontFiles) {
  const copiedFont = copyAsset(path.join(cwd, 'fonts', fontFile), `fonts/${fontFile}`);
  if (!copiedFont) warnings.push(`Missing font: fonts/${fontFile}`);
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

writeJson(propsPath, props);

const outputPath = args.output
  ? path.resolve(cwd, args.output)
  : path.join(outputFolder, resolution.width && resolution.height
    ? `radar-beirut-intro-${resolution.width}x${resolution.height}.mp4`
    : 'radar-beirut-intro.mp4');

const remotionCliPath = path.join(cwd, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const nodeOptions = process.env.NODE_OPTIONS ?? '';
const dnsResultOrderOption = '--dns-result-order=ipv4first';
const remotionArgs = [
  remotionCliPath,
  'render',
  path.join('src', 'index.jsx'),
  'ProductionIntroOnly',
  `--output=${outputPath}`,
  `--props=${propsPath}`,
  `--public-dir=${remotionAssetsFolder}`,
  '--overwrite',
  '--codec=h264',
  '--audio-codec=aac',
  `--timeout=${args.timeout ?? 120000}`
];

if (resolution.width && resolution.height) {
  remotionArgs.push(`--width=${resolution.width}`, `--height=${resolution.height}`);
}

if (args.frames) remotionArgs.push(`--frames=${args.frames}`);
if (args.log) remotionArgs.push(`--log=${args.log}`);

const resolutionLabel = resolution.width && resolution.height
  ? `${resolution.width}x${resolution.height}`
  : 'composition default 1080x1920';

console.log(`Rendering production intro MP4 (${resolutionLabel} @ 30fps): ${path.relative(cwd, outputPath)}`);
const result = spawnSync(process.execPath, remotionArgs, {
  cwd,
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions.includes(dnsResultOrderOption)
      ? nodeOptions
      : [nodeOptions, dnsResultOrderOption].filter(Boolean).join(' ')
  },
  stdio: 'inherit'
});

if (result.status !== 0) {
  console.error('');
  console.error('Remotion intro render failed.');
  console.error('If you switched between Windows and WSL, run `npm install` in the environment you are rendering from.');
  process.exit(result.status ?? 1);
}

console.log(`Rendered production intro MP4 at ${outputPath}`);
