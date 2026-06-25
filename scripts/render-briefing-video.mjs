import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';
import {createAssetResolver} from './lib/remotion-assets.mjs';

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

// Hook variants mirror the HTML A/B builds: same briefing and duration, one
// attention hook enabled in the Remotion composition per render.
const SUPPORTED_HOOK_VARIANTS = new Set(['captions', 'stamps']);
const hookVariant = args.variant ? String(args.variant).trim().toLowerCase() : 'default';
if (hookVariant !== 'default' && !SUPPORTED_HOOK_VARIANTS.has(hookVariant)) {
  console.error(`Unknown --variant "${args.variant}". Use one of: default, ${[...SUPPORTED_HOOK_VARIANTS].join(', ')}.`);
  process.exit(1);
}
const variantSuffix = hookVariant === 'default' ? '' : `-hook-${hookVariant}`;

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
    return path.join(outputFolder, `radar-beirut-briefing${variantSuffix}-${resolution.width}x${resolution.height}.mp4`);
  }
  return path.join(outputFolder, `radar-beirut-briefing${variantSuffix}.mp4`);
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
const {safeFilePart, resolveFromOutput, copyAsset, resolveAudioSrc, getLogoSrc} = createAssetResolver({
  outputFolder,
  assetsFolder: remotionAssetsFolder,
  cwd
});

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

// Same sceneId → terms mapping the HTML builder injects for the stamps hook.
const collectKeywordsBySceneId = () => {
  const keywordsPath = path.join(outputFolder, 'keyword-radar.json');
  if (!fs.existsSync(keywordsPath)) {
    if (hookVariant === 'stamps') {
      warnings.push(`Missing ${path.relative(cwd, keywordsPath)} — stamps variant renders without keyword chips.`);
    }
    return {};
  }
  try {
    const keywordData = readJson(keywordsPath);
    const mapping = {};
    for (const entry of keywordData.entries ?? []) {
      if (!entry.sceneId || !Array.isArray(entry.terms)) continue;
      mapping[entry.sceneId] = entry.terms
        .filter((term) => term && term.text)
        .map((term) => ({text: term.text, weight: term.weight ?? 0.5}));
    }
    return mapping;
  } catch (error) {
    warnings.push(`Could not parse ${path.relative(cwd, keywordsPath)}: ${error.message}`);
    return {};
  }
};

const props = {
  briefing: briefingForRender,
  assets: {
    introAudioSrc: copyAsset(introAudioPath, `audio/${path.basename(introAudioPath)}`),
    frontPageSrc: copyAsset(frontPagePath, `background/${path.basename(frontPagePath)}`),
    mediaByOutletKey: detectOutletMedia(),
    mediaBySceneId
  },
  hooks: {
    variant: hookVariant,
    keywordsBySceneId: hookVariant === 'stamps' ? collectKeywordsBySceneId() : {}
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

  // Platform defaults: Windows/macOS use ANGLE with the headless shell;
  // Linux GPU rendering needs full Chrome (the headless shell has no GPU
  // support) with an EGL backend. Override with --gl / --chrome-mode.
  const isLinux = process.platform === 'linux';
  const glRenderer = args.gl ?? (isLinux ? 'angle-egl' : 'angle');
  if (glRenderer !== 'off') {
    remotionArgs.push(`--gl=${glRenderer}`);
  }

  const chromeMode = args['chrome-mode'] ?? (isLinux && glRenderer !== 'off' ? 'chrome-for-testing' : undefined);
  if (chromeMode) {
    remotionArgs.push(`--chrome-mode=${chromeMode}`);
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

  const variantLabel = hookVariant === 'default' ? '' : `, hook: ${hookVariant}`;
  console.log(`Rendering production briefing MP4 (${resolutionLabel} @ 30fps${variantLabel}): ${path.relative(cwd, outputPath)}`);
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
