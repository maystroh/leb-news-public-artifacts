import fs from 'node:fs';
import path from 'node:path';

import {
  decodeBase64TemplateSnippet,
  encodeBase64,
  parseCliArgs,
  readJson,
  replaceScriptTagContents
} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const dataPath = args.data ? path.resolve(cwd, args.data) : path.join(cwd, 'src', 'data', 'quote-duel.json');
const templatePath = args.template ? path.resolve(cwd, args.template) : path.join(cwd, 'templates', 'radar-beirut-quote-duel-template.html');
const htmlPath = args.output ? path.resolve(cwd, args.output) : path.join(cwd, 'radar-beirut-quote-duel.html');
const introAudioPath = path.join(cwd, 'templates', 'radar-beirut-into-audio-new.mp3');

if (!fs.existsSync(dataPath)) {
  console.error(`Missing generated quote duel data: ${dataPath}`);
  process.exit(1);
}

const quoteDuelData = readJson(dataPath);
const encodedData = encodeBase64(JSON.stringify(quoteDuelData));
const template = fs.readFileSync(templatePath, 'utf8');
const outputDir = path.dirname(htmlPath);
const toHtmlRelativePath = (assetPath) => {
  const relativePath = path.relative(outputDir, assetPath).replace(/\\/g, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};
const introAudioSrc = fs.existsSync(introAudioPath) ? toHtmlRelativePath(introAudioPath) : '';

const pattern = /<script>\s*const BRIEFING = \{[\s\S]*?\n\s*const PLAYBACK_CONFIG = \{/;
let html;

if (pattern.test(template)) {
  const replacement = `<script id="quote-duel-data" type="text/plain">${encodedData}</script>
<script>
${decodeBase64TemplateSnippet('quote-duel-data')}  const PLAYBACK_CONFIG = {`;

  html = template.replace(pattern, replacement);
} else {
  html = replaceScriptTagContents(template, 'quote-duel-data', encodedData);
}

html = html.replace('__INTRO_AUDIO_SRC__', introAudioSrc);
fs.writeFileSync(htmlPath, html);
console.log(`Built quote duel HTML at ${htmlPath}`);
