import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder && !args.date) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder ?? `briefings/${args.date}`);
const date = path.basename(briefingFolder);
const outputFolder = path.join(briefingFolder, 'output');
const quoteDuelPath = path.join(outputFolder, 'quote-duel.json');
const promptsPath = path.join(outputFolder, 'quote-duel-social-prompts.json');

if (!fs.existsSync(quoteDuelPath)) {
  throw new Error(`Missing ${path.relative(cwd, quoteDuelPath)} - run the Quote Duel build step first.`);
}

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const padTwo = (value) => String(value).padStart(2, '0');
const duel = readJson(quoteDuelPath);
const scenes = duel.scenes ?? [];

if (!scenes.length) {
  throw new Error(`No duels found in ${path.relative(cwd, quoteDuelPath)}`);
}

const duelBlocks = scenes.map((scene, index) => {
  const duelId = scene.id ?? `duel-${index + 1}`;
  const coverPath = path.join(outputFolder, `quote-duel-reel-cover-${padTwo(index + 1)}.png`);
  return [
    `- duelId: ${duelId}`,
    `  coverPath: ${path.relative(cwd, coverPath).replace(/\\/g, '/')}`,
    `  event: ${normalize(scene.eventLabel) || '(none)'}`,
    `  contrast: ${normalize(scene.contrastLabel) || '(none)'}`,
    `  left: ${normalize(scene.left?.outlet)} - "${normalize(scene.left?.quote)}" (${normalize(scene.left?.stance)})`,
    `  right: ${normalize(scene.right?.outlet)} - "${normalize(scene.right?.quote)}" (${normalize(scene.right?.stance)})`,
    `  summary: ${normalize(scene.summary) || '(none)'}`
  ].join('\n');
});

const draft = {
  date,
  generatedAt: new Date().toISOString(),
  draft: true,
  duels: scenes.map((scene, index) => {
    const duelId = scene.id ?? `duel-${index + 1}`;
    const coverPath = path.join(outputFolder, `quote-duel-reel-cover-${padTwo(index + 1)}.png`);
    return {
      duelId,
      title: '',
      description: '',
      hashtags: [],
      reelCoverPrompt: `Create a 9:16 social media reel/short cover for Radar Beirut and save it as ${path.relative(cwd, coverPath).replace(/\\/g, '/')}.`
    };
  })
};

const prompt = [
  `# Quote Duel social text + cover prompts - Radar Beirut - ${date}`,
  '',
  'You are preparing platform-neutral publishing assets for short vertical Quote Duel videos.',
  'These are for Instagram Reels, YouTube Shorts, TikTok, and similar social video feeds.',
  `Write the file \`${path.relative(cwd, promptsPath).replace(/\\/g, '/')}\` as JSON with exactly this shape:`,
  '',
  '```json',
  '{',
  `  "date": "${date}",`,
  '  "generatedAt": "<current ISO timestamp>",',
  '  "duels": [',
  '    {',
  '      "duelId": "duel-1",',
  '      "title": "short Arabic title for the duel",',
  '      "description": "2-4 Arabic lines explaining what this duel is about for social publishing",',
  '      "hashtags": ["#...", "#..."],',
  '      "reelCoverPrompt": "full image-generation prompt for this specific duel cover"',
  '    }',
  '  ]',
  '}',
  '```',
  '',
  '## Rules',
  '- Output ONE entry per duelId listed below. Do not invent, skip, or rename duelIds.',
  '- This is NOT Instagram-only. Use platform-neutral language: social reel, short video, vertical cover, Reels/Shorts/TikTok.',
  '- `title`: Arabic, sharp, 3-7 words. It should name the argument, not just repeat "ثنائية الاقتباسات".',
  '- `description`: Arabic, useful as publishing context. Say what the duel is about and why the two sides conflict.',
  '- `hashtags`: 8-15 mixed Arabic + English/transliterated tags. Every tag starts with `#` and has no spaces.',
  '- `reelCoverPrompt`: write a FULL standalone image prompt for this exact duel. It must include:',
  '  - Create a 9:16 social media reel/short cover for Radar Beirut.',
  '  - Save path exactly as the `coverPath` shown for that duel.',
  '  - Preserve the Radar Beirut radar/editorial look: dark Beirut map background, orange radar sweep, split quote-duel layout, sharp editorial contrast.',
  '  - Use bold readable Arabic title text from `title` plus a short visual hint of the specific disagreement.',
  '  - Include the two outlet names as text only if useful; do not ask for exact outlet logos unless source assets are provided.',
  '  - Keep all title and key visual elements inside safe margins with generous top and bottom padding.',
  '  - End with one sentence that states the exact duel topic in plain Arabic.',
  '- Write ONLY the JSON file. Do not print commentary.',
  '',
  '## Duels',
  '',
  ...duelBlocks,
  ''
].join('\n');

fs.mkdirSync(outputFolder, {recursive: true});
const promptPath = path.join(outputFolder, 'quote-duel-social-prompts-prompt.md');
fs.writeFileSync(promptPath, prompt);
fs.writeFileSync(promptsPath, JSON.stringify(draft, null, 2));

console.log(`Wrote duel social prompts prompt: ${path.relative(cwd, promptPath)}`);
console.log(`Seeded draft social prompts JSON: ${path.relative(cwd, promptsPath)}`);
console.log(`Codex should write: ${path.relative(cwd, promptsPath)}`);
