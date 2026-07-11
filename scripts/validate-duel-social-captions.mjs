import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {missingOutletHashtags, missingYoutubeChannelUrls, uniqueYoutubeChannelsForOutletNames} from './lib/outlet-youtube-channels.mjs';
import {missingPublishingHashtags} from './lib/social-publishing-hashtags.mjs';

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
const quoteDuelPath = path.join(outputFolder, 'quote-duel.json');

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
const clipByDuelId = new Map();
const captionedDuelIds = new Set();
for (const clip of clips) {
  if (clip && isNonEmpty(clip.duelId) && isNonEmpty(clip.caption)) {
    const duelId = clip.duelId.trim();
    captionedDuelIds.add(duelId);
    clipByDuelId.set(duelId, clip);
  }
}

const errors = [];

// Every manifest duel id must have a captioned clip.
const missingIds = manifestDuelIds.filter((id) => !captionedDuelIds.has(id));
if (missingIds.length > 0) {
  errors.push(`Missing captions for duel id(s): ${missingIds.join(', ')}.`);
}

if (fs.existsSync(quoteDuelPath)) {
  const quoteDuel = readJson(quoteDuelPath);
  const scenes = Array.isArray(quoteDuel.scenes) ? quoteDuel.scenes : [];
  const youtube = captions.youtube || {};
  const missingRequiredPublishingTags = missingPublishingHashtags(youtube.hashtags);
  if (missingRequiredPublishingTags.length > 0) {
    errors.push(`youtube.hashtags is missing required publishing tag(s): ${missingRequiredPublishingTags.join(', ')}.`);
  }
  for (const [index, scene] of scenes.entries()) {
    const duelId = scene.id ?? `duel-${index + 1}`;
    if (!manifestDuelIds.includes(duelId)) continue;
    const expectedChannels = uniqueYoutubeChannelsForOutletNames([scene.left?.outlet, scene.right?.outlet]);
    if (expectedChannels.length === 0) continue;
    const clip = clipByDuelId.get(duelId);
    const missingFromClip = missingYoutubeChannelUrls(clip?.caption, expectedChannels);
    if (missingFromClip.length > 0) {
      errors.push(`${duelId}: caption is missing outlet YouTube URL(s): ${missingFromClip.map((channel) => channel.outletName).join(', ')}.`);
    }
    const missingClipHashtags = missingOutletHashtags(clip?.hashtags, expectedChannels);
    if (missingClipHashtags.length > 0) {
      errors.push(`${duelId}: hashtags is missing outlet tag(s): ${missingClipHashtags.map((entry) => `${entry.channel.outletName} (${entry.missing.join(', ')})`).join('; ')}.`);
    }
    const missingFromYoutube = missingYoutubeChannelUrls(youtube.description, expectedChannels);
    if (missingFromYoutube.length > 0) {
      errors.push(`${duelId}: youtube.description is missing outlet YouTube URL(s): ${missingFromYoutube.map((channel) => channel.outletName).join(', ')}.`);
    }
    const missingYoutubeHashtags = missingOutletHashtags(youtube.hashtags, expectedChannels);
    if (missingYoutubeHashtags.length > 0) {
      errors.push(`${duelId}: youtube.hashtags is missing outlet tag(s): ${missingYoutubeHashtags.map((entry) => `${entry.channel.outletName} (${entry.missing.join(', ')})`).join('; ')}.`);
    }
  }
}

if (errors.length > 0) {
  console.error(`quote-duel-social-captions.json is not ready (${errors.length} problem(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `quote-duel-social-captions.json is valid: ${captionedDuelIds.size} duel caption(s) validated against ${manifestDuelIds.length} manifest duel(s).`,
);
