import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {OUTLET_YOUTUBE_CHANNELS, findOutletYoutubeChannelForOutlet, formatYoutubeChannelList} from './lib/outlet-youtube-channels.mjs';
import {OUTLET_X_ACCOUNTS, RADAR_BEIRUT_X_ACCOUNT, findOutletXAccount, findOutletXAccountForOutlet, formatXAccountList} from './lib/outlet-x-accounts.mjs';
import {RADAR_BEIRUT_PUBLISHING_HASHTAGS} from './lib/social-publishing-hashtags.mjs';

// Writes output/social-captions-prompt.md: a Codex prompt that turns the day's
// briefing + keyword data into output/social-captions.json (per-clip Instagram
// captions/hashtags + YouTube publishing text + the daily X thread). Step 16, Action A.

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

const toNumber = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const roundSeconds = (value) => Number(value.toFixed(3));
const slug = (value) => String(value || 'segment')
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'segment';

const briefing = readJson(briefingDataPath);
const scenes = briefing.scenes ?? [];
if (!scenes.length) {
  throw new Error(`No scenes found in ${path.relative(cwd, briefingDataPath)}`);
}

// First present scene-videos*/manifest.json. Clip filenames and scene mapping are
// identical across the normal/hook split folders, so any one is fine. If no split
// manifest exists yet, derive the same plan from briefing.json so social captions
// can be generated before step 15 runs.
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

const createSegmentPlan = () => {
  const introSeconds = toNumber(briefing.intro?.durationSeconds);
  const outroSeconds = toNumber(briefing.outro?.durationSeconds);
  const sceneStarts = [];
  let cursor = introSeconds;
  for (const scene of scenes) {
    sceneStarts.push(roundSeconds(cursor));
    cursor += toNumber(scene.durationSeconds);
  }
  const totalDurationSeconds = roundSeconds(cursor + outroSeconds);

  if (scenes.length === 1) {
    return [{
      index: 1,
      id: `intro-${scenes[0].id}-outro`,
      label: `Intro + ${scenes[0].id} + outro`,
      sceneIds: [scenes[0].id],
      includesIntro: true,
      includesOutro: true,
      startSeconds: 0,
      durationSeconds: totalDurationSeconds
    }];
  }

  const segments = [{
    index: 1,
    id: `intro-${scenes[0].id}`,
    label: `Intro + ${scenes[0].id}`,
    sceneIds: [scenes[0].id],
    includesIntro: true,
    includesOutro: false,
    startSeconds: 0,
    durationSeconds: roundSeconds(introSeconds + toNumber(scenes[0].durationSeconds))
  }];

  for (let sceneIndex = 1; sceneIndex < scenes.length - 1; sceneIndex += 1) {
    const scene = scenes[sceneIndex];
    segments.push({
      index: segments.length + 1,
      id: scene.id,
      label: scene.id,
      sceneIds: [scene.id],
      includesIntro: false,
      includesOutro: false,
      startSeconds: sceneStarts[sceneIndex],
      durationSeconds: roundSeconds(toNumber(scene.durationSeconds))
    });
  }

  const lastScene = scenes[scenes.length - 1];
  segments.push({
    index: segments.length + 1,
    id: `${lastScene.id}-outro`,
    label: `${lastScene.id} + outro`,
    sceneIds: [lastScene.id],
    includesIntro: false,
    includesOutro: true,
    startSeconds: sceneStarts[scenes.length - 1],
    durationSeconds: roundSeconds(toNumber(lastScene.durationSeconds) + outroSeconds)
  });

  return segments;
};

const sceneManifestPath = findSceneManifest();
const manifest = sceneManifestPath
  ? readJson(sceneManifestPath)
  : {
      generatedFrom: path.relative(cwd, briefingDataPath).replace(/\\/g, '/'),
      segments: createSegmentPlan().map((segment) => ({
        ...segment,
        fileName: `${String(segment.index).padStart(2, '0')}-${slug(segment.id)}.mp4`
      }))
    };
const keywordRadar = fs.existsSync(path.join(outputFolder, 'keyword-radar.json'))
  ? readJson(path.join(outputFolder, 'keyword-radar.json'))
  : {entries: []};
const faultLineMap = fs.existsSync(path.join(outputFolder, 'fault-line-map.json'))
  ? readJson(path.join(outputFolder, 'fault-line-map.json'))
  : null;
const quoteDuel = fs.existsSync(path.join(outputFolder, 'quote-duel.json'))
  ? readJson(path.join(outputFolder, 'quote-duel.json'))
  : null;
const visualScript = fs.existsSync(path.join(briefingFolder, 'visual-script.json'))
  ? readJson(path.join(briefingFolder, 'visual-script.json'))
  : {};

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

