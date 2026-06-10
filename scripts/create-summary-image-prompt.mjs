import fs from 'node:fs';
import path from 'node:path';

import {buildPreparedBriefingData} from './lib/prepare-briefing-data.mjs';
import {findBriefingTextFile, parseCliArgs, readJson, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {validateBriefingAnalysisFolder} from './lib/validate-briefing-analysis.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

if (!args.folder) {
  throw new Error('Missing --folder briefings/YYYY-MM-DD');
}

const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const outputFolder = path.join(briefingFolder, 'output');
const briefingDataPath = path.join(outputFolder, 'briefing.json');

const loadBriefing = () => {
  if (fs.existsSync(briefingDataPath)) {
    return readJson(briefingDataPath);
  }

  const analysisErrors = validateBriefingAnalysisFolder(briefingFolder);
  if (analysisErrors.length > 0) {
    throw new Error(`Cannot create summary image prompt before analysis files are ready:\n- ${analysisErrors.join('\n- ')}`);
  }

  const briefingPath = findBriefingTextFile(briefingFolder);
  return buildPreparedBriefingData({
    briefingPath,
    outletMap: readJson(path.join(briefingFolder, 'outlet-map.json')),
    visualScript: readJson(path.join(briefingFolder, 'visual-script.json')),
    faultLineScript: readJson(path.join(briefingFolder, 'fault-line-map-script.json')),
    keywordRadarScript: readJson(path.join(briefingFolder, 'keyword-radar-script.json'))
  }).briefingData;
};

const briefing = loadBriefing();
const scenes = briefing.scenes ?? [];
const summaryScene = scenes[scenes.length - 1];

if (!summaryScene) {
  throw new Error(`No summary scene found in ${briefingDataPath}`);
}

const promptPath = path.join(outputFolder, `${summaryScene.id || 'summary'}-summary-image.md`);
const normalizedBody = (summaryScene.body || '').replace(/\s+/g, ' ').trim();
const bodyExcerpt = normalizedBody.length > 900 ? `${normalizedBody.slice(0, 897).trim()}...` : normalizedBody;

fs.mkdirSync(outputFolder, {recursive: true});
fs.writeFileSync(
  promptPath,
  [
    'Create a vertical 9:16 editorial poster image for Radar Beirut.',
    '',
    'Scene:',
    summaryScene.title || summaryScene.shortLabel || 'خلاصة المشهد',
    '',
    'Source context:',
    bodyExcerpt,
    '',
    'Visual direction:',
    'Lebanese press briefing, Washington negotiation table, ideological fracture, cinematic editorial collage, serious political tone, vertical composition, high contrast, Arabic newsroom atmosphere.',
    '',
    'Constraints:',
    '- Do not include readable text.',
    '- Do not include logos.',
    '- Do not include newspaper mastheads unless abstracted.',
    '- Do not make it look like a generic stock photo.',
    '',
    'Save the generated image in this folder as:',
    path.join(outputFolder, 'final_summary_generated.png')
  ].join('\n')
);

console.log(`Wrote summary image prompt: ${promptPath}`);
