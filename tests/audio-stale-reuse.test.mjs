import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const getStableHash = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
};

const textFingerprint = (value) => getStableHash(normalize(value));

const writeDummyWav = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(0, 40);
  fs.writeFileSync(filePath, buffer);
};

const runAudio = (folder, args = ['--existing-only']) => {
  const result = spawnSync(
    process.execPath,
    ['./audio/generate-outlet-audio.mjs', '--folder', folder, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
};

const runAudioExistingOnly = (folder) => runAudio(folder);

const createBriefingFolder = ({oldText, currentText, sceneId = 'scene-3'}) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-audio-stale-'));
  const audioDir = path.join(folder, 'audio');
  const outputDir = path.join(folder, 'output');
  const audioPath = path.join(audioDir, `${sceneId}-test-outlet.wav`);
  const relativeAudioPath = path.relative(repoRoot, audioPath).replace(/\\/g, '/');

  fs.mkdirSync(outputDir, {recursive: true});
  writeDummyWav(audioPath);
  fs.writeFileSync(path.join(outputDir, 'briefing.json'), JSON.stringify({
    scenes: [
      {
        id: sceneId,
        title: 'Test scene',
        body: currentText,
        durationSeconds: 6,
        outlet: {
          key: 'test-outlet',
          name: 'Test Outlet',
          logoFile: 'test.png',
          logoPath: '/outlet-logos/test.png'
        }
      }
    ],
    outro: null
  }, null, 2));
  fs.writeFileSync(path.join(audioDir, 'manifest.json'), JSON.stringify({
    entries: [
      {
        sceneId,
        audioPath: relativeAudioPath,
        text: oldText,
        source: 'ai',
        status: 'generated'
      }
    ]
  }, null, 2));

  return {folder, relativeAudioPath};
};

{
  const {folder, relativeAudioPath} = createBriefingFolder({
    oldText: 'Old edited narration from the prior date.',
    currentText: 'Current date narration after the latest edit.'
  });

  runAudioExistingOnly(folder);

  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'audio', 'manifest.json'), 'utf8'));
  const entry = manifest.entries[0];
  assert.equal(entry.status, 'stale');
  assert.equal(entry.audioPath, null);
  assert.equal(entry.staleAudioPath, relativeAudioPath);
  assert.equal(manifest.audioByScene['scene-3'].audioPath, null);
  assert.equal(manifest.audioByScene['scene-3'].status, 'stale');
}

{
  const currentText = 'Current briefing text should win over copied stale overrides.';
  const oldSourceText = 'Different source text from the copied prior date.';
  const {folder} = createBriefingFolder({
    oldText: currentText,
    currentText
  });
  fs.writeFileSync(path.join(folder, 'audio', 'text-overrides.json'), JSON.stringify({
    meta: {
      schema: 'text-overrides/v2',
      dateLabel: '2026-06-19'
    },
    overrides: {
      'scene-3': {
        text: 'Stale copied override that must not be read.',
        defaultTextHash: textFingerprint(oldSourceText)
      }
    }
  }, null, 2));

  runAudio(folder, ['--dry-run']);

  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'audio', 'manifest.json'), 'utf8'));
  assert.equal(manifest.entries[0].text, currentText);
  assert.equal(manifest.entries[0].textSource, 'body');
}

{
  const currentText = 'Current briefing text with a deliberate same-date edit.';
  const overrideText = 'Same-date override should feed TTS.';
  const {folder} = createBriefingFolder({
    oldText: currentText,
    currentText
  });
  fs.writeFileSync(path.join(folder, 'audio', 'text-overrides.json'), JSON.stringify({
    meta: {
      schema: 'text-overrides/v2',
      dateLabel: '2026-06-20'
    },
    overrides: {
      'scene-3': {
        text: overrideText,
        defaultTextHash: textFingerprint(currentText)
      }
    }
  }, null, 2));

  runAudio(folder, ['--dry-run']);

  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'audio', 'manifest.json'), 'utf8'));
  assert.equal(manifest.entries[0].text, overrideText);
  assert.equal(manifest.entries[0].textSource, 'override');
}

