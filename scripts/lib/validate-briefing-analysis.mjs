import fs from 'node:fs';
import path from 'node:path';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isFilledString = (value) => typeof value === 'string' && value.trim() !== '';
const isNumberInRange = (value, min, max) => typeof value === 'number' && value >= min && value <= max;

const readJsonFile = (filePath, errors) => {
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing file: ${path.basename(filePath)}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
};

const requireFilled = (errors, source, value, fieldPath) => {
  if (!isFilledString(value)) {
    errors.push(`${source} requires ${fieldPath}`);
  }
};

const requireArray = (errors, source, value, fieldPath) => {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${source} requires non-empty ${fieldPath}`);
    return [];
  }

  return value;
};

export const validateBriefingAnalysisFolder = (briefingFolder) => {
  const errors = [];
  const read = (fileName) => readJsonFile(path.join(briefingFolder, fileName), errors);

  const visualScript = read('visual-script.json');
  const outletMap = read('outlet-map.json');
  const quoteDuel = read('quote-duel.json');
  const faultLineScript = read('fault-line-map-script.json');
  const keywordRadarScript = read('keyword-radar-script.json');

  if (visualScript) {
    if (!Array.isArray(visualScript)) {
      requireFilled(errors, 'visual-script.json', visualScript.outroQuestion, 'outroQuestion');
    }

    const visualScenes = Array.isArray(visualScript) ? visualScript : visualScript.scenes;
    requireArray(errors, 'visual-script.json', visualScenes, 'scene entries').forEach((entry, index) => {
      const prefix = `visual-script.json[${index}]`;
      requireFilled(errors, prefix, entry?.sceneId, 'sceneId');
      requireFilled(errors, prefix, entry?.headline, 'headline');
      requireFilled(errors, prefix, entry?.summary, 'summary');
      requireFilled(errors, prefix, entry?.quote, 'quote');
    });
  }

  if (outletMap) {
    requireArray(errors, 'outlet-map.json', outletMap, 'outlet entries').forEach((entry, index) => {
      const prefix = `outlet-map.json[${index}]`;
      requireFilled(errors, prefix, entry?.sceneId, 'sceneId');
      requireFilled(errors, prefix, entry?.outletKey, 'outletKey');
      requireFilled(errors, prefix, entry?.outletName, 'outletName');
      requireFilled(errors, prefix, entry?.logoFile, 'logoFile');
    });
  }

  if (quoteDuel) {
    requireArray(errors, 'quote-duel.json', quoteDuel.scenes, 'scenes').forEach((scene, index) => {
      const prefix = `quote-duel.json.scenes[${index}]`;
      requireFilled(errors, prefix, scene?.eventLabel, 'eventLabel');
      requireFilled(errors, prefix, scene?.contrastLabel, 'contrastLabel');
      requireFilled(errors, prefix, scene?.summary, 'summary');
      requireFilled(errors, prefix, scene?.left?.outlet, 'left.outlet');
      requireFilled(errors, prefix, scene?.left?.quote, 'left.quote');
      requireFilled(errors, prefix, scene?.right?.outlet, 'right.outlet');
      requireFilled(errors, prefix, scene?.right?.quote, 'right.quote');
    });
  }

  if (faultLineScript) {
    for (const field of ['id', 'label', 'leftPole', 'rightPole']) {
      requireFilled(errors, 'fault-line-map-script.json', faultLineScript.axis?.[field], `axis.${field}`);
    }

    requireArray(errors, 'fault-line-map-script.json', faultLineScript.entries, 'entries').forEach((entry, index) => {
      const prefix = `fault-line-map-script.json.entries[${index}]`;
      requireFilled(errors, prefix, entry?.sceneId, 'sceneId');
      requireFilled(errors, prefix, entry?.stanceLabel, 'stanceLabel');
      requireFilled(errors, prefix, entry?.rationale, 'rationale');
      requireFilled(errors, prefix, entry?.quote, 'quote');
      if (!isNumberInRange(entry?.position, 0, 1)) {
        errors.push(`${prefix} requires position between 0 and 1`);
      }
    });

    requireFilled(errors, 'fault-line-map-script.json', faultLineScript.synthesis?.headline, 'synthesis.headline');
    requireFilled(errors, 'fault-line-map-script.json', faultLineScript.synthesis?.summary, 'synthesis.summary');
  }

  if (keywordRadarScript) {
    requireArray(errors, 'keyword-radar-script.json', keywordRadarScript.entries, 'entries').forEach((entry, index) => {
      const prefix = `keyword-radar-script.json.entries[${index}]`;
      requireFilled(errors, prefix, entry?.sceneId, 'sceneId');
      requireFilled(errors, prefix, entry?.sceneLabel, 'sceneLabel');
      const terms = Array.isArray(entry?.terms) ? entry.terms : [];
      if (terms.length < 3) {
        errors.push(`${prefix} requires at least 3 terms`);
      }
      terms.forEach((term, termIndex) => {
        requireFilled(errors, prefix, term?.text, `terms[${termIndex}].text`);
        requireFilled(errors, prefix, term?.family, `terms[${termIndex}].family`);
      });
    });

    requireArray(errors, 'keyword-radar-script.json', keywordRadarScript.clusters, 'clusters').forEach((cluster, index) => {
      const prefix = `keyword-radar-script.json.clusters[${index}]`;
      requireFilled(errors, prefix, cluster?.id, 'id');
      requireFilled(errors, prefix, cluster?.label, 'label');
      if (!isObject(cluster?.position) || !isNumberInRange(cluster.position.x, 0, 1) || !isNumberInRange(cluster.position.y, 0, 1)) {
        errors.push(`${prefix} requires position.x and position.y between 0 and 1`);
      }
    });

    requireFilled(errors, 'keyword-radar-script.json', keywordRadarScript.synthesis?.headline, 'synthesis.headline');
    requireFilled(errors, 'keyword-radar-script.json', keywordRadarScript.synthesis?.summary, 'synthesis.summary');
  }

  return errors;
};
