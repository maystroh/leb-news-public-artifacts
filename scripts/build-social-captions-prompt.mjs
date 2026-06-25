import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';

// Writes output/social-captions-prompt.md: a Codex prompt that turns the day's
// briefing + keyword data into output/social-captions.json (per-clip Instagram
// captions/hashtags + one YouTube description + social asset prompts). Step 16,
// Action A.

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const date = path.basename(briefingFolder);
const outputFolder = path.join(briefingFolder, 'output');
const briefingDataPath = path.join(outputFolder, 'briefing.json');

if (!fs.existsSync(briefingDataPath)) {
  throw new Error(`Missing ${path.relative(cwd, briefingDataPath)} — run briefing:build:folder first (dashboard step 6/10).`);
}

// First present scene-videos*/manifest.json, if any. Clip filenames and scene
// mapping are identical across the normal/hook split folders, so any one is fine.
// The split (dashboard step 15) is OPTIONAL and decoupled from this step — when no
// manifest exists we simply omit the per-scene clip filename from the prompt.
const findSceneManifest = () => {
  if (!fs.existsSync(outputFolder)) return null;
  const dirs = fs
    .readdirSync(outputFolder, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && /^scene-videos/.test(entry.name))
    .map((entry) => path.join(outputFolder, entry.name, 'manifest.json'))
    .filter((manifest) => fs.existsSync(manifest))
    .sort();
  return dirs[0] || null;
};

const sceneManifestPath = findSceneManifest();

const briefing = readJson(briefingDataPath);
const manifest = sceneManifestPath ? readJson(sceneManifestPath) : {segments: []};
const keywordRadar = fs.existsSync(path.join(outputFolder, 'keyword-radar.json'))
  ? readJson(path.join(outputFolder, 'keyword-radar.json'))
  : {entries: []};
const visualScript = fs.existsSync(path.join(briefingFolder, 'visual-script.json'))
  ? readJson(path.join(briefingFolder, 'visual-script.json'))
  : {};

const scenes = briefing.scenes ?? [];
if (!scenes.length) {
  throw new Error(`No scenes found in ${path.relative(cwd, briefingDataPath)}`);
}

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();

// sceneId -> clip filename (e.g. scene-2 -> 01-intro-scene-2.mp4) from the manifest.
const clipBySceneId = new Map();
for (const segment of manifest.segments ?? []) {
  const sceneId = (segment.sceneIds ?? [])[0];
  if (sceneId) clipBySceneId.set(sceneId, segment.fileName);
}

// keyword-radar terms by sceneId (closing scene has no entry — that is fine).
const termsBySceneId = new Map();
for (const entry of keywordRadar.entries ?? []) {
  if (entry.sceneId) termsBySceneId.set(entry.sceneId, (entry.terms ?? []).map((term) => term.text).filter(Boolean));
}

const isClosingScene = (scene, index) => index === scenes.length - 1 || !scene.outlet;

const sceneBlocks = scenes.map((scene, index) => {
  const closing = isClosingScene(scene, index);
  const outletName = closing
    ? normalize(scene.title || scene.visual?.headline || 'خلاصة المشهد')
    : normalize(scene.outlet?.name || scene.title);
  const toneTag = closing ? '(closing recap — not an outlet)' : normalize(scene.visual?.headline);
  const summary = normalize(scene.visual?.summary || scene.body);
  const terms = termsBySceneId.get(scene.id) ?? [];
  const clip = clipBySceneId.get(scene.id) || '';

  const lines = [
    `- sceneId: ${scene.id}`,
    ...(clip ? [`  clip: ${clip}`] : []),
    closing ? `  closing recap: ${outletName}` : `  outlet: ${outletName}`,
    `  tone: ${toneTag || '(none)'}`,
    `  summary: ${summary || '(none)'}`,
    `  loaded terms: ${terms.length ? terms.join('، ') : '(none)'}`
  ];
  if (closing && visualScript.outroQuestion) {
    lines.push(`  open question (outro): ${normalize(visualScript.outroQuestion)}`);
  }
  return lines.join('\n');
});

const captionsPath = path.join(outputFolder, 'social-captions.json');

