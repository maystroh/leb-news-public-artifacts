import path from 'node:path';

import {buildPreparedBriefingData} from './lib/prepare-briefing-data.mjs';
import {findBriefingTextFile, parseCliArgs, readJson, resolveBriefingFolder, writeJson} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const briefingFolder = resolveBriefingFolder(cwd, args.folder ?? 'briefings/2026-06-01');
const briefingPath = findBriefingTextFile(briefingFolder);
const dataDir = args['data-dir'] ? path.resolve(cwd, args['data-dir']) : path.join(cwd, 'src', 'data');

const outletMapPath = args['outlet-map'] ? path.resolve(cwd, args['outlet-map']) : path.join(dataDir, 'outlet-map.json');
const visualScriptPath = args['visual-script'] ? path.resolve(cwd, args['visual-script']) : path.join(dataDir, 'visual-script.json');
const faultLineScriptPath = args['fault-script'] ? path.resolve(cwd, args['fault-script']) : path.join(dataDir, 'fault-line-map-script.json');
const keywordRadarScriptPath = args['keyword-script'] ? path.resolve(cwd, args['keyword-script']) : path.join(dataDir, 'keyword-radar-script.json');

const prepared = buildPreparedBriefingData({
  briefingPath,
  outletMap: readJson(outletMapPath),
  visualScript: readJson(visualScriptPath),
  faultLineScript: readJson(faultLineScriptPath),
  keywordRadarScript: readJson(keywordRadarScriptPath)
});

const briefingOutputPath = args['briefing-output'] ? path.resolve(cwd, args['briefing-output']) : path.join(dataDir, 'briefing.json');
const faultLineOutputPath = args['fault-output'] ? path.resolve(cwd, args['fault-output']) : path.join(dataDir, 'fault-line-map.json');
const keywordRadarOutputPath = args['keyword-output'] ? path.resolve(cwd, args['keyword-output']) : path.join(dataDir, 'keyword-radar.json');

writeJson(briefingOutputPath, prepared.briefingData);
writeJson(faultLineOutputPath, prepared.faultLineData);
writeJson(keywordRadarOutputPath, prepared.keywordRadarData);

console.log(`Prepared briefing data at ${briefingOutputPath}`);
console.log(`Prepared fault line map data at ${faultLineOutputPath}`);
console.log(`Prepared keyword radar data at ${keywordRadarOutputPath}`);
