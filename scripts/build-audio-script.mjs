import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {buildSceneAudioMap, findLatestBriefingFolder} from './lib/scene-audio-map.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const briefingFolder = args.folder
  ? resolveBriefingFolder(cwd, args.folder)
  : findLatestBriefingFolder(cwd);

const map = buildSceneAudioMap({cwd, briefingFolder});

const scenes = map.entries.map((entry) => ({
  scene: entry.sceneNumber,
  sceneId: entry.sceneId,
  role: entry.role,
  hasAudio: entry.hasAudio,
  outletKey: entry.outletKey,
  outletName: entry.outletName,
  wavFile: entry.wavFile,
  wavExists: entry.wavExists,
  wavDurationSeconds: entry.wavDurationSeconds,
  source: entry.source,
  sourceNote: entry.sourceNote,
  ttsText: entry.ttsText,
  generatedFromText: entry.generatedFromText,
  matchesGeneratedAudio: entry.matchesGeneratedAudio
}));

const staleScenes = scenes.filter((scene) => scene.matchesGeneratedAudio === false);
const missingWavs = scenes.filter((scene) => scene.hasAudio && !scene.wavExists);
const unverifiedScenes = scenes.filter((scene) => scene.hasAudio && scene.matchesGeneratedAudio === null);

const audioScript = {
  meta: {
    generatedAt: new Date().toISOString(),
    folder: map.folderRel,
    textFile: map.txtRel,
    totalParagraphs: map.totalParagraphs,
    manifestGeneratedAt: map.manifest?.meta?.generatedAt ?? null,
    staleScenes: staleScenes.map((scene) => scene.sceneId),
    missingWavs: missingWavs.map((scene) => scene.sceneId),
    regenerateOneScene: [
      'rm <wavFile>',
      `npm run audio:outlets -- --folder ${map.folderRel}`,
      `node ./scripts/sync-outlet-audio-timing.mjs --folder ${map.folderRel}`,
      `npm run briefing:build:folder -- --folder ${map.folderRel}`
    ]
  },
  scenes
};

const outputPath = path.join(briefingFolder, 'output', 'audio-script.json');
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, JSON.stringify(audioScript, null, 2));

console.log(`Wrote ${path.relative(cwd, outputPath).replace(/\\/g, '/')} (${scenes.length} scenes)`);
console.log('');
for (const scene of scenes) {
  const status = !scene.hasAudio ? 'no audio (opening)'
    : !scene.wavExists ? 'WAV MISSING'
    : scene.matchesGeneratedAudio === false ? 'STALE — text changed since WAV was generated'
    : scene.matchesGeneratedAudio === null ? 'unverified (no manifest text)'
    : 'ok';
  const label = scene.outletName ?? scene.role;
  console.log(`  ${String(scene.scene).padStart(2)}  ${scene.sceneId.padEnd(9)} ${label.padEnd(20)} ${status}`);
}
console.log('');
if (staleScenes.length || missingWavs.length) {
  console.log(`Needs regeneration: ${[...staleScenes, ...missingWavs].map((scene) => scene.sceneId).join(', ')}`);
  console.log(`Per scene: rm the wavFile shown in audio-script.json, then npm run audio:outlets -- --folder ${map.folderRel}`);
} else if (unverifiedScenes.length) {
  console.log(`No manifest text to verify against for: ${unverifiedScenes.map((scene) => scene.sceneId).join(', ')} — run npm run audio:outlets first.`);
} else {
  console.log('All WAVs match their current source text.');
}
