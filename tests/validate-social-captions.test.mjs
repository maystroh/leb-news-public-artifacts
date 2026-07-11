import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {RADAR_BEIRUT_PUBLISHING_HASHTAGS} from '../scripts/lib/social-publishing-hashtags.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

const allChannelDescription = [
  'مصادر القنوات:',
  'الأخبار https://www.youtube.com/channel/UCesINM73oox7GBSXTHz9Xiw',
  'أساس ميديا https://www.youtube.com/@asasmedialb',
  'نداء الوطن https://www.youtube.com/channel/UCgDmbBPDnUWZdvMRrYG2C8Q',
  'المدن https://www.youtube.com/user/Almodononline',
  'الشرق الأوسط https://www.youtube.com/@aawsat',
  'اللواء https://www.youtube.com/@aliwaanewspaper7154',
  'الديار https://www.youtube.com/channel/UC6ObY8lCD2oHmyLjKqLAn1g/featured'
].join('\n');
const allOutletHashtags = [
  '#الأخبار',
  '#AlAkhbar',
  '#أساس_ميديا',
  '#AsasMedia',
  '#نداء_الوطن',
  '#NidaaAlWatan',
  '#المدن',
  '#AlModon',
  '#الشرق_الأوسط',
  '#AsharqAlAwsat',
  '#اللواء',
  '#AlLiwaa',
  '#الديار',
  '#Addiyar'
];

const makeFolder = (description = allChannelDescription, hashtags = [...RADAR_BEIRUT_PUBLISHING_HASHTAGS, ...allOutletHashtags]) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'social-cap-'));
  const output = path.join(folder, 'output');
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'briefing.json'), JSON.stringify({
    scenes: [{id: 'scene-1'}, {id: 'scene-2'}]
  }));
  fs.writeFileSync(path.join(output, 'social-captions.json'), JSON.stringify({
    youtube: {
      title: 'عنوان',
      description,
      thumbnailPrompt: 'prompt',
      hashtags
    },
    clips: [
      {sceneId: 'scene-1', outlet: 'افتتاحية', caption: 'a', hashtags: ['#لبنان']},
      {sceneId: 'scene-2', outlet: 'الأخبار', caption: 'b', hashtags: ['#لبنان']}
    ]
  }));
  return folder;
};

const run = (folder) => spawnSync(process.execPath, ['./scripts/validate-social-captions.mjs', '--folder', folder], {
  cwd: repoRoot,
  encoding: 'utf8'
});

test('passes when YouTube description includes every configured source channel', () => {
  const r = run(makeFolder());
  assert.equal(r.status, 0, r.stderr);
});

test('fails when YouTube description omits a configured source channel', () => {
  const r = run(makeFolder(allChannelDescription.replace('https://www.youtube.com/@aawsat', '')));
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /الشرق الأوسط/);
});

test('fails when YouTube hashtags omit a configured outlet tag', () => {
  const r = run(makeFolder(allChannelDescription, [...RADAR_BEIRUT_PUBLISHING_HASHTAGS, ...allOutletHashtags.filter((tag) => tag !== '#AsharqAlAwsat')]));
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /#AsharqAlAwsat/);
});

test('fails when YouTube hashtags omit a required publishing tag', () => {
  const r = run(makeFolder(allChannelDescription, [...RADAR_BEIRUT_PUBLISHING_HASHTAGS.filter((tag) => tag !== '#RadarBeirut'), ...allOutletHashtags]));
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /#RadarBeirut/);
});
