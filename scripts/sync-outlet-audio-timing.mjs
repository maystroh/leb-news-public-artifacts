import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const outputFolder = path.join(briefingFolder, 'output');
const timingConfigPath = path.join(outputFolder, 'timing-config.json');
const manifestPath = path.join(briefingFolder, 'audio', 'manifest.json');
const padSeconds = typeof args['pad-seconds'] === 'string' ? Number(args['pad-seconds']) : 0.5;

if (!Number.isFinite(padSeconds) || padSeconds < 0) {
  throw new Error(`Invalid --pad-seconds value: ${args['pad-seconds']}`);
}

if (!fs.existsSync(timingConfigPath)) {
  throw new Error(`Missing timing config: ${path.relative(cwd, timingConfigPath)}. Run npm run briefing:build:folder first.`);
}

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing audio manifest: ${path.relative(cwd, manifestPath)}. Run npm run audio:outlets first.`);
}

const timingConfig = readJson(timingConfigPath);
const manifest = readJson(manifestPath);
const audioByScene = manifest.audioByScene ?? {};

timingConfig.briefing ??= {};
timingConfig.briefing.scenes ??= {};

const updated = [];
const missing = [];

for (const [sceneId, audio] of Object.entries(audioByScene)) {
  if (typeof audio.durationSeconds === 'number' && audio.durationSeconds > 0) {
    const durationSeconds = Number((audio.durationSeconds + padSeconds).toFixed(3));
    if (sceneId === 'outro') {
      timingConfig.briefing.outroSeconds = durationSeconds;
    } else {
      timingConfig.briefing.scenes[sceneId] = durationSeconds;
    }
    updated.push({
      sceneId,
      outletName: audio.outletName || audio.outletKey || '',
      durationSeconds,
      status: audio.status
    });
  } else {
    missing.push({
      sceneId,
      outletName: audio.outletName || audio.outletKey || '',
      status: audio.status || 'missing'
    });
  }
}

writeJson(timingConfigPath, timingConfig);

console.log(`Updated ${updated.length} briefing scene timings from outlet audio.`);
console.log(`Applied audio transition buffer: ${padSeconds}s.`);
for (const entry of updated) {
  console.log(`- ${entry.sceneId} / ${entry.outletName}: ${entry.durationSeconds}s (${entry.status})`);
}

if (missing.length) {
  console.log('No usable audio duration for:');
  for (const entry of missing) {
    console.log(`- ${entry.sceneId} / ${entry.outletName}: ${entry.status}`);
  }
}
