import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  console.error('Missing folder. Usage: npm run briefing:render:mp4 -- --folder briefings/YYYY-MM-DD');
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
    throw new Error(`Invalid resolution "${value}". Use WIDTHxHEIGHT, for example 720x1280.`);
  }
  return {
    width: parsePositiveInteger(match[1], 'Resolution width'),
    height: parsePositiveInteger(match[2], 'Resolution height')
  };
};

const parseRenderResolutions = () => {
  if (args.resolutions) {
    return String(args.resolutions)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map(parseResolution);
  }

  if (args.resolution) {
    return [parseResolution(args.resolution)];
  }

  if (args.width || args.height) {
    if (!args.width || !args.height) {
      throw new Error('Pass both --width and --height, or use --resolution WIDTHxHEIGHT.');
    }
    return [{
      width: parsePositiveInteger(args.width, 'Width'),
      height: parsePositiveInteger(args.height, 'Height')
    }];
  }

  // Default render resolution. The output keeps the unsuffixed filename so
  // downstream defaults (briefing:mux:audio, briefing:split:mp4) still match.
  return [{width: 720, height: 1280, isDefault: true}];
};

let renderResolutions;
try {
  renderResolutions = parseRenderResolutions();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (args.output && renderResolutions.length > 1) {
  console.error('Cannot use --output with --resolutions because multiple files will be rendered.');
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
const htmlOutputPath = path.join(outputFolder, 'radar-beirut-briefing.html');
const propsPath = path.join(outputFolder, 'remotion-briefing-props.json');
const remotionAssetsFolder = path.join(outputFolder, 'remotion-assets');
const introAudioPath = path.join(cwd, 'templates', 'radar-beirut-into-audio-new.mp3');
const frontPagePath = path.join(cwd, 'public', 'video-front-page-3.png');
const fontFiles = ['Dubai-Regular.ttf', 'Dubai-Medium.ttf', 'Dubai-Bold.ttf'];

const getOutputPath = (resolution) => {
  if (args.output) return path.resolve(cwd, args.output);
  if (resolution.width && resolution.height && !resolution.isDefault) {
    return path.join(outputFolder, `radar-beirut-briefing-${resolution.width}x${resolution.height}.mp4`);
  }
  return path.join(outputFolder, 'radar-beirut-briefing.mp4');
};

if (!fs.existsSync(briefingDataPath)) {
  console.error(`Missing built briefing data: ${path.relative(cwd, briefingDataPath)}`);
  console.error('Run `npm run briefing:build:folder -- --folder briefings/YYYY-MM-DD` first.');
  process.exit(1);
}

if (!fs.existsSync(htmlOutputPath)) {
  console.warn(`Warning: ${path.relative(cwd, htmlOutputPath)} does not exist. Rendering MP4 from briefing JSON only.`);
}

fs.mkdirSync(outputFolder, {recursive: true});
fs.rmSync(remotionAssetsFolder, {recursive: true, force: true});
fs.mkdirSync(remotionAssetsFolder, {recursive: true});

const briefing = readJson(briefingDataPath);
const resolveFromOutput = (relativePath) => path.resolve(outputFolder, relativePath);
const safeFilePart = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
const copyAsset = (sourcePath, targetRelativePath) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;

  const normalizedTarget = targetRelativePath.replace(/\\/g, '/');
  const targetPath = path.join(remotionAssetsFolder, normalizedTarget);
  fs.mkdirSync(path.dirname(targetPath), {recursive: true});
  fs.copyFileSync(sourcePath, targetPath);
  return normalizedTarget;
};
const resolveAudioSrc = (src) => {
  if (!src) return null;
  if (/^(https?|file):/i.test(src)) return src;
  const sourcePath = resolveFromOutput(src);
  return copyAsset(sourcePath, `audio/${path.basename(sourcePath)}`);
};

const logoSrcByFile = new Map();
const getLogoSrc = (logoFile) => {
  if (!logoFile) return null;
  if (logoSrcByFile.has(logoFile)) return logoSrcByFile.get(logoFile);

  const logoPath = path.join(cwd, 'public', 'outlet-logos', logoFile);
  const src = copyAsset(logoPath, `outlet-logos/${logoFile}`);
  logoSrcByFile.set(logoFile, src);
  return src;
};

const FRONT_PAGE_ALIASES = {
  aawsat: ['aawsat', 'asharqalawsat'],
  'nidaa-al-watan': ['nidaalwatan', 'nidaaalwatan', 'nidaa-al-watan'],
  'asas-media': ['asasmedia', 'asas-media'],
  aliwaa: ['aliwaa', 'aliwaa2'],
  aljoumhouria: ['aljoumhouria', 'joumhouria'],
  almodon: ['almodon', 'modon'],
  alakhbar: ['alakhbar', 'akhbar'],
  aldiyar: ['aldiyar', 'addiyar', 'diyar'],
  albinaa: ['albinaa', 'albina2', 'binaa'],
  '180post': ['180post']
};

const MULTI_IMAGE_OUTLET_KEYS = new Set(['asas-media', 'almodon']);
const ARTICLE_SEQUENCE_HINT = /(article|articles|content|screenshot|screen|shot|story|capture|clip)/i;

const detectOutletMedia = () => {
  const imageFiles = fs
    .readdirSync(briefingFolder)
    .filter((entry) => /\.(png|jpe?g|webp)$/i.test(entry));

  const mapping = {};
  for (const scene of briefing.scenes ?? []) {
    const outletKey = scene.outlet?.key;
    if (!outletKey || mapping[outletKey]) continue;

    const aliases = FRONT_PAGE_ALIASES[outletKey] ?? [outletKey];
    const matches = imageFiles.filter((fileName) => {
      const normalized = fileName.toLowerCase();
      return aliases.some((alias) => normalized.includes(alias.toLowerCase()));
    });
    const articleMatches = matches
      .filter((fileName) => ARTICLE_SEQUENCE_HINT.test(fileName))
      .sort((left, right) => left.localeCompare(right));
    const sortedMatches = matches.sort((left, right) => left.localeCompare(right));
    const chosenFiles = articleMatches.length
      ? articleMatches
      : MULTI_IMAGE_OUTLET_KEYS.has(outletKey) && sortedMatches.length > 1
        ? sortedMatches
        : sortedMatches.slice(0, 1);

    if (chosenFiles.length) {
      mapping[outletKey] = {
        fitMode: articleMatches.length ? 'contain' : 'cover',
        items: chosenFiles
          .map((fileName, index) => {
            const extension = path.extname(fileName) || '.jpg';
            const targetName = `${safeFilePart(outletKey)}-${String(index + 1).padStart(2, '0')}${extension}`;
            return copyAsset(path.join(briefingFolder, fileName), `media/${targetName}`);
          })
          .filter(Boolean)
      };
    }
  }

  return mapping;
};

const resolveSceneMedia = (scene) => {
  if (!scene.media?.items?.length) return null;
  return {
    fitMode: scene.media.fitMode ?? 'cover',
    items: scene.media.items.map((item, index) => {
      if (/^(https?|file):/i.test(item)) return item;
      const sourcePath = resolveFromOutput(item);
      const extension = path.extname(sourcePath) || '.png';
      return copyAsset(sourcePath, `media/${safeFilePart(scene.id)}-${String(index + 1).padStart(2, '0')}${extension}`);
    }).filter(Boolean)
  };
};

const warnings = [];
const briefingForRender = {
  ...briefing,
  scenes: (briefing.scenes ?? []).map((scene) => {
    const logoSrc = getLogoSrc(scene.outlet?.logoFile);
    const audioSrc = resolveAudioSrc(scene.audio?.src);
    if (scene.outlet?.logoFile && !logoSrc) {
      warnings.push(`Missing logo for ${scene.id}: public/outlet-logos/${scene.outlet.logoFile}`);
    }
    if (scene.audio?.src && !audioSrc) {
      warnings.push(`Missing audio for ${scene.id}: ${scene.audio.src}`);
    }

    return {
      ...scene,
      outlet: scene.outlet ? {...scene.outlet, logoSrc} : scene.outlet,
      audio: scene.audio ? {...scene.audio, src: audioSrc} : scene.audio
    };
  }),
  outro: {
    ...briefing.outro,
    audio: briefing.outro?.audio
      ? {...briefing.outro.audio, src: resolveAudioSrc(briefing.outro.audio.src)}
      : briefing.outro?.audio
  }
};

const mediaBySceneId = Object.fromEntries(
  (briefing.scenes ?? [])
    .map((scene) => [scene.id, resolveSceneMedia(scene)])
    .filter(([, media]) => media)
);

const props = {
  briefing: briefingForRender,
  assets: {
    introAudioSrc: copyAsset(introAudioPath, `audio/${path.basename(introAudioPath)}`),
    frontPageSrc: copyAsset(frontPagePath, `background/${path.basename(frontPagePath)}`),
    mediaByOutletKey: detectOutletMedia(),
    mediaBySceneId
  }
};

for (const fontFile of fontFiles) {
  const copiedFont = copyAsset(path.join(cwd, 'fonts', fontFile), `fonts/${fontFile}`);
  if (!copiedFont) {
    warnings.push(`Missing font: fonts/${fontFile}`);
  }
}

if (!props.assets.introAudioSrc) {
  warnings.push(`Missing intro audio: ${path.relative(cwd, introAudioPath)}`);
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

writeJson(propsPath, props);

const remotionCliPath = path.join(cwd, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const nodeOptions = process.env.NODE_OPTIONS ?? '';
const dnsResultOrderOption = '--dns-result-order=ipv4first';

for (const resolution of renderResolutions) {
  const outputPath = getOutputPath(resolution);
  const resolutionLabel = `${resolution.width}x${resolution.height}${resolution.isDefault ? ' (default)' : ''}`;
  const remotionArgs = [
    remotionCliPath,
    'render',
    path.join('src', 'index.jsx'),
    'ProductionBriefing',
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

  if (args.frames) {
    remotionArgs.push(`--frames=${args.frames}`);
  }

  if (args.log) {
    remotionArgs.push(`--log=${args.log}`);
  }

  // Benchmarked 2026-06-11 on 720x1280: concurrency 12 + gl angle cut frame
  // rendering ~2.4x vs defaults. Pass --gl off to fall back to Chrome's default.
  remotionArgs.push(`--concurrency=${args.concurrency ?? 12}`);

  const glRenderer = args.gl ?? 'angle';
  if (glRenderer !== 'off') {
    remotionArgs.push(`--gl=${glRenderer}`);
  }

  if (args.muted) {
    remotionArgs.push('--muted');
  }

  if (args['jpeg-quality']) {
    remotionArgs.push(`--jpeg-quality=${args['jpeg-quality']}`);
  }

  if (args['x264-preset']) {
    remotionArgs.push(`--x264-preset=${args['x264-preset']}`);
  }

  console.log(`Rendering production briefing MP4 (${resolutionLabel} @ 30fps): ${path.relative(cwd, outputPath)}`);
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
    console.error('Remotion render failed.');
    console.error('If you switched between Windows and WSL, run `npm install` in the environment you are rendering from.');
    process.exit(result.status ?? 1);
  }

  console.log(`Rendered production briefing MP4 at ${outputPath}`);
}
