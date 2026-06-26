import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');

const makeFolder = () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-social-prompts-'));
  fs.mkdirSync(path.join(folder, 'output'), {recursive: true});
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel.json'), JSON.stringify({
    scenes: [
      {
        id: 'duel-1',
        eventLabel: 'E1',
        contrastLabel: 'C1',
        left: {outlet: 'نداء الوطن', quote: 'q1', stance: 's1'},
        right: {outlet: 'البناء', quote: 'q2', stance: 's2'},
        summary: 'summary'
      }
    ]
  }));
  return folder;
};

test('builds prompt requesting full per-duel reel cover prompts', () => {
  const folder = makeFolder();
  const r = spawnSync(process.execPath, ['./scripts/build-duel-social-prompts-prompt.mjs', '--folder', folder], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
  const prompt = fs.readFileSync(path.join(folder, 'output', 'quote-duel-social-prompts-prompt.md'), 'utf8');
  assert.match(prompt, /"reelCoverPrompt":/);
  assert.match(prompt, /social media reel\/short cover/);
  assert.match(prompt, /Instagram Reels, YouTube Shorts, TikTok/);
  assert.match(prompt, /quote-duel-reel-cover-01\.png/);
});

test('validates per-duel social prompts', () => {
  const folder = makeFolder();
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-prompts.json'), JSON.stringify({
    duels: [{
      duelId: 'duel-1',
      title: 'عنوان',
      description: 'وصف',
      hashtags: ['#لبنان'],
      reelCoverPrompt: 'Create a 9:16 social media reel/short cover for Radar Beirut.'
    }]
  }));
  const r = spawnSync(process.execPath, ['./scripts/validate-duel-social-prompts.mjs', '--folder', folder], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
});