{
  const currentText = 'نبدأ من الأخبار، التي عنونت: «أميركا تعلن وقفاً جديداً».';
  const {folder} = createBriefingFolder({
    oldText: currentText,
    currentText,
    sceneId: 'scene-2'
  });

  runAudio(folder, ['--dry-run']);

  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'audio', 'manifest.json'), 'utf8'));
  assert.equal(
    manifest.entries[0].text,
    'صباح الخير من رادار بيروت؛ بملخص الصحافة اليوم منبلش من Test Outlet، نبدأ من الأخبار، التي عنونت: «أميركا تعلن وقفاً جديداً».'
  );
  assert.equal(manifest.entries[0].textSource, 'body');
}

{
  const currentText = 'Default scene 2 body should be replaced by the edited narration.';
  const overrideText = 'صباح الخير من رادار بيروت بملخص الصحافة اليوم 🙂 البداية من جريدة الأخبار، التي عنونت: «أميركا تعلن وقفاً جديداً».';
  const {folder} = createBriefingFolder({
    oldText: currentText,
    currentText,
    sceneId: 'scene-2'
  });
  fs.writeFileSync(path.join(folder, 'audio', 'text-overrides.json'), JSON.stringify({
    'scene-2': overrideText
  }, null, 2));

  runAudio(folder, ['--dry-run']);

  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'audio', 'manifest.json'), 'utf8'));
  assert.equal(manifest.entries[0].text, overrideText);
  assert.equal(manifest.entries[0].captionText, 'البداية من جريدة الأخبار، التي عنونت: «أميركا تعلن وقفاً جديداً».');
  assert.equal(manifest.entries[0].textSource, 'override');
  assert.equal(
    manifest.entries[0].text.includes('صباح الخير من رادار بيروت؛ بملخص الصحافة اليوم منبلش من'),
    false
  );
}

{
  const text = 'Same narration text may reuse the existing WAV.';
  const {folder, relativeAudioPath} = createBriefingFolder({
    oldText: text,
    currentText: text
  });

  runAudioExistingOnly(folder);

  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'audio', 'manifest.json'), 'utf8'));
  const entry = manifest.entries[0];
  assert.equal(entry.status, 'reused');
  assert.equal(entry.audioPath, relativeAudioPath);
  assert.equal(manifest.audioByScene['scene-3'].audioPath, relativeAudioPath);
  assert.equal(manifest.audioByScene['scene-3'].status, 'reused');
}

{
  const currentText = 'خلاصة المشهد تقول إن الانقسام لم يعد بين حرب وسلم فقط.';
  const {folder} = createBriefingFolder({
    oldText: currentText,
    currentText,
    sceneId: 'scene-11'
  });

  runAudio(folder, ['--dry-run']);

  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'audio', 'manifest.json'), 'utf8'));
  assert.equal(
    manifest.entries[0].text,
    'خلاصة المشهد تقول إن الانقسام لم يعد بين حرب وسلم فقط. .. ... وهيك منوصل لسؤال اليوم'
  );
}

{
  const currentText = 'نص المشهد الأصلي.';
  const overrideText = 'النص المعدل لخلاصة المشهد.';
  const {folder} = createBriefingFolder({
    oldText: currentText,
    currentText,
    sceneId: 'scene-11'
  });
  fs.writeFileSync(path.join(folder, 'audio', 'text-overrides.json'), JSON.stringify({
    meta: {
      schema: 'text-overrides/v2',
      dateLabel: '2026-06-26'
    },
    overrides: {
      'scene-11': {
        text: overrideText,
        defaultTextHash: textFingerprint(`${currentText} .. ... وهيك منوصل لسؤال اليوم`)
      }
    }
  }, null, 2));

  runAudio(folder, ['--dry-run']);

  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'audio', 'manifest.json'), 'utf8'));
  assert.equal(manifest.entries[0].text, `${overrideText} .. ... وهيك منوصل لسؤال اليوم`);
  assert.equal(manifest.entries[0].textSource, 'override');
}
