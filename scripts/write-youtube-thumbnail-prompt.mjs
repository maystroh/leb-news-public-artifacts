import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const outputFolder = path.join(briefingFolder, 'output');
const captionsPath = path.join(outputFolder, 'social-captions.json');
const youtubePromptPath = path.join(outputFolder, 'youtube-thumbnail-prompt.md');

if (!fs.existsSync(captionsPath)) {
  throw new Error(`Missing ${path.relative(cwd, captionsPath)} — generate social captions first.`);
}

const captions = readJson(captionsPath);
const youtubePrompt = captions?.youtube?.thumbnailPrompt;

if (typeof youtubePrompt !== 'string' || youtubePrompt.trim().length === 0) {
  throw new Error('social-captions.json is missing youtube.thumbnailPrompt.');
}

const date = path.basename(briefingFolder);
const youtubeBody = [`# YouTube thumbnail prompt — ${date}`, '', youtubePrompt.trim(), ''].join('\n');

fs.mkdirSync(outputFolder, {recursive: true});
fs.writeFileSync(youtubePromptPath, youtubeBody);

console.log(`Wrote YouTube thumbnail prompt: ${path.relative(cwd, youtubePromptPath)}`);
