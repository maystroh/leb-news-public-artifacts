import fs from 'node:fs';
import path from 'node:path';

import {ZipArchive} from 'archiver';

import {parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';

// Packages one video type into a publishable zip: the full final MP4, its split
// scene clips, a per-clip Instagram caption .txt beside each clip, a combined
// captions index, and a YouTube description. Reads social-captions.json (Codex)
// and the scene-videos manifest for the variant. Step 16, Action B.

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}
if (!args.input) {
  throw new Error('Missing --input <final.mp4>');
}
if (!args['scene-dir']) {
  throw new Error('Missing --scene-dir <scene-videos[-hook-*] folder>');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const date = path.basename(briefingFolder);
const outputFolder = path.join(briefingFolder, 'output');
const captionsPath = path.join(outputFolder, 'social-captions.json');
const inputPath = path.resolve(cwd, args.input);
const sceneDir = path.resolve(cwd, args['scene-dir']);
const sceneManifestPath = path.join(sceneDir, 'manifest.json');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!fs.existsSync(captionsPath)) fail(`Missing ${path.relative(cwd, captionsPath)} — run the Codex caption step first (Action A).`);
if (!fs.existsSync(inputPath)) fail(`Missing final MP4: ${path.relative(cwd, inputPath)} — download it first (dashboard step 14).`);
if (!fs.existsSync(sceneManifestPath)) fail(`Missing scene manifest: ${path.relative(cwd, sceneManifestPath)} — split the video first (dashboard step 15).`);

const captions = readJson(captionsPath);
const manifest = readJson(sceneManifestPath);

const clipBySceneId = new Map();
for (const clip of captions.clips ?? []) {
  if (clip && clip.sceneId) clipBySceneId.set(String(clip.sceneId), clip);
}

// Output zip name from the variant suffix carried by the final MP4 file name.
const mid = path.basename(inputPath).replace(/^radar-beirut-briefing/, '').replace(/-final\.mp4$/, '');
const outputZip = args.output
  ? path.resolve(cwd, args.output)
  : path.join(outputFolder, `radar-beirut-briefing${mid}-${date}.zip`);

const joinHashtags = (tags) => (Array.isArray(tags) ? tags : []).join(' ');

const clipTxt = (clip) =>
  [`Outlet: ${clip.outlet || ''}`.trimEnd(), clip.caption || '', '', joinHashtags(clip.hashtags)].join('\n');

// Resolve each manifest segment to its clip file + caption entry. A clip with no
// caption entry means the caption set is stale relative to the split — hard error.
const segments = manifest.segments ?? [];
if (!segments.length) fail(`No segments in ${path.relative(cwd, sceneManifestPath)}.`);

const planned = [];
const indexBlocks = [];
for (const segment of segments) {
  const sceneId = (segment.sceneIds ?? [])[0];
  const clipPath = path.join(sceneDir, segment.fileName);
  if (!fs.existsSync(clipPath)) fail(`Missing clip file: ${path.relative(cwd, clipPath)}.`);
  const clip = clipBySceneId.get(String(sceneId));
  if (!clip) {
    fail(`No caption entry for scene "${sceneId}" (clip ${segment.fileName}). Regenerate social-captions.json (Action A).`);
  }
  const baseName = path.basename(segment.fileName, path.extname(segment.fileName));
  planned.push({clipPath, clipName: segment.fileName, txtName: `${baseName}.txt`, txt: clipTxt(clip)});
  indexBlocks.push([`### ${segment.fileName}`, clipTxt(clip)].join('\n'));
}

const youtube = captions.youtube || {};
const youtubeTxt = [youtube.title || '', '', youtube.description || '', '', joinHashtags(youtube.hashtags)].join('\n');
const indexTxt = [`Radar Beirut — ${date}`, '', indexBlocks.join('\n\n')].join('\n');

fs.mkdirSync(path.dirname(outputZip), {recursive: true});

const output = fs.createWriteStream(outputZip);
const archive = new ZipArchive({zlib: {level: 9}});

const done = new Promise((resolve, reject) => {
  output.on('close', resolve);
  archive.on('warning', (error) => {
    if (error.code === 'ENOENT') console.warn(error.message);
    else reject(error);
  });
  archive.on('error', reject);
});

archive.pipe(output);

// Root: full video + the two text docs.
archive.file(inputPath, {name: path.basename(inputPath)});
archive.append(youtubeTxt, {name: 'youtube-description.txt'});
archive.append(indexTxt, {name: 'instagram-captions-index.txt'});

// scenes/: each clip mp4 + its caption .txt.
for (const item of planned) {
  archive.file(item.clipPath, {name: `scenes/${item.clipName}`});
  archive.append(item.txt, {name: `scenes/${item.txtName}`});
}

await archive.finalize();
await done;

console.log(`Wrote ${path.relative(cwd, outputZip)} (${archive.pointer()} bytes)`);
console.log(`  full video: ${path.basename(inputPath)}`);
console.log(`  scene clips + captions: ${planned.length}`);