const prompt = [
  `# Social captions for Radar Beirut — ${date}`,
  '',
  'You are writing social-media copy for a daily Arabic press-briefing video.',
  `Write the file \`${path.relative(cwd, captionsPath).replace(/\\/g, '/')}\` as JSON with exactly this shape:`,
  '',
  '```json',
  '{',
  `  "date": "${date}",`,
  '  "generatedAt": "<current ISO timestamp>",',
  '  "youtube": {',
  '    "title": "string — punchy Arabic title for the full video",',
  '    "description": "string — 2–4 short paragraphs: the daily tone, then what each outlet emphasised",',
  '    "thumbnailPrompt": "string — prompt to give ChatGPT/image generation for a 16:9 YouTube thumbnail",',
  '    "hashtags": ["#لبنان", "#Lebanon", "..."]',
  '  },',
  '  "instagram": {',
  '    "reelCoverPrompt": "string — prompt to give ChatGPT/image generation for a 9:16 Instagram Reel cover; ask the user to save the generated image as output/instagram-reel-cover.png"',
  '  },',
  '  "clips": [',
  '    {',
  '      "sceneId": "scene-3",',
  '      "outlet": "اللواء",',
  '      "caption": "1–3 line Instagram post body for this clip",',
  '      "hashtags": ["#...", "#..."]',
  '    }',
  '  ]',
  '}',
  '```',
  '',
  '## Rules',
  '- Output ONE clips entry per sceneId listed below, keyed by sceneId. Do not invent sceneIds.',
  '- `outlet`: the outlet name as given. For the closing recap scene use the recap label given (it is not an outlet).',
  '- `caption`: Arabic, capture the daily tone AND what THIS outlet said/emphasised. Keep it tight.',
  '- `hashtags`: a MIX of Arabic and English/transliterated tags (8–15). Include outlet- and topic-specific tags',
  '  plus a few high-reach tags (e.g. #لبنان #Lebanon #Beirut #بيروت). Every tag starts with `#` and has no spaces.',
  '- The closing recap clip bundles the outro open question — let its caption gesture at that question.',
  '- `youtube.description` is for the FULL video shared on YouTube: lead with the day’s overall tone, then a short',
  '  per-outlet recap. End with the open question. `youtube.hashtags`: same Arabic+English mix.',
  '- `youtube.thumbnailPrompt`: write a practical prompt the user can paste into ChatGPT to generate a YouTube video thumbnail.',
  '  It must request a 16:9 thumbnail, preserve the Radar Beirut editorial/radar look, use bold readable Arabic title text,',
  '  mention the key visual metaphor from the day, and avoid asking for exact outlet logos unless source assets are provided.',
  '- `instagram.reelCoverPrompt`: write a practical prompt the user can paste into ChatGPT to generate ONE vertical Instagram Reel cover.',
  '  It must request a 9:16 image, preserve the Radar Beirut editorial/radar look, use bold readable Arabic title text that fits',
  '  a phone screen, leave top/bottom safe margins for Instagram UI, mention the key visual metaphor from the day, and avoid',
  '  asking for exact outlet logos unless source assets are provided. End the prompt by saying: Save the generated image as',
  `  \`${path.relative(cwd, path.join(outputFolder, 'instagram-reel-cover.png')).replace(/\\/g, '/')}\` so the dashboard can copy it to the phone folder.`,
  '- Write ONLY the JSON file. Do not print commentary.',
  '',
  '## Scenes (one clip each)',
  '',
  ...sceneBlocks,
  ''
].join('\n');

fs.mkdirSync(outputFolder, {recursive: true});
const promptPath = path.join(outputFolder, 'social-captions-prompt.md');
fs.writeFileSync(promptPath, prompt);

console.log(`Wrote social captions prompt: ${path.relative(cwd, promptPath)}`);
console.log(
  sceneManifestPath
    ? `Scene manifest used: ${path.relative(cwd, sceneManifestPath)}`
    : 'No scene-videos manifest found — clip filenames omitted (split is optional).'
);
console.log(`Codex should write: ${path.relative(cwd, captionsPath)}`);
