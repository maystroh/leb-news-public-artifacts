import fs from 'node:fs';
import path from 'node:path';

import {encodeBase64, parseCliArgs, readJson, replaceScriptTagContents} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const dataPath = args.data ? path.resolve(cwd, args.data) : path.join(cwd, 'src', 'data', 'briefing.json');
const templatePath = args.template ? path.resolve(cwd, args.template) : path.join(cwd, 'templates', 'radar-beirut-briefing-template.html');
const htmlPath = args.output ? path.resolve(cwd, args.output) : path.join(cwd, 'radar-beirut-briefing.html');
const mediaDir = args['media-dir'] ? path.resolve(cwd, args['media-dir']) : path.dirname(htmlPath);
const introAudioPath = path.join(cwd, 'templates', 'radar-beirut-into-audio-new.mp3');

if (!fs.existsSync(dataPath)) {
  console.error(`Missing generated briefing data: ${dataPath}`);
  console.error('Run `node ./scripts/prepare-briefing.mjs` first.');
  process.exit(1);
}

const briefingData = readJson(dataPath);
const outputDir = path.dirname(htmlPath);
const template = fs.readFileSync(templatePath, 'utf8');
const toHtmlRelativePath = (assetPath) => {
  const relativePath = path.relative(outputDir, assetPath).replace(/\\/g, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
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
    .readdirSync(mediaDir)
    .filter((entry) => /\.(png|jpe?g|webp)$/i.test(entry));

  const mapping = {};

  for (const scene of briefingData.scenes ?? []) {
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
        items: chosenFiles.map((fileName) => {
          return toHtmlRelativePath(path.join(mediaDir, fileName));
        })
      };
    }
  }

  return mapping;
};

const htmlWithData = replaceScriptTagContents(template, 'briefing-data', encodeBase64(JSON.stringify(briefingData)));
const html = htmlWithData
  .replace('__OUTLET_MEDIA_BY_OUTLET_KEY__', JSON.stringify(detectOutletMedia(), null, 2))
  .replace('__INTRO_AUDIO_SRC__', fs.existsSync(introAudioPath) ? toHtmlRelativePath(introAudioPath) : '');

fs.writeFileSync(htmlPath, html);
console.log(`Built full editorial HTML at ${htmlPath}`);
