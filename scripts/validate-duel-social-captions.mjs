import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';

// Validates output/quote-duel-social-captions.json against audio/quote-duel-manifest.json:
// every duel id in audioByDuel must have a clip entry with a non-empty caption.
// Non-zero exit on problems. Step for duel social flow.

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const audioFolder = path.join(briefingFolder, 'audio');
const outputFolder = path.join(briefingFolder, 'output');
const manifestPath = path.join(audioFolder, 'quote-duel-manifest.json');
const captionsPath = path.join(outputFolder, 'quote-duel-social-captions.json');

if (!fs.existsSync(manifestPath)) {
  console.error(`Missing ${path.relative(cwd, manifestPath)} — run briefing:duel:audio first.`);
  process.exit(1);
}

if (!fs.existsSync(captionsPath)) {
  console.error(`Missing ${path.relative(cwd, captionsPath)} — run the Codex duel caption step first.`);
  process.exit(1);
}

let manifest;
try {
  manifest = readJson(manifestPath);
} catch (error) {
  console.error(`quote-duel-manifest.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

let captions;
try {
  captions = readJson(captionsPath);
} catch (error) {
  console.error(`quote-duel-social-captions.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

const isNonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

// Collect duel ids from the manifest's audioByDuel keys.
const audioByDuel = manifest.audioByDuel ?? {};
const manifestDuelIds = Object.keys(audioByDuel);

// Build a set of duelIds that have a non-empty caption in the captions clips array.
const clips = Array.isArray(captions.clips) ? captions.clips : [];
const captionedDuelIds = new Set();
for (const clip of clips) {
  if (clip && isNonEmpty(clip.duelId) && isNonEmpty(clip.caption)) {
    captionedDuelIds.add(clip.duelId.trim());
  }
}

const errors = [];

// Every manifest duel id must have a captioned clip.
const missingIds = manifestDuelIds.filter((id) => !captionedDuelIds.has(id));
if (missingIds.length > 0) {
  errors.push(`Missing captions for duel id(s): ${missingIds.join(', ')}.`);
}

if (errors.length > 0) {
  console.error(`quote-duel-social-captions.json is not ready (${errors.length} problem(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `quote-duel-social-captions.json is valid: ${captionedDuelIds.size} duel caption(s) validated against ${manifestDuelIds.length} manifest duel(s).`,
);
