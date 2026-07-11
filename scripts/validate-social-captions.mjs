import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {OUTLET_YOUTUBE_CHANNELS, missingOutletHashtags, missingYoutubeChannelUrls} from './lib/outlet-youtube-channels.mjs';
import {missingPublishingHashtags} from './lib/social-publishing-hashtags.mjs';

// Validates output/social-captions.json against the day's briefing.json: every
// scene must have a clip entry with a caption + hashtags, and the YouTube
// prompt block must be filled. Non-zero exit on problems. Step 16,
// end of Action A.

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const outputFolder = path.join(briefingFolder, 'output');
const captionsPath = path.join(outputFolder, 'social-captions.json');
const briefingDataPath = path.join(outputFolder, 'briefing.json');

const errors = [];

if (!fs.existsSync(captionsPath)) {
  console.error(`Missing ${path.relative(cwd, captionsPath)} — run the Codex caption step first.`);
  process.exit(1);
}
if (!fs.existsSync(briefingDataPath)) {
  console.error(`Missing ${path.relative(cwd, briefingDataPath)} — run briefing:build:folder first.`);
  process.exit(1);
}

let captions;
try {
  captions = readJson(captionsPath);
} catch (error) {
  console.error(`social-captions.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

const briefing = readJson(briefingDataPath);
const scenes = briefing.scenes ?? [];

const isNonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const validHashtags = (tags) =>
  Array.isArray(tags) && tags.length > 0 && tags.every((tag) => typeof tag === 'string' && /^#\S+$/.test(tag.trim()));

// YouTube block.
const youtube = captions.youtube || {};
if (!isNonEmpty(youtube.title)) errors.push('youtube.title is empty.');
if (!isNonEmpty(youtube.description)) errors.push('youtube.description is empty.');
const missingYoutubeChannels = missingYoutubeChannelUrls(youtube.description, OUTLET_YOUTUBE_CHANNELS);
if (missingYoutubeChannels.length > 0) {
  errors.push(`youtube.description is missing source channel URL(s): ${missingYoutubeChannels.map((channel) => channel.outletName).join(', ')}.`);
}
if (!isNonEmpty(youtube.thumbnailPrompt)) errors.push('youtube.thumbnailPrompt is empty.');
if (!validHashtags(youtube.hashtags)) errors.push('youtube.hashtags must be a non-empty array of #tags (no spaces).');
const missingRequiredPublishingTags = missingPublishingHashtags(youtube.hashtags);
if (missingRequiredPublishingTags.length > 0) {
  errors.push(`youtube.hashtags is missing required publishing tag(s): ${missingRequiredPublishingTags.join(', ')}.`);
}
const missingYoutubeHashtags = missingOutletHashtags(youtube.hashtags, OUTLET_YOUTUBE_CHANNELS);
if (missingYoutubeHashtags.length > 0) {
  errors.push(`youtube.hashtags is missing outlet tag(s): ${missingYoutubeHashtags.map((entry) => `${entry.channel.outletName} (${entry.missing.join(', ')})`).join('; ')}.`);
}

// Clips: one per scene, keyed by sceneId.
const clips = Array.isArray(captions.clips) ? captions.clips : [];
const clipBySceneId = new Map();
for (const clip of clips) {
  if (clip && isNonEmpty(clip.sceneId)) clipBySceneId.set(clip.sceneId.trim(), clip);
}

for (const scene of scenes) {
  const clip = clipBySceneId.get(scene.id);
  if (!clip) {
    errors.push(`No clip entry for scene "${scene.id}".`);
    continue;
  }
  if (!isNonEmpty(clip.outlet)) errors.push(`clip "${scene.id}": outlet is empty.`);
  if (!isNonEmpty(clip.caption)) errors.push(`clip "${scene.id}": caption is empty.`);
  if (!validHashtags(clip.hashtags)) errors.push(`clip "${scene.id}": hashtags must be a non-empty array of #tags (no spaces).`);
}

if (errors.length > 0) {
  console.error(`social-captions.json is not ready (${errors.length} problem(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`social-captions.json is valid: ${clips.length} clip(s) + YouTube prompt for ${scenes.length} scene(s).`);
