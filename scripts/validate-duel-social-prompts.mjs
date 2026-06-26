import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder ?? `briefings/${args.date}`);
const outputFolder = path.join(briefingFolder, 'output');
const quoteDuelPath = path.join(outputFolder, 'quote-duel.json');
const promptsPath = path.join(outputFolder, 'quote-duel-social-prompts.json');

if (!fs.existsSync(quoteDuelPath)) {
  console.error(`Missing ${path.relative(cwd, quoteDuelPath)} - run the Quote Duel build step first.`);
  process.exit(1);
}

if (!fs.existsSync(promptsPath)) {
  console.error(`Missing ${path.relative(cwd, promptsPath)} - run the Quote Duel social prompts step first.`);
  process.exit(1);
}

const isNonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const validHashtags = (tags) =>
  Array.isArray(tags) && tags.length > 0 && tags.every((tag) => typeof tag === 'string' && /^#\S+$/.test(tag.trim()));

let duel;
let prompts;
try {
  duel = readJson(quoteDuelPath);
  prompts = readJson(promptsPath);
} catch (error) {
  console.error(`Invalid JSON: ${error.message}`);
  process.exit(1);
}

const expectedDuelIds = (duel.scenes ?? []).map((scene, index) => scene.id ?? `duel-${index + 1}`);
const promptByDuelId = new Map();
for (const entry of prompts.duels ?? []) {
  if (isNonEmpty(entry?.duelId)) promptByDuelId.set(entry.duelId.trim(), entry);
}

const errors = [];
if (prompts.draft === true) {
  errors.push('quote-duel-social-prompts.json is still a seeded draft; run the Codex generation action.');
}
for (const duelId of expectedDuelIds) {
  const entry = promptByDuelId.get(duelId);
  if (!entry) {
    errors.push(`Missing prompt entry for ${duelId}.`);
    continue;
  }
  if (!isNonEmpty(entry.title)) errors.push(`${duelId}: title is empty.`);
  if (!isNonEmpty(entry.description)) errors.push(`${duelId}: description is empty.`);
  if (!validHashtags(entry.hashtags)) errors.push(`${duelId}: hashtags must be a non-empty array of #tags.`);
  if (!isNonEmpty(entry.reelCoverPrompt)) errors.push(`${duelId}: reelCoverPrompt is empty.`);
  if (isNonEmpty(entry.reelCoverPrompt) && !/9:16/.test(entry.reelCoverPrompt)) {
    errors.push(`${duelId}: reelCoverPrompt should explicitly request 9:16.`);
  }
}

if (errors.length > 0) {
  console.error(`quote-duel-social-prompts.json is not ready (${errors.length} problem(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`quote-duel-social-prompts.json is valid: ${expectedDuelIds.length} duel prompt(s).`);
