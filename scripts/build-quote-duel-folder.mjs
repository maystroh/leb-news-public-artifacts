// Focused, quiet rebuild of ONLY the Quote Duel outputs for a date — used by the
// duel narration step so it doesn't regenerate all four formats (full editorial,
// fault line, keyword radar) like briefing:build:folder does.
//
// Reads the upstream quote-duel.json, injects the default hook texts, re-applies
// the audio-driven durations from timingConfig.quoteDuel, writes
// output/quote-duel.json, and rebuilds the combined Quote Duel HTML plus
// top-three standalone clash review HTML files.

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';
import {ensureDuelHooks} from './lib/duel-hooks.mjs';

const INTRO_TEXT_REVEAL_LEAD_SECONDS = 3;
const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  console.error('Missing folder. Usage: npm run briefing:duel:build -- --folder briefings/YYYY-MM-DD');
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
const upstreamPath = path.join(briefingFolder, 'quote-duel.json');
const outputPath = path.join(outputFolder, 'quote-duel.json');
const htmlPath = path.join(outputFolder, 'radar-beirut-quote-duel.html');
const timingConfigPath = path.join(outputFolder, 'timing-config.json');

if (!fs.existsSync(upstreamPath)) {
  console.error(`Missing upstream quote duel data: ${path.relative(cwd, upstreamPath)}`);
  process.exit(1);
}

const quoteDuel = readJson(upstreamPath);
quoteDuel.hooks = ensureDuelHooks(quoteDuel);
delete quoteDuel.hook;

// Apply timingConfig.quoteDuel overrides (mirrors build-briefing-folder).
const timingConfig = fs.existsSync(timingConfigPath) ? readJson(timingConfigPath) : {};
const duelTiming = timingConfig.quoteDuel ?? {};
if (quoteDuel.intro) {
  if (typeof duelTiming.introSeconds === 'number') quoteDuel.intro.durationSeconds = duelTiming.introSeconds;
  if (typeof duelTiming.introTextRevealSeconds === 'number') {
    quoteDuel.intro.textRevealSeconds = duelTiming.introTextRevealSeconds;
  } else if (typeof quoteDuel.intro.durationSeconds === 'number') {
    quoteDuel.intro.textRevealSeconds = Math.max(0, quoteDuel.intro.durationSeconds - INTRO_TEXT_REVEAL_LEAD_SECONDS);
  }
}
if (typeof duelTiming.outroSeconds === 'number' && quoteDuel.outro) {
  quoteDuel.outro.durationSeconds = duelTiming.outroSeconds;
}
const sceneTiming = duelTiming.scenes ?? {};
quoteDuel.scenes = (quoteDuel.scenes || []).map((scene) => ({
  ...scene,
  durationSeconds: typeof sceneTiming[scene.id] === 'number' ? sceneTiming[scene.id] : scene.durationSeconds
}));

fs.mkdirSync(outputFolder, {recursive: true});
writeJson(outputPath, quoteDuel);

const result = spawnSync(
  process.execPath,
  [path.join('scripts', 'build-quote-duel-html.mjs'), '--data', outputPath, '--output', htmlPath],
  {cwd, stdio: 'inherit'}
);
if (result.status !== 0) process.exit(result.status ?? 1);

// Rewrite asset paths so the HTML resolves logos/fonts from the output folder.
const relativeRoot = path.relative(path.dirname(htmlPath), cwd).replace(/\\/g, '/');
const rootPrefix = relativeRoot ? `${relativeRoot}/` : '';
const html = fs.readFileSync(htmlPath, 'utf8')
  .replaceAll('./public/outlet-logos/', `./${rootPrefix}public/outlet-logos/`)
  .replaceAll('./fonts/', `./${rootPrefix}fonts/`)
  .replaceAll('./logos/', `./${rootPrefix}logos/`);
fs.writeFileSync(htmlPath, html);

console.log(`Built quote duel outputs (JSON + HTML) in ${path.relative(cwd, outputFolder)}`);
