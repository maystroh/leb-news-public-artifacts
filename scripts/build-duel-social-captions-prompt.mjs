import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';

// Writes output/quote-duel-social-captions-prompt.md: a Codex prompt that turns
// the day's duels into output/quote-duel-social-captions.json with one Instagram
// caption block PER DUEL CLIP (keyed by duelId — each atomic short is posted
// independently) plus a YouTube description + cover prompts for the full reel.
//
// Kept separate from the sceneId-keyed briefing captions (build-social-captions-
// prompt.mjs) so the two video products never collide on schema (Codex#4). The
// clip plan comes from the duel split manifest when present, else it is derived
// straight from quote-duel.json (so captions can run before the split — spec [5]).

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder ?? `briefings/${args.date}`);
const date = path.basename(briefingFolder);
const outputFolder = path.join(briefingFolder, 'output');
const quoteDuelPath = path.join(outputFolder, 'quote-duel.json');

if (!fs.existsSync(quoteDuelPath)) {
  throw new Error(`Missing ${path.relative(cwd, quoteDuelPath)} — run briefing:build:folder first.`);
}

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const duel = readJson(quoteDuelPath);
const scenes = duel.scenes ?? [];
if (!scenes.length) {
  throw new Error(`No duels found in ${path.relative(cwd, quoteDuelPath)}`);
}

// Clip filename per duelId: prefer the split manifest, else derive duel-NN.mp4.
const manifestPath = path.join(outputFolder, 'duel-videos', 'manifest.json');
const clipByDuelId = new Map();
const skippedDuelIds = new Set();
if (fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  for (const d of manifest.duels ?? []) clipByDuelId.set(d.duelId, d.fileName);
  for (const s of manifest.skipped ?? []) skippedDuelIds.add(s.duelId);
}

const duelBlocks = scenes
  .map((scene, index) => {
    const duelId = scene.id ?? `duel-${index + 1}`;
    if (skippedDuelIds.has(duelId)) return null;
    const clip = clipByDuelId.get(duelId) || `duel-${String(index + 1).padStart(2, '0')}.mp4`;
    return [
      `- duelId: ${duelId}`,
      `  clip: ${clip}`,
      `  event: ${normalize(scene.eventLabel) || '(none)'}`,
      `  the clash (vs): ${normalize(scene.contrastLabel) || '(none)'}`,
      `  left: ${normalize(scene.left?.outlet)} — "${normalize(scene.left?.quote)}" (${normalize(scene.left?.stance)})`,
      `  right: ${normalize(scene.right?.outlet)} — "${normalize(scene.right?.quote)}" (${normalize(scene.right?.stance)})`,
      `  summary: ${normalize(scene.summary) || '(none)'}`
    ].join('\n');
  })
  .filter(Boolean);

const captionsPath = path.join(outputFolder, 'quote-duel-social-captions.json');
const coverPath = path.join(outputFolder, 'quote-duel-reel-cover.png');

const prompt = [
  `# Quote Duel social captions — Radar Beirut — ${date}`,
  '',
  'You are writing social-media copy for a series of short Arabic "quote duel" videos.',
  'Each duel is one standalone vertical short: two Lebanese outlets clashing on the same event.',
  `Write the file \`${path.relative(cwd, captionsPath).replace(/\\/g, '/')}\` as JSON with exactly this shape:`,
  '',
  '```json',
  '{',
  `  "date": "${date}",`,
  '  "generatedAt": "<current ISO timestamp>",',
  '  "youtube": {',
  '    "title": "string — punchy Arabic title for the full quote-duel reel",',
  '    "description": "string — 2–3 short paragraphs framing the day as a series of clashes",',
  '    "thumbnailPrompt": "string — prompt for a 16:9 YouTube thumbnail of the duel theme",',
  '    "hashtags": ["#لبنان", "#Lebanon", "..."]',
  '  },',
  '  "instagram": {',
  `    "reelCoverPrompt": "string — prompt for a 9:16 cover; tell the user to save it as ${path.relative(cwd, coverPath).replace(/\\/g, '/')}"`,
  '  },',
  '  "clips": [',
  '    {',
  '      "duelId": "duel-1",',
  '      "caption": "1–3 line Instagram body that leads with the clash hook",',
  '      "hashtags": ["#...", "#..."]',
  '    }',
  '  ]',
  '}',
  '```',
  '',
  '## Rules',
  '- Output ONE clips entry per duelId listed below, keyed by duelId. Do not invent or skip duelIds.',
  '- `caption`: Arabic. LEAD WITH THE CLASH — "صحيفة X قالت كذا، والأخبار قالت العكس" energy. One hook line, then',
  '  one line of context. Tight enough to read in the first 2 seconds of a Reel.',
  '- `hashtags`: 8–15, MIX Arabic + English/transliterated. Include both outlets + the topic + a few high-reach tags',
  '  (#لبنان #Lebanon #Beirut #بيروت). Every tag starts with `#`, no spaces.',
  '- `youtube.description`: frame the full reel as the day’s sharpest clashes; one line per duel.',
  '- `youtube.thumbnailPrompt` / `instagram.reelCoverPrompt`: practical prompts to paste into ChatGPT. Request the right',
  '  aspect ratio (16:9 / 9:16), preserve the Radar Beirut radar/editorial look, bold readable Arabic title, leave Instagram',
  '  safe margins on the cover, and do not ask for exact outlet logos unless source assets are provided.',
  '- Write ONLY the JSON file. Do not print commentary.',
  '',
  '## Duels (one clip each)',
  '',
  ...duelBlocks,
  ''
].join('\n');

fs.mkdirSync(outputFolder, {recursive: true});
const promptPath = path.join(outputFolder, 'quote-duel-social-captions-prompt.md');
fs.writeFileSync(promptPath, prompt);

console.log(`Wrote duel social captions prompt: ${path.relative(cwd, promptPath)}`);
console.log(fs.existsSync(manifestPath)
  ? `Clip plan from split manifest: ${path.relative(cwd, manifestPath)}`
  : 'Clip plan derived from quote-duel.json (split not run yet).');
console.log(`Codex should write: ${path.relative(cwd, captionsPath)}`);
