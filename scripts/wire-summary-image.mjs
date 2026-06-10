import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const outputFolder = path.join(briefingFolder, 'output');
const briefingDataPath = path.join(outputFolder, 'briefing.json');
const imageFileName = args.image || 'final_summary_generated.png';
const imagePath = path.join(outputFolder, imageFileName);

if (!fs.existsSync(briefingDataPath)) {
  throw new Error(`Missing briefing data: ${briefingDataPath}. Run briefing:build:folder first.`);
}

if (!fs.existsSync(imagePath)) {
  throw new Error(`Missing summary image: ${imagePath}`);
}

const briefing = readJson(briefingDataPath);
const scenes = briefing.scenes ?? [];
const summaryScene = scenes[scenes.length - 1];

if (!summaryScene) {
  throw new Error(`No summary scene found in ${briefingDataPath}`);
}

summaryScene.media = {
  fitMode: 'cover',
  items: [`./${imageFileName}`]
};

writeJson(briefingDataPath, briefing);
console.log(`Wired ${imageFileName} into summary scene ${summaryScene.id || scenes.length}`);
