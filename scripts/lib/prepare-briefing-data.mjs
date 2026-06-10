import fs from 'node:fs';
import path from 'node:path';

const stripPunctuation = (value) =>
  value.replace(/[.,/#!$%^&*;:{}=\-_`~()\u061f!"'\u060c\u00ab\u00bb]/g, ' ').replace(/\s+/g, ' ').trim();

const estimateSceneDuration = (text) => {
  const words = stripPunctuation(text).split(' ').filter(Boolean).length;
  return Math.max(6, Math.min(18, Math.ceil(words / 18)));
};

const FALLBACK_SCENE_LABEL = '\u0627\u0644\u0645\u0634\u0647\u062f';
const CLOSING_SCENE_LABEL = '\u062e\u0644\u0627\u0635\u0629 \u0627\u0644\u0645\u0634\u0647\u062f';
const BRIEFING_TITLE = '\u0627\u0644\u0625\u062d\u0627\u0637\u0629 \u0627\u0644\u0635\u062d\u0641\u064a\u0629 \u0627\u0644\u064a\u0648\u0645\u064a\u0629';
const INTRO_EYEBROW = '';
const INTRO_TITLE = '\u0627\u0644\u0635\u062d\u0627\u0641\u0629 \u0627\u0644\u064a\u0648\u0645';
const OUTRO_TITLE = '\u0627\u0644\u0633\u0624\u0627\u0644 \u0627\u0644\u0645\u0641\u062a\u0648\u062d';
const OUTRO_BODY = '\u0645\u0627\u0630\u0627 \u0628\u0639\u062f \u0627\u0644\u062c\u0648\u0644\u0629 \u0627\u0644\u0631\u0627\u0628\u0639\u0629 \u0641\u064a \u0627\u0644\u0628\u0646\u062a\u0627\u063a\u0648\u0646\u061f';

export const buildPreparedBriefingData = ({
  briefingPath,
  outletMap,
  visualScript,
  faultLineScript,
  keywordRadarScript
}) => {
  const visualEntries = Array.isArray(visualScript) ? visualScript : (visualScript?.scenes ?? []);
  const outroQuestion = Array.isArray(visualScript) ? '' : (visualScript?.outroQuestion ?? '');
  const outletBySceneId = new Map(outletMap.map((entry) => [entry.sceneId, entry]));
  const visualBySceneId = new Map(visualEntries.map((entry) => [entry.sceneId, entry]));

  const raw = fs.readFileSync(briefingPath, 'utf8').trim();
  const paragraphs = raw
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const dateLabel = path.basename(path.dirname(briefingPath));

  const baseScenes = paragraphs.map((paragraph, index) => {
    const sceneId = `scene-${index + 1}`;
    const outlet = outletBySceneId.get(sceneId) ?? null;
    const visual = visualBySceneId.get(sceneId) ?? null;
    const shortLabel = outlet ? outlet.outletName : `${FALLBACK_SCENE_LABEL} ${index + 1}`;
    const title = paragraph.split(/[.\u061f!]/)[0].slice(0, 90).trim();

    return {
      id: sceneId,
      shortLabel,
      title,
      body: paragraph,
      durationSeconds: estimateSceneDuration(paragraph),
      visual: visual
        ? {
            headline: visual.headline,
            summary: visual.summary,
            quote: visual.quote
          }
        : null,
      outlet: outlet
        ? {
            key: outlet.outletKey,
            name: outlet.outletName,
            logoFile: outlet.logoFile,
            logoPath: `/outlet-logos/${outlet.logoFile}`
          }
        : null
    };
  });

  let scenes = baseScenes;
  const baseOutro = {
    title: OUTRO_TITLE,
    body: OUTRO_BODY,
    durationSeconds: 5
  };

  if (baseScenes.length >= 3) {
    const openingScene = baseScenes[0];
    const summaryScene = baseScenes[baseScenes.length - 2];
    const questionScene = baseScenes[baseScenes.length - 1];
    const outletScenes = baseScenes.slice(1, -2);

    scenes = [
      ...outletScenes,
      {
        ...summaryScene,
        shortLabel: CLOSING_SCENE_LABEL,
        title: CLOSING_SCENE_LABEL,
        body: `${openingScene.body}\n\n${summaryScene.body}`,
        audioText: summaryScene.body,
        durationSeconds: Math.max(7, summaryScene.durationSeconds ?? 0),
        visual: summaryScene.visual
          ? {
              headline: summaryScene.visual.headline || CLOSING_SCENE_LABEL,
              summary: summaryScene.visual.summary,
              quote: summaryScene.visual.quote
            }
          : {
              headline: CLOSING_SCENE_LABEL,
              summary: '',
              quote: ''
            },
        outlet: null
      }
    ];

    baseOutro.body = outroQuestion || questionScene.body || baseOutro.body;
    baseOutro.durationSeconds = Math.max(5, questionScene.durationSeconds ?? 0);
  }

  const generatedAt = new Date().toISOString();
  const briefingData = {
    meta: {
      sourcePath: briefingPath,
      generatedAt,
      totalScenes: scenes.length,
      title: BRIEFING_TITLE,
      dateLabel
    },
    intro: {
      eyebrow: INTRO_EYEBROW,
      title: INTRO_TITLE,
      subtitle: '',
      durationSeconds: 8,
      textRevealSeconds: 6
    },
    scenes,
    outro: baseOutro
  };

  const briefingBySceneId = new Map(briefingData.scenes.map((scene) => [scene.id, scene]));
  const faultLineEntries = faultLineScript.entries.map((entry, index) => {
    const scene = briefingBySceneId.get(entry.sceneId);

    if (!scene) {
      throw new Error(`Fault line entry references unknown scene: ${entry.sceneId}`);
    }

    if (!scene.outlet) {
      throw new Error(`Fault line entry requires an outlet-mapped scene: ${entry.sceneId}`);
    }

    return {
      id: `fault-line-${index + 1}`,
      sceneId: entry.sceneId,
      outlet: scene.outlet,
      headline: entry.headline ?? scene.visual?.headline ?? scene.title,
      rationale: entry.rationale ?? scene.visual?.summary ?? scene.body,
      quote: entry.quote ?? scene.visual?.quote ?? '',
      stanceLabel: entry.stanceLabel ?? '',
      position: entry.position,
      durationSeconds: entry.durationSeconds ?? 3
    };
  });

  const requiredAxisFields = ['id', 'label', 'leftPole', 'rightPole'];
  for (const field of requiredAxisFields) {
    if (!faultLineScript.axis?.[field]) {
      throw new Error(`Fault line map requires a daily axis field: axis.${field}`);
    }
  }

  const leftMostEntry = faultLineEntries.reduce((best, entry) => (entry.position < best.position ? entry : best), faultLineEntries[0]);
  const rightMostEntry = faultLineEntries.reduce((best, entry) => (entry.position > best.position ? entry : best), faultLineEntries[0]);
  const bridgeEntry = faultLineEntries.reduce((best, entry) => {
    const distance = Math.abs(entry.position - 0.5);
    const bestDistance = Math.abs(best.position - 0.5);
    return distance < bestDistance ? entry : best;
  }, faultLineEntries[0]);

  const faultLineData = {
    meta: {
      sourcePath: briefingPath,
      generatedAt,
      dateLabel,
      mode: 'fault-line-map',
      totalEntries: faultLineEntries.length
    },
    intro: faultLineScript.intro,
    axis: faultLineScript.axis,
    entries: faultLineEntries,
    synthesis: {
      ...faultLineScript.synthesis,
      leftMostOutlet: leftMostEntry.outlet.name,
      rightMostOutlet: rightMostEntry.outlet.name,
      bridgeOutlet: bridgeEntry.outlet.name
    },
    outro: faultLineScript.outro
  };

  const keywordRadarEntries = keywordRadarScript.entries.map((entry, index) => {
    const scene = briefingBySceneId.get(entry.sceneId);

    if (!scene) {
      throw new Error(`Keyword radar entry references unknown scene: ${entry.sceneId}`);
    }

    if (!scene.outlet) {
      throw new Error(`Keyword radar entry requires an outlet-mapped scene: ${entry.sceneId}`);
    }

    return {
      id: `keyword-radar-${index + 1}`,
      sceneId: entry.sceneId,
      outlet: scene.outlet,
      sceneLabel: entry.sceneLabel ?? scene.visual?.headline ?? scene.title,
      summary: entry.summary ?? scene.visual?.summary ?? '',
      terms: (entry.terms ?? []).map((term, termIndex) => ({
        id: `${scene.id}-term-${termIndex + 1}`,
        text: term.text,
        family: term.family,
        weight: term.weight ?? 0.7
      })),
      durationSeconds: entry.durationSeconds ?? 5
    };
  });

  const keywordRadarData = {
    meta: {
      sourcePath: briefingPath,
      generatedAt,
      dateLabel,
      mode: 'keyword-radar',
      totalEntries: keywordRadarEntries.length
    },
    intro: keywordRadarScript.intro,
    entries: keywordRadarEntries,
    clusters: keywordRadarScript.clusters,
    synthesis: keywordRadarScript.synthesis,
    outro: keywordRadarScript.outro
  };

  return {
    briefingData,
    faultLineData,
    keywordRadarData
  };
};
