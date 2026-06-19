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
const instagramPromptPath = path.join(outputFolder, 'instagram-reel-cover-prompt.md');

if (!fs.existsSync(captionsPath)) {
  throw new Error(`Missing ${path.relative(cwd, captionsPath)} — generate social captions first.`);
}

const captions = readJson(captionsPath);
const youtubePrompt = captions?.youtube?.thumbnailPrompt;
const instagramPrompt = captions?.instagram?.reelCoverPrompt;

if (typeof youtubePrompt !== 'string' || youtubePrompt.trim().length === 0) {
  throw new Error('social-captions.json is missing youtube.thumbnailPrompt.');
}
if (typeof instagramPrompt !== 'string' || instagramPrompt.trim().length === 0) {
  throw new Error('social-captions.json is missing instagram.reelCoverPrompt.');
}

const date = path.basename(briefingFolder);
const youtubeBody = [`# YouTube thumbnail prompt — ${date}`, '', youtubePrompt.trim(), ''].join('\n');
const instagramBody = [`# Instagram Reel cover prompt — ${date}`, '', instagramPrompt.trim(), ''].join('\n');

fs.mkdirSync(outputFolder, {recursive: true});
fs.writeFileSync(youtubePromptPath, youtubeBody);
fs.writeFileSync(instagramPromptPath, instagramBody);

console.log(`Wrote YouTube thumbnail prompt: ${path.relative(cwd, youtubePromptPath)}`);
console.log(`Wrote Instagram Reel cover prompt: ${path.relative(cwd, instagramPromptPath)}`);
