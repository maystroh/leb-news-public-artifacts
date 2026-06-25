import assert from 'node:assert/strict';
import test from 'node:test';

import {buildCodexPrompt} from '../scripts/lib/briefing-analysis-pack.mjs';

test('Codex handoff prompt asks Step 3 to write short per-duel audioText', () => {
  const prompt = buildCodexPrompt({
    dateLabel: '2026-06-25',
    briefingFolder: '/tmp/briefings/2026-06-25',
    briefingFolderRelative: 'briefings/2026-06-25',
    briefingFolderTerminalPath: '/tmp/briefings/2026-06-25',
    briefingFolderWindowsPath: 'C:\\briefings\\2026-06-25',
    briefingFileName: 'briefing_2026-06-25_corrected.txt',
    briefingText: 'فقرة أولى.\n\nفقرة ثانية؟',
    paragraphBlocks: ['فقرة أولى.', 'فقرة ثانية؟']
  });

  assert.match(prompt, /every scene must include `audioText`/);
  assert.match(prompt, /under 25 seconds/);
  assert.match(prompt, /state what the event\/clash is, name each outlet/);
  assert.match(prompt, /never exceed 65 words/);
});
