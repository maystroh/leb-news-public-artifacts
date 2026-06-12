import fs from 'node:fs';
import path from 'node:path';

import {findBriefingTextFile, readJson} from './briefing-helpers.mjs';

export const normalizeSpacing = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const findLatestBriefingFolder = (cwd) => {
  const briefingsDir = path.join(cwd, 'briefings');
  const dateFolders = (fs.existsSync(briefingsDir) ? fs.readdirSync(briefingsDir, {withFileTypes: true}) : [])
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (dateFolders.length === 0) {
    throw new Error('No briefings/YYYY-MM-DD folders found. Pass --folder explicitly.');
  }

  return path.join(briefingsDir, dateFolders[dateFolders.length - 1]);
};

const readJsonIfExists = (filePath) => (fs.existsSync(filePath) ? readJson(filePath) : null);

// Mirrors scripts/lib/prepare-briefing-data.mjs: paragraph 1 = opening (no audio),
// paragraphs 2..P-2 = outlet scenes, P-1 = closing scene audioText, P = outro question.
export const buildSceneAudioMap = ({cwd, briefingFolder}) => {
  const folderRel = path.relative(cwd, briefingFolder).replace(/\\/g, '/');
  const txtPath = findBriefingTextFile(briefingFolder);
  const txtRel = path.relative(cwd, txtPath).replace(/\\/g, '/');
  const paragraphs = fs
    .readFileSync(txtPath, 'utf8')
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const totalParagraphs = paragraphs.length;

  const visualScript = readJsonIfExists(path.join(briefingFolder, 'visual-script.json'));
  const outletMap = readJsonIfExists(path.join(briefingFolder, 'outlet-map.json')) ?? [];
  const briefing = readJsonIfExists(path.join(briefingFolder, 'output', 'briefing.json'));
  const manifest = readJsonIfExists(path.join(briefingFolder, 'audio', 'manifest.json'));

  const entries = [];

  for (let sceneNumber = 1; sceneNumber <= totalParagraphs; sceneNumber += 1) {
    const sceneId = `scene-${sceneNumber}`;
    const outletEntry = outletMap.find?.((entry) => entry.sceneId === sceneId) ?? null;
    const builtScene = briefing?.scenes?.find((scene) => scene.id === sceneId) ?? null;

    const role =
      sceneNumber === 1 ? 'opening'
      : sceneNumber === totalParagraphs ? 'outro'
      : sceneNumber === totalParagraphs - 1 ? 'closing'
      : 'outlet';

    if (role === 'opening') {
      entries.push({
        sceneNumber,
        sceneId,
        role,
        hasAudio: false,
        outletKey: null,
        outletName: null,
        wavFile: null,
        wavExists: false,
        wavDurationSeconds: null,
        source: `${txtRel} -> paragraph 1`,
        sourceNote: `never spoken; only feeds scene-${totalParagraphs - 1}'s displayed body`,
        ttsText: null,
        generatedFromText: null,
        matchesGeneratedAudio: null,
        builtScene,
        manifestKey: null
      });
      continue;
    }

    let wavName;
    let source;
    let sourceNote = null;
    let ttsText;
    let manifestKey = sceneId;
    let outletKey = null;
    let outletName = null;

    if (role === 'outro') {
      wavName = 'outro-open-question.wav';
      manifestKey = 'outro';
      const outroQuestion = !Array.isArray(visualScript) ? visualScript?.outroQuestion : '';
      if (outroQuestion) {
        source = `${folderRel}/visual-script.json -> "outroQuestion"`;
        sourceNote = 'outroQuestion wins over the txt paragraph';
        ttsText = outroQuestion;
      } else {
        source = `${txtRel} -> paragraph ${totalParagraphs}`;
        sourceNote = 'last paragraph; used because visual-script.json has no outroQuestion';
        ttsText = paragraphs[totalParagraphs - 1];
      }
    } else if (role === 'closing') {
      wavName = `${sceneId}-${sceneId}.wav`;
      source = `${txtRel} -> paragraph ${sceneNumber}`;
      sourceNote = 'penultimate summary; becomes scene audioText — TTS reads ONLY this, not the displayed body';
      ttsText = paragraphs[sceneNumber - 1];
    } else {
      outletKey = outletEntry?.outletKey ?? builtScene?.outlet?.key ?? null;
      outletName = outletEntry?.outletName ?? builtScene?.outlet?.name ?? null;
      wavName = `${sceneId}-${outletKey ?? '<outletKey>'}.wav`;
      source = `${txtRel} -> paragraph ${sceneNumber}`;
      sourceNote = `the whole paragraph is the TTS text for ${outletName ?? 'unknown outlet'}`;
      ttsText = paragraphs[sceneNumber - 1];
    }

    const wavExists = wavName ? fs.existsSync(path.join(briefingFolder, 'audio', wavName)) : false;
    const manifestEntry = manifest?.audioByScene?.[manifestKey] ?? null;
    const manifestFullEntry = manifest?.entries?.find((entry) => entry.sceneId === manifestKey) ?? null;
    const generatedFromText = manifestFullEntry?.text ?? null;
    const matchesGeneratedAudio = generatedFromText === null
      ? null
      : normalizeSpacing(generatedFromText) === normalizeSpacing(ttsText);

    entries.push({
      sceneNumber,
      sceneId,
      role,
      hasAudio: true,
      outletKey,
      outletName,
      wavFile: `${folderRel}/audio/${wavName}`,
      wavExists,
      wavDurationSeconds: manifestEntry?.durationSeconds ?? null,
      source,
      sourceNote,
      ttsText,
      generatedFromText,
      matchesGeneratedAudio,
      builtScene,
      manifestKey
    });
  }

  return {
    folderRel,
    txtPath,
    txtRel,
    totalParagraphs,
    paragraphs,
    visualScript,
    outletMap,
    briefing,
    manifest,
    entries
  };
};
