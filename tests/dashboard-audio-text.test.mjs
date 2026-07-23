import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {audioEntries, saveTextOverride} from '../dashboard/audio.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

const createContext = () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-dashboard-audio-'));
  const output = path.join(folder, 'output');
  const audioDir = path.join(folder, 'audio');
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'briefing.json'), JSON.stringify({
    scenes: [
      {
        id: 'scene-11',
        title: 'خلاصة المشهد',
        body: 'خلاصة المشهد تقول إن الانقسام لم يعد بين حرب وسلم فقط.',
        durationSeconds: 8,
        outlet: null
      }
    ],
    outro: null
  }, null, 2));

  return {
    repoRoot,
    date: '2026-06-26',
    folder,
    folderRel: path.relative(repoRoot, folder).replace(/\\/g, '/'),
    output,
    audioDir
  };
};

const createContextWithClosingScene = (sceneId) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-dashboard-audio-'));
  const output = path.join(folder, 'output');
  const audioDir = path.join(folder, 'audio');
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'briefing.json'), JSON.stringify({
    scenes: [
      {
        id: sceneId,
        title: 'خلاصة المشهد',
        body: 'خلاصة المشهد تقول إن الانقسام لم يعد بين حرب وسلم فقط.',
        durationSeconds: 8,
        outlet: null
      }
    ],
    outro: {
      title: 'السؤال المفتوح',
      body: 'هل يستطيع لبنان تحويل الانسحاب إلى استعادة دولة؟',
      durationSeconds: 6
    }
  }, null, 2));

  return {
    repoRoot,
    date: '2026-07-15',
    folder,
    folderRel: path.relative(repoRoot, folder).replace(/\\/g, '/'),
    output,
    audioDir
  };
};

test('dashboard scene-11 editable text includes the daily question handoff suffix', () => {
  const ctx = createContext();
  const [entry] = audioEntries(ctx, {audio: {}});

  assert.equal(entry.sceneId, 'scene-11');
  assert.equal(
    entry.effectiveText,
    'خلاصة المشهد تقول إن الانقسام لم يعد بين حرب وسلم فقط. ... وهيك منوصل لسؤال اليوم'
  );
});

test('dashboard scene-11 saved override is materialized with the suffix', () => {
  const ctx = createContext();
  saveTextOverride(ctx, 'scene-11', 'النص المعدل لخلاصة المشهد.');

  const [entry] = audioEntries(ctx, {audio: {}});
  assert.equal(entry.effectiveText, 'النص المعدل لخلاصة المشهد. ... وهيك منوصل لسؤال اليوم');
  assert.equal(entry.overrideText, 'النص المعدل لخلاصة المشهد. ... وهيك منوصل لسؤال اليوم');
});

test('dashboard scene-11 legacy handoff suffix is normalized', () => {
  const ctx = createContext();
  fs.mkdirSync(ctx.audioDir, {recursive: true});
  fs.writeFileSync(path.join(ctx.audioDir, 'text-overrides.json'), JSON.stringify({
    overrides: {
      'scene-11': {
        text: 'النص المعدل لخلاصة المشهد... .. ... وهيك منوصل لسؤال اليوم'
      }
    }
  }));

  const [entry] = audioEntries(ctx, {audio: {}});
  assert.equal(entry.effectiveText, 'النص المعدل لخلاصة المشهد ... وهيك منوصل لسؤال اليوم');
  assert.equal(entry.overrideText, 'النص المعدل لخلاصة المشهد ... وهيك منوصل لسؤال اليوم');
});

test('dashboard closing scene gets the question handoff even when it is scene-10', () => {
  const ctx = createContextWithClosingScene('scene-10');
  const [entry] = audioEntries(ctx, {audio: {}});

  assert.equal(entry.sceneId, 'scene-10');
  assert.equal(
    entry.effectiveText,
    'خلاصة المشهد تقول إن الانقسام لم يعد بين حرب وسلم فقط. ... وهيك منوصل لسؤال اليوم'
  );
});
