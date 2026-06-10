import fs from 'node:fs';
import path from 'node:path';

const briefingPath = path.join(process.cwd(), 'src', 'data', 'briefing.json');
const outputPath = path.join(process.cwd(), 'src', 'data', 'narration.json');

const briefing = JSON.parse(fs.readFileSync(briefingPath, 'utf8'));

const normalizeSpacing = (value) => value.replace(/\s+/g, ' ').trim();

const joinParts = (...parts) =>
  normalizeSpacing(
    parts
      .flat()
      .filter(Boolean)
      .join(' ')
  );

const buildSceneNarrationText = (scene) => {
  const title = normalizeSpacing(scene.title ?? '');
  const body = normalizeSpacing(scene.body ?? '');

  if (!title) {
    return body;
  }

  if (!body) {
    return title;
  }

  if (body.startsWith(title)) {
    return body;
  }

  return joinParts(title, body);
};

const sections = [
  {
    id: 'intro',
    kind: 'intro',
    title: briefing.intro.title,
    sceneId: null,
    durationSeconds: briefing.intro.durationSeconds,
    text: joinParts(
      briefing.meta.title,
      briefing.meta.dateLabel,
      briefing.intro.eyebrow,
      briefing.intro.title,
      briefing.intro.subtitle
    )
  },
  ...briefing.scenes.map((scene, index) => ({
    id: scene.id,
    kind: 'scene',
    title: scene.title,
    sceneId: scene.id,
    sceneIndex: index,
    durationSeconds: scene.durationSeconds,
    text: buildSceneNarrationText(scene)
  })),
  {
    id: 'outro',
    kind: 'outro',
    title: briefing.outro.title,
    sceneId: null,
    durationSeconds: briefing.outro.durationSeconds,
    text: joinParts(briefing.outro.title, briefing.outro.body)
  }
];

const narration = {
  meta: {
    generatedAt: new Date().toISOString(),
    sourceBriefingPath: briefingPath,
    title: briefing.meta.title,
    dateLabel: briefing.meta.dateLabel,
    totalSections: sections.length
  },
  voiceoverDefaults: {
    model: 'gpt-4o-mini-tts',
    voice: 'coral',
    speed: 0.96,
    responseFormat: 'mp3',
    instructions:
      'Speak in clear Modern Standard Arabic with a calm, authoritative Lebanese news briefing tone. Use natural pauses and precise pronunciation.'
  },
  sections
};

fs.writeFileSync(outputPath, JSON.stringify(narration, null, 2));

console.log(`Prepared narration data at ${outputPath}`);
