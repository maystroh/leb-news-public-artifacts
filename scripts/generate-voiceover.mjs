import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import OpenAI from 'openai';
import mp3DurationCb from 'mp3-duration';

const mp3Duration = promisify(mp3DurationCb);

const narrationPath = path.join(process.cwd(), 'src', 'data', 'narration.json');
const manifestPath = path.join(process.cwd(), 'src', 'data', 'voiceover-manifest.json');
const audioDir = path.join(process.cwd(), 'public', 'audio', 'briefing');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const forceOverwrite = args.has('--force');

const narration = JSON.parse(fs.readFileSync(narrationPath, 'utf8'));

const model = process.env.OPENAI_TTS_MODEL || narration.voiceoverDefaults.model;
const voice = process.env.OPENAI_TTS_VOICE || narration.voiceoverDefaults.voice;
const speed = Number(process.env.OPENAI_TTS_SPEED || narration.voiceoverDefaults.speed);
const responseFormat = process.env.OPENAI_TTS_FORMAT || narration.voiceoverDefaults.responseFormat;
const instructions =
  process.env.OPENAI_TTS_INSTRUCTIONS || narration.voiceoverDefaults.instructions;

if (!Number.isFinite(speed) || speed <= 0) {
  throw new Error(`Invalid OPENAI_TTS_SPEED value: ${process.env.OPENAI_TTS_SPEED}`);
}

for (const section of narration.sections) {
  if (section.text.length > 4096) {
    throw new Error(
      `Section "${section.id}" is ${section.text.length} characters. The speech endpoint supports up to 4096 characters per request.`
    );
  }
}

fs.mkdirSync(audioDir, {recursive: true});

const openai = isDryRun
  ? null
  : new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

if (!isDryRun && !process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required unless you run with --dry-run.');
}

const writeAudioFile = async (section, outputPath) => {
  const speech = await openai.audio.speech.create({
    model,
    voice,
    input: section.text,
    instructions,
    response_format: responseFormat,
    speed
  });

  const buffer = Buffer.from(await speech.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
};

const entries = [];

for (const section of narration.sections) {
  const fileName = `${section.id}.${responseFormat}`;
  const outputPath = path.join(audioDir, fileName);
  const publicPath = `/audio/briefing/${fileName}`;

  if (isDryRun) {
    entries.push({
      id: section.id,
      kind: section.kind,
      title: section.title,
      sceneId: section.sceneId,
      sceneIndex: section.sceneIndex ?? null,
      text: section.text,
      chars: section.text.length,
      audioPath: publicPath,
      durationSeconds: null,
      sourceDurationSeconds: section.durationSeconds,
      status: 'dry-run'
    });
    continue;
  }

  if (!forceOverwrite && fs.existsSync(outputPath)) {
    const existingDuration = await mp3Duration(outputPath);
    entries.push({
      id: section.id,
      kind: section.kind,
      title: section.title,
      sceneId: section.sceneId,
      sceneIndex: section.sceneIndex ?? null,
      text: section.text,
      chars: section.text.length,
      audioPath: publicPath,
      durationSeconds: Number(existingDuration.toFixed(3)),
      sourceDurationSeconds: section.durationSeconds,
      status: 'reused'
    });
    continue;
  }

  await writeAudioFile(section, outputPath);
  const duration = await mp3Duration(outputPath);

  entries.push({
    id: section.id,
    kind: section.kind,
    title: section.title,
    sceneId: section.sceneId,
    sceneIndex: section.sceneIndex ?? null,
    text: section.text,
    chars: section.text.length,
    audioPath: publicPath,
    durationSeconds: Number(duration.toFixed(3)),
    sourceDurationSeconds: section.durationSeconds,
    status: 'generated'
  });
}

const manifest = {
  meta: {
    generatedAt: new Date().toISOString(),
    sourceNarrationPath: narrationPath,
    model,
    voice,
    speed,
    responseFormat,
    instructions,
    dryRun: isDryRun,
    totalSections: entries.length
  },
  entries
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `${isDryRun ? 'Prepared dry-run voiceover manifest' : 'Prepared voiceover manifest'} at ${manifestPath}`
);
