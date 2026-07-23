import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {OUTLET_YOUTUBE_CHANNELS, missingOutletHashtags, missingYoutubeChannelUrls} from './lib/outlet-youtube-channels.mjs';
import {RADAR_BEIRUT_X_ACCOUNT, findOutletXAccountForOutlet, missingXHandles} from './lib/outlet-x-accounts.mjs';
import {missingPublishingHashtags} from './lib/social-publishing-hashtags.mjs';

// Validates output/social-captions.json against the day's briefing.json: every
// scene must have a clip entry with a caption + hashtags, and the YouTube/X
// prompt blocks must be filled. Non-zero exit on problems. Step 16, end of Action A.

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
const requiredXAccounts = [];
const seenXHandles = new Set();
for (const scene of scenes) {
  const account = findOutletXAccountForOutlet(scene.outlet);
  if (!account || seenXHandles.has(account.handle)) continue;
  seenXHandles.add(account.handle);
  requiredXAccounts.push(account);
}

const isNonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const validHashtags = (tags) =>
  Array.isArray(tags) && tags.length > 0 && tags.every((tag) => typeof tag === 'string' && /^#\S+$/.test(tag.trim()));
const charLength = (value) => Array.from(String(value || '')).length;
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

// X block: daily thread — hook → 1–3 faultline posts → question (poll) → link.
const x = captions.x || {};
if (x.accountUrl !== RADAR_BEIRUT_X_ACCOUNT.url) errors.push(`x.accountUrl must be ${RADAR_BEIRUT_X_ACCOUNT.url}.`);
const xPosts = Array.isArray(x.posts) ? x.posts : [];
if (xPosts.length < 4 || xPosts.length > 6) {
  errors.push('x.posts must be a thread of 4–6 posts: hook, 1–3 faultline posts, question, link.');
} else {
  const hookPost = xPosts[0];
  const questionPost = xPosts[xPosts.length - 2];
  const linkPost = xPosts[xPosts.length - 1];
  const faultlinePosts = xPosts.slice(1, -2);

  if (hookPost?.id !== 'hook') errors.push('x.posts[0].id must be "hook".');
  if (questionPost?.id !== 'question') errors.push('x.posts second-to-last id must be "question".');
  if (linkPost?.id !== 'link') errors.push('x.posts last id must be "link".');
  faultlinePosts.forEach((post, index) => {
    if (post?.id !== `faultline-${index + 1}`) errors.push(`x.posts[${index + 1}].id must be "faultline-${index + 1}".`);
  });

  // X counts any URL as 23 characters; measure the link post with the placeholder resolved.
  const measured = (post) => charLength(String(post?.text || '').trim().replace(/\{YOUTUBE_LINK\}/g, 'x'.repeat(23)));
  for (const post of xPosts) {
    const text = String(post?.text || '').trim();
    if (!isNonEmpty(text)) {
      errors.push(`x post "${post?.id || '?'}" text is empty.`);
      continue;
    }
    if (measured(post) > 275) errors.push(`x post "${post.id}" is ${measured(post)} characters; max is 275.`);
    if (post.id !== 'link' && /https?:\/\//.test(text)) errors.push(`x post "${post.id}" must not contain links.`);
    if (post.id !== 'hook' && /#\S+/.test(text)) errors.push(`x post "${post.id}" must not contain hashtags (hashtags live in the hook post only).`);
    if (text.includes(RADAR_BEIRUT_X_ACCOUNT.handle)) errors.push(`x post "${post.id}" must not include the Radar Beirut handle.`);
  }

  // Hook: brand marker + exactly two hashtags (#لبنان + one topic tag), no handles.
  const hookText = String(hookPost?.text || '').trim();
  if (isNonEmpty(hookText)) {
    if (!hookText.startsWith('الصحافة اليوم')) errors.push('x hook post must start with "الصحافة اليوم".');
    const hookTags = hookText.match(/#[^\s#]+/g) || [];
    if (hookTags.length !== 2) errors.push(`x hook post must end with exactly 2 hashtags (found ${hookTags.length}).`);
    if (!hookTags.includes('#لبنان')) errors.push('x hook post hashtags must include #لبنان.');
    if (!/#\S+\s*$/.test(hookText)) errors.push('x hook post must end with its hashtags.');
    const handlesInHook = requiredXAccounts.filter((account) => hookText.includes(account.handle));
    if (handlesInHook.length > 0) {
      errors.push(`x hook post must not include outlet handle(s): ${handlesInHook.map((account) => account.handle).join(', ')}.`);
    }
  }

  // Faultline posts: every scene outlet handle exactly once across them, never at post start.
  const faultlineText = faultlinePosts.map((post) => String(post?.text || '')).join('\n');
  const missingHandles = missingXHandles(faultlineText, requiredXAccounts);
  if (missingHandles.length > 0) {
    errors.push(`x faultline posts are missing outlet X handle(s): ${missingHandles.map((account) => account.handle).join(', ')}.`);
  }
  for (const account of requiredXAccounts) {
    const count = (faultlineText.match(new RegExp(escapeRegExp(account.handle), 'g')) || []).length;
    if (count > 1) errors.push(`x faultline posts include ${account.handle} more than once.`);
  }
  for (const post of faultlinePosts) {
    if (String(post?.text || '').trim().startsWith('@')) {
      errors.push(`x post "${post.id}" must not start with an @handle (X would treat it as a bare reply).`);
    }
  }
  const handlesOutsideFaultline = requiredXAccounts.filter((account) =>
    [questionPost, linkPost].some((post) => String(post?.text || '').includes(account.handle)));
  if (handlesOutsideFaultline.length > 0) {
    errors.push(`outlet handle(s) outside the faultline posts: ${handlesOutsideFaultline.map((account) => account.handle).join(', ')}.`);
  }

  // Question post: must carry 2–4 poll options, each within X's 25-char poll limit.
  const poll = Array.isArray(questionPost?.poll) ? questionPost.poll : null;
  if (!poll || poll.length < 2 || poll.length > 4) {
    errors.push('x question post must include a poll array with 2–4 stance options.');
  } else {
    poll.forEach((option, index) => {
      const optionText = String(option || '').trim();
      if (!optionText) errors.push(`x question post poll option ${index + 1} is empty.`);
      else if (charLength(optionText) > 25) errors.push(`x question post poll option ${index + 1} is ${charLength(optionText)} characters; X limit is 25.`);
    });
  }

  // Link post: closing reply carrying the YouTube URL placeholder.
  if (isNonEmpty(String(linkPost?.text || '')) && !String(linkPost.text).includes('{YOUTUBE_LINK}')) {
    errors.push('x link post must contain the {YOUTUBE_LINK} placeholder.');
  }
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