// Fault-line stance per sceneId (from output/fault-line-map.json when present) —
// this is what lets Codex group outlets into the faultline X thread posts.
const stanceBySceneId = new Map();
for (const entry of faultLineMap?.entries ?? []) {
  if (entry.sceneId) stanceBySceneId.set(entry.sceneId, entry);
}
const faultLineAxis = faultLineMap?.axis || null;

// Quote duel texts (output/quote-duel.json) are the wording published in the duel
// videos — when present, the X faultline posts must reuse that framing.
const duelBlocks = (quoteDuel?.scenes ?? []).map((duel) => {
  const sideLine = (side) => {
    const account = findOutletXAccount(side?.outlet);
    return `  - ${normalize(side?.outlet)}${account ? ` (${account.handle})` : ''}: ${normalize(side?.stance)} — «${normalize(side?.quote)}»`;
  };
  return [
    `- ${duel.id}: ${normalize(duel.eventLabel)} — ${normalize(duel.contrastLabel)}`,
    `  summary: ${normalize(duel.summary)}`,
    sideLine(duel.left),
    sideLine(duel.right)
  ].join('\n');
});

const isClosingScene = (scene, index) => index === scenes.length - 1 || !scene.outlet;

const sceneBlocks = scenes.map((scene, index) => {
  const closing = isClosingScene(scene, index);
  const youtubeChannel = closing ? null : findOutletYoutubeChannelForOutlet(scene.outlet);
  const xAccount = closing ? null : findOutletXAccountForOutlet(scene.outlet);
  const outletName = closing
    ? normalize(scene.title || scene.visual?.headline || 'خلاصة المشهد')
    : normalize(scene.outlet?.name || scene.title);
  const toneTag = closing ? '(closing recap — not an outlet)' : normalize(scene.visual?.headline);
  const summary = normalize(scene.visual?.summary || scene.body);
  const terms = termsBySceneId.get(scene.id) ?? [];
  const clip = clipBySceneId.get(scene.id) || '';
  const stance = closing ? null : stanceBySceneId.get(scene.id);
  const stanceLabel = stance ? normalize(stance.headline || stance.stanceLabel) : '';
  const stancePosition = typeof stance?.position === 'number' ? ` (axis position ${stance.position}; 0 = left pole, 1 = right pole)` : '';

  const lines = [
    `- sceneId: ${scene.id}`,
    ...(clip ? [`  clip: ${clip}`] : []),
    closing ? `  closing recap: ${outletName}` : `  outlet: ${outletName}`,
    ...(youtubeChannel ? [`  outlet YouTube channel: ${youtubeChannel.url}`] : []),
    ...(xAccount ? [`  outlet X account: ${xAccount.handle} ${xAccount.url}`] : []),
    `  tone: ${toneTag || '(none)'}`,
    ...(stanceLabel ? [`  fault-line stance: ${stanceLabel}${stancePosition}`] : []),
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
  '  "x": {',
  '    "accountUrl": "https://x.com/RadarBeirut",',
  '    "posts": [',
  '      {',
  '        "id": "hook",',
  '        "label": "1/5 hook (native video)",',
  '        "text": "string — starts with الصحافة اليوم; the day’s sharpest tension in ONE line; ends with exactly 2 hashtags"',
  '      },',
  '      {',
  '        "id": "faultline-1",',
  '        "label": "2/5 fault line",',
  '        "text": "string — one side of today’s split; outlet @handles inline mid-sentence"',
  '      },',
  '      {',
  '        "id": "faultline-2",',
  '        "label": "3/5 fault line",',
  '        "text": "string — the opposing side; remaining outlet @handles inline mid-sentence"',
  '      },',
  '      {',
  '        "id": "question",',
  '        "label": "4/5 open question (poll)",',
  '        "text": "string — today’s open question, inviting replies",',
  '        "poll": ["stance ≤25 chars", "stance ≤25 chars"]',
  '      },',
  '      {',
  '        "id": "link",',
  '        "label": "5/5 YouTube link",',
  '        "text": "النسخة الكاملة على يوتيوب 👇 {YOUTUBE_LINK}"',
  '      }',
  '    ]',
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
  '- `hashtags`: a MIX of Arabic and English/transliterated tags. Include outlet- and topic-specific tags',
  '  plus the strongest relevant publishing tags from the required set below. Every tag starts with `#` and has no spaces.',
  '- `youtube.hashtags` MUST include ALL required publishing hashtags listed below, plus ALL outlet hashtags listed in the source-channel section.',
  '- The closing recap clip bundles the outro open question — let its caption gesture at that question.',
  '- `youtube.description` is for the FULL video shared on YouTube: lead with the day’s overall tone, then a short',
  '  per-outlet recap. End with the open question. `youtube.hashtags`: same Arabic+English mix.',
  '- At the end of `youtube.description`, add a short source-channel section. It MUST include every YouTube channel listed',
  '  below exactly once, with the outlet name and exact URL. Do not put these source links in hashtags.',
  '- `youtube.thumbnailPrompt`: write a practical prompt the user can paste into ChatGPT to generate a YouTube video thumbnail.',
  '  It must request a 16:9 thumbnail, preserve the Radar Beirut editorial/radar look, use bold readable Arabic title text,',
  '  mention the key visual metaphor from the day, and avoid asking for exact outlet logos unless source assets are provided.',
  '- `x.accountUrl` must be exactly the Radar Beirut X account URL listed below.',
  '- `x.posts` is the copy-ready daily X thread, posted top-to-bottom (every post after the first is a reply to the previous one).',
  '- Thread order and ids are fixed: `hook`, then 1–3 fault-line posts with ids `faultline-1`..`faultline-3`, then `question`, then `link` (4–6 posts total).',
  '- Set every `label` to `<index>/<total> <role>` (e.g. `2/5 fault line`).',
  '- EVERY post text MUST be 275 characters or fewer, including spaces and hashtags.',
  '- `hook`: MUST start with `الصحافة اليوم`, state the day’s sharpest tension/clash in one tight line, and end with EXACTLY two hashtags:',
  '  `#لبنان` plus ONE topic hashtag chosen from today’s loaded terms. No links, no @handles, no extra hashtags.',
  '  This post carries the native video upload, so do not mention YouTube in it.',
  '- `faultline-*` posts: group today’s outlets by the fault line described below — typically one post per side of the axis,',
  '  naming each outlet’s stance in a few words. Mention each outlet X @handle from the scene blocks EXACTLY ONCE across all',
  '  faultline posts, woven inline mid-sentence — NEVER as the first character of a post. No hashtags, no links in these posts.',
  '- If quote duels are listed below, the faultline posts MUST reuse the duel wording: describe each duel outlet’s position',
  '  using the SAME stance labels and quote framing as its duel entry, so the X thread matches the published duel videos',
  '  word-for-word where possible. Outlets not covered by any duel fall back to their fault-line stance and summary.',
  '- `question`: today’s open question (from the outro), phrased to invite replies. Also fill `poll` with 2–4 short opposing',
  '  stance options, each 25 characters or fewer (X poll option limit). No hashtags, no links, no handles.',
  '- `link`: one short closing line pointing to the full video. It MUST contain the placeholder `{YOUTUBE_LINK}` exactly as written',
  '  (the user pastes the real URL after uploading). No handles, no hashtags.',
  '- Do not include the Radar Beirut handle in any X post. Outlet handles appear only in the faultline posts.',
  '- Write ONLY the JSON file. Do not print commentary.',
  '',
  '## Required publishing hashtags for youtube.hashtags',
  '',
  RADAR_BEIRUT_PUBLISHING_HASHTAGS.join(' '),
  '',
  '## YouTube source channels to include in youtube.description',
  '',
  formatYoutubeChannelList(OUTLET_YOUTUBE_CHANNELS),
  '',
  '## Radar Beirut X account',
  '',
  `${RADAR_BEIRUT_X_ACCOUNT.handle}: ${RADAR_BEIRUT_X_ACCOUNT.url}`,
  '',
  '## Known outlet X accounts for the faultline posts',
  '',
  formatXAccountList(OUTLET_X_ACCOUNTS),
  '',
  '## Today’s fault line (for grouping the faultline posts)',
  '',
  faultLineAxis
    ? [
        `- headline: ${normalize(faultLineAxis.headline)}`,
        `- left pole: ${normalize(faultLineAxis.leftPole)}`,
        `- right pole: ${normalize(faultLineAxis.rightPole)}`
      ].join('\n')
    : '(no output/fault-line-map.json yet — infer the day’s main split from the scene tones and summaries)',
  '',
  '## Today’s quote duels (published as duel videos — reuse this wording in the faultline posts)',
  '',
  duelBlocks.length
    ? duelBlocks.join('\n')
    : '(no output/quote-duel.json yet — write the faultline posts from the fault line and scene summaries instead)',
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
console.log(sceneManifestPath
  ? `Scene manifest used: ${path.relative(cwd, sceneManifestPath)}`
  : 'Scene manifest used: derived from briefing.json (split can run later)');
console.log(`Codex should write: ${path.relative(cwd, captionsPath)}`);
