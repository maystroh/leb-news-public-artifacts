import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {MAX_DUEL_AUDIO_WORDS, validateBriefingAnalysisFolder} from '../scripts/lib/validate-briefing-analysis.mjs';

const writeJson = (folder, fileName, value) => {
  fs.writeFileSync(path.join(folder, fileName), JSON.stringify(value, null, 2));
};

function makeValidAnalysisFolder({audioText = 'الحدث هو "اختبار"، "الأخبار" قالت عنو "موقف أول"، و"المدن" قالت عنو "موقف ثان".'} = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'briefing-analysis-'));
  writeJson(folder, 'visual-script.json', {
    outroQuestion: 'ما السؤال؟',
    scenes: [{sceneId: 'scene-1', headline: 'عنوان', summary: 'ملخص', quote: 'اقتباس'}]
  });
  writeJson(folder, 'outlet-map.json', [
    {sceneId: 'scene-2', outletKey: 'alakhbar', outletName: 'الأخبار', logoFile: 'alakhbar-logo.png'}
  ]);
  writeJson(folder, 'quote-duel.json', {
    scenes: [{
      eventLabel: 'حدث',
      contrastLabel: 'تباين',
      summary: 'ملخص',
      audioText,
      left: {outlet: 'الأخبار', quote: 'اقتباس أول'},
      right: {outlet: 'المدن', quote: 'اقتباس ثان'}
    }]
  });
  writeJson(folder, 'fault-line-map-script.json', {
    axis: {id: 'axis', label: 'خريطة', leftPole: 'يسار', rightPole: 'يمين'},
    entries: [{sceneId: 'scene-2', stanceLabel: 'موقف', rationale: 'سبب', quote: 'اقتباس', position: 0.5}],
    synthesis: {headline: 'خلاصة', summary: 'ملخص'}
  });
  writeJson(folder, 'keyword-radar-script.json', {
    entries: [{
      sceneId: 'scene-2',
      sceneLabel: 'مشهد',
      terms: [
        {text: 'أول', family: 'سياسة'},
        {text: 'ثان', family: 'سياسة'},
        {text: 'ثالث', family: 'سياسة'}
      ]
    }],
    clusters: [{id: 'cluster', label: 'عنقود', position: {x: 0.5, y: 0.5}}],
    synthesis: {headline: 'خلاصة', summary: 'ملخص'}
  });
  return folder;
}

test('validateBriefingAnalysisFolder accepts compact duel audioText', () => {
  const folder = makeValidAnalysisFolder();
  assert.deepEqual(validateBriefingAnalysisFolder(folder), []);
});

test('validateBriefingAnalysisFolder rejects duel audioText above the 25s word budget', () => {
  const longAudioText = Array.from({length: MAX_DUEL_AUDIO_WORDS + 1}, (_, index) => `كلمة${index}`).join(' ');
  const folder = makeValidAnalysisFolder({audioText: longAudioText});
  const errors = validateBriefingAnalysisFolder(folder);
  assert.ok(errors.some((error) => error.includes(`audioText should be ${MAX_DUEL_AUDIO_WORDS} words or fewer`)));
});
