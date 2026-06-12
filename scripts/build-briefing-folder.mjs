import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import mp3DurationCb from 'mp3-duration';

import {buildPreparedBriefingData} from './lib/prepare-briefing-data.mjs';
import {
  findBriefingTextFile,
  parseCliArgs,
  readJson,
  resolveBriefingFolder,
  writeJson
} from './lib/briefing-helpers.mjs';
import {validateBriefingAnalysisFolder} from './lib/validate-briefing-analysis.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const briefingPath = findBriefingTextFile(briefingFolder);
const outputFolder = path.join(briefingFolder, 'output');
fs.mkdirSync(outputFolder, {recursive: true});
const mp3Duration = promisify(mp3DurationCb);

const analysisErrors = validateBriefingAnalysisFolder(briefingFolder);
if (analysisErrors.length > 0) {
  console.error(`Analysis files are not ready in ${briefingFolder}.`);
  console.error('Fill the generated JSON files before building:');
  for (const error of analysisErrors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const prepared = buildPreparedBriefingData({
  briefingPath,
  outletMap: readJson(path.join(briefingFolder, 'outlet-map.json')),
  visualScript: readJson(path.join(briefingFolder, 'visual-script.json')),
  faultLineScript: readJson(path.join(briefingFolder, 'fault-line-map-script.json')),
  keywordRadarScript: readJson(path.join(briefingFolder, 'keyword-radar-script.json'))
});

const briefingDataPath = path.join(outputFolder, 'briefing.json');
const faultLineDataPath = path.join(outputFolder, 'fault-line-map.json');
const keywordRadarDataPath = path.join(outputFolder, 'keyword-radar.json');
const quoteDuelPath = path.join(briefingFolder, 'quote-duel.json');
const quoteDuelDataPath = path.join(outputFolder, 'quote-duel.json');
const timingConfigPath = path.join(outputFolder, 'timing-config.json');
const audioManifestPath = path.join(briefingFolder, 'audio', 'manifest.json');
const introAudioPath = path.join(cwd, 'templates', 'radar-beirut-into-audio-new.mp3');
const introAudioBufferSeconds = 0.5;
const introTextRevealLeadSeconds = 3;
const getNumericDuration = (value, fallback = null) => (typeof value === 'number' ? value : fallback);
const getIntroTextRevealSeconds = (intro, durationOverride = null) => {
  const durationSeconds = getNumericDuration(durationOverride, getNumericDuration(intro?.durationSeconds, 8));
  return getNumericDuration(intro?.textRevealSeconds, Math.max(0, durationSeconds - introTextRevealLeadSeconds));
};
const quoteDuelData = fs.existsSync(quoteDuelPath) ? readJson(quoteDuelPath) : null;
const getIntroAudioDurationSeconds = async () => {
  if (!fs.existsSync(introAudioPath)) {
    return null;
  }

  const durationSeconds = await mp3Duration(introAudioPath);
  return Number((durationSeconds + introAudioBufferSeconds).toFixed(3));
};

const introAudioDurationSeconds = await getIntroAudioDurationSeconds();
const introAudioTextRevealSeconds = typeof introAudioDurationSeconds === 'number'
  ? Number(Math.max(0, introAudioDurationSeconds - introTextRevealLeadSeconds).toFixed(3))
  : null;

const applyIntroAudioTiming = (formatConfig) => {
  if (!formatConfig || typeof introAudioDurationSeconds !== 'number') {
    return false;
  }

  let changed = false;
  if (formatConfig.introSeconds !== introAudioDurationSeconds) {
    formatConfig.introSeconds = introAudioDurationSeconds;
    changed = true;
  }
  if (formatConfig.introTextRevealSeconds !== introAudioTextRevealSeconds) {
    formatConfig.introTextRevealSeconds = introAudioTextRevealSeconds;
    changed = true;
  }
  return changed;
};

const ensureTimingConfig = (preparedData) => {
  const defaultConfig = {
    briefing: {
      introSeconds: getNumericDuration(introAudioDurationSeconds, getNumericDuration(preparedData.briefingData.intro?.durationSeconds)),
      introTextRevealSeconds: getNumericDuration(introAudioTextRevealSeconds, getIntroTextRevealSeconds(preparedData.briefingData.intro, introAudioDurationSeconds)),
      scenes: Object.fromEntries(
        (preparedData.briefingData.scenes || []).map((scene) => [scene.id, scene.durationSeconds])
      ),
      outroSeconds: getNumericDuration(preparedData.briefingData.outro?.durationSeconds)
    },
    quoteDuel: {
      introSeconds: getNumericDuration(introAudioDurationSeconds, getNumericDuration(quoteDuelData?.intro?.durationSeconds)),
      introTextRevealSeconds: getNumericDuration(introAudioTextRevealSeconds, getIntroTextRevealSeconds(quoteDuelData?.intro, introAudioDurationSeconds)),
      scenes: {},
      outroSeconds: null
    },
    faultLineMap: {
      introSeconds: getNumericDuration(introAudioDurationSeconds, getNumericDuration(preparedData.faultLineData.intro?.durationSeconds)),
      introTextRevealSeconds: getNumericDuration(introAudioTextRevealSeconds, getIntroTextRevealSeconds(preparedData.faultLineData.intro, introAudioDurationSeconds)),
      scenes: Object.fromEntries(
        (preparedData.faultLineData.entries || []).map((entry) => [entry.sceneId, entry.durationSeconds])
      ),
      synthesisSeconds: getNumericDuration(preparedData.faultLineData.synthesis?.durationSeconds),
      outroSeconds: getNumericDuration(preparedData.faultLineData.outro?.durationSeconds)
    },
    keywordRadar: {
      introSeconds: getNumericDuration(introAudioDurationSeconds, getNumericDuration(preparedData.keywordRadarData.intro?.durationSeconds)),
      introTextRevealSeconds: getNumericDuration(introAudioTextRevealSeconds, getIntroTextRevealSeconds(preparedData.keywordRadarData.intro, introAudioDurationSeconds)),
      scenes: Object.fromEntries(
        (preparedData.keywordRadarData.entries || []).map((entry) => [entry.sceneId, entry.durationSeconds])
      ),
      synthesisSeconds: getNumericDuration(preparedData.keywordRadarData.synthesis?.durationSeconds),
      outroSeconds: getNumericDuration(preparedData.keywordRadarData.outro?.durationSeconds)
    }
  };

  if (!fs.existsSync(timingConfigPath)) {
    writeJson(timingConfigPath, defaultConfig);
    return defaultConfig;
  }

  const existingConfig = readJson(timingConfigPath);
  let changed = false;
  for (const [formatKey, formatDefaults] of Object.entries(defaultConfig)) {
    existingConfig[formatKey] ??= {};
    for (const [fieldKey, defaultValue] of Object.entries(formatDefaults)) {
      if (existingConfig[formatKey][fieldKey] === undefined) {
        existingConfig[formatKey][fieldKey] = defaultValue;
        changed = true;
      }
    }
    if (applyIntroAudioTiming(existingConfig[formatKey])) {
      changed = true;
    }
  }
  if (changed) {
    writeJson(timingConfigPath, existingConfig);
  }
  return existingConfig;
};

const applyIntroTimingOverrides = (intro, timing) => {
  if (!intro || !timing) return;
  if (typeof timing.introSeconds === 'number') {
    intro.durationSeconds = timing.introSeconds;
  }
  if (typeof timing.introTextRevealSeconds === 'number') {
    intro.textRevealSeconds = timing.introTextRevealSeconds;
  } else {
    intro.textRevealSeconds = getIntroTextRevealSeconds(intro);
  }
};

const applyTimingOverrides = (preparedData, timingConfig, quoteDuel) => {
  const briefingTiming = timingConfig?.briefing ?? {};
  const briefingSceneTiming = briefingTiming.scenes ?? {};
  applyIntroTimingOverrides(preparedData.briefingData.intro, briefingTiming);
  if (typeof briefingTiming.outroSeconds === 'number') {
    preparedData.briefingData.outro.durationSeconds = briefingTiming.outroSeconds;
  }
  preparedData.briefingData.scenes = (preparedData.briefingData.scenes || []).map((scene) => ({
    ...scene,
    durationSeconds: typeof briefingSceneTiming[scene.id] === 'number'
      ? briefingSceneTiming[scene.id]
      : scene.durationSeconds
  }));

  const faultTiming = timingConfig?.faultLineMap ?? {};
  const faultSceneTiming = faultTiming.scenes ?? {};
  applyIntroTimingOverrides(preparedData.faultLineData.intro, faultTiming);
  if (typeof faultTiming.synthesisSeconds === 'number') {
    preparedData.faultLineData.synthesis.durationSeconds = faultTiming.synthesisSeconds;
  }
  if (typeof faultTiming.outroSeconds === 'number') {
    preparedData.faultLineData.outro.durationSeconds = faultTiming.outroSeconds;
  }
  preparedData.faultLineData.entries = (preparedData.faultLineData.entries || []).map((entry) => ({
    ...entry,
    durationSeconds: typeof faultSceneTiming[entry.sceneId] === 'number'
      ? faultSceneTiming[entry.sceneId]
      : entry.durationSeconds
  }));

  const keywordTiming = timingConfig?.keywordRadar ?? {};
  const keywordSceneTiming = keywordTiming.scenes ?? {};
  applyIntroTimingOverrides(preparedData.keywordRadarData.intro, keywordTiming);
  if (typeof keywordTiming.synthesisSeconds === 'number') {
    preparedData.keywordRadarData.synthesis.durationSeconds = keywordTiming.synthesisSeconds;
  }
  if (typeof keywordTiming.outroSeconds === 'number') {
    preparedData.keywordRadarData.outro.durationSeconds = keywordTiming.outroSeconds;
  }
  preparedData.keywordRadarData.entries = (preparedData.keywordRadarData.entries || []).map((entry) => ({
    ...entry,
    durationSeconds: typeof keywordSceneTiming[entry.sceneId] === 'number'
      ? keywordSceneTiming[entry.sceneId]
      : entry.durationSeconds
  }));

  const quoteDuelTiming = timingConfig?.quoteDuel ?? {};
  if (quoteDuel) {
    applyIntroTimingOverrides(quoteDuel.intro, quoteDuelTiming);
  }
};

const timingConfig = ensureTimingConfig(prepared);
applyTimingOverrides(prepared, timingConfig, quoteDuelData);

const attachOutletAudio = () => {
  if (!fs.existsSync(audioManifestPath)) return;

  const manifest = readJson(audioManifestPath);
  const audioByScene = manifest.audioByScene ?? {};
  const toRelativeAudio = (audio) => {
    const absoluteAudioPath = path.resolve(cwd, audio.audioPath);
    const relativeAudioPath = path.relative(outputFolder, absoluteAudioPath).replace(/\\/g, '/');
    return relativeAudioPath.startsWith('.') ? relativeAudioPath : `./${relativeAudioPath}`;
  };
  const toBriefingAudio = (audio) => ({
    src: toRelativeAudio(audio),
    durationSeconds: audio.durationSeconds,
    status: audio.status,
    outletKey: audio.outletKey,
    outletName: audio.outletName
  });

  prepared.briefingData.scenes = (prepared.briefingData.scenes ?? []).map((scene) => {
    const audio = audioByScene[scene.id];
    if (!audio || typeof audio.durationSeconds !== 'number' || !audio.audioPath) {
      return scene;
    }

    return {
      ...scene,
      audio: toBriefingAudio(audio)
    };
  });

  const outroAudio = audioByScene.outro;
  if (outroAudio && typeof outroAudio.durationSeconds === 'number' && outroAudio.audioPath) {
    prepared.briefingData.outro.audio = toBriefingAudio(outroAudio);
  }
};

attachOutletAudio();

const summaryImagePath = path.join(outputFolder, 'final_summary_generated.png');
if (fs.existsSync(summaryImagePath)) {
  const scenes = prepared.briefingData.scenes ?? [];
  const summaryScene = scenes[scenes.length - 1];
  if (summaryScene) {
    summaryScene.media = {
      fitMode: 'cover',
      items: ['./final_summary_generated.png']
    };
  }
}

writeJson(briefingDataPath, prepared.briefingData);
writeJson(faultLineDataPath, prepared.faultLineData);
writeJson(keywordRadarDataPath, prepared.keywordRadarData);
if (quoteDuelData) {
  writeJson(quoteDuelDataPath, quoteDuelData);
}

const runNodeScript = (scriptPath, extraArgs) => {
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const rewriteHtmlAssetPaths = (htmlPath) => {
  const relativeRoot = path.relative(path.dirname(htmlPath), cwd).replace(/\\/g, '/');
  const rootPrefix = relativeRoot ? `${relativeRoot}/` : '';
  const rawHtml = fs.readFileSync(htmlPath, 'utf8');
  const rewrittenHtml = rawHtml
    .replaceAll("./public/outlet-logos/", `./${rootPrefix}public/outlet-logos/`)
    .replaceAll("./fonts/", `./${rootPrefix}fonts/`)
    .replaceAll("./logos/", `./${rootPrefix}logos/`);

  fs.writeFileSync(htmlPath, rewrittenHtml);
};

runNodeScript(path.join('scripts', 'build-full-editorial-html.mjs'), [
  '--data',
  briefingDataPath,
  '--output',
  path.join(outputFolder, 'radar-beirut-briefing.html'),
  '--media-dir',
  briefingFolder
]);

runNodeScript(path.join('scripts', 'build-quote-duel-html.mjs'), [
  '--data',
  quoteDuelDataPath,
  '--output',
  path.join(outputFolder, 'radar-beirut-quote-duel.html')
]);

runNodeScript(path.join('scripts', 'build-fault-line-map-html.mjs'), [
  '--data',
  faultLineDataPath,
  '--output',
  path.join(outputFolder, 'radar-beirut-fault-line-map.html')
]);

runNodeScript(path.join('scripts', 'build-keyword-radar-html.mjs'), [
  '--data',
  keywordRadarDataPath,
  '--output',
  path.join(outputFolder, 'radar-beirut-keyword-radar.html')
]);

const fullEditorialHookSuffixes = ['', '-hook-captions', '-hook-coldopen', '-hook-choreography', '-hook-stamps'];
for (const hookSuffix of fullEditorialHookSuffixes) {
  const hookHtmlPath = path.join(outputFolder, `radar-beirut-briefing${hookSuffix}.html`);
  if (fs.existsSync(hookHtmlPath)) {
    rewriteHtmlAssetPaths(hookHtmlPath);
  }
}
rewriteHtmlAssetPaths(path.join(outputFolder, 'radar-beirut-quote-duel.html'));
rewriteHtmlAssetPaths(path.join(outputFolder, 'radar-beirut-fault-line-map.html'));
rewriteHtmlAssetPaths(path.join(outputFolder, 'radar-beirut-keyword-radar.html'));

console.log(`Built all briefing outputs in ${outputFolder}`);
