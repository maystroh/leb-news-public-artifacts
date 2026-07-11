// tests/validate-duel-social-captions.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {RADAR_BEIRUT_PUBLISHING_HASHTAGS} from '../scripts/lib/social-publishing-hashtags.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const make = () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-cap-'));
  fs.mkdirSync(path.join(folder, 'output'), {recursive: true});
  fs.mkdirSync(path.join(folder, 'audio'), {recursive: true});
  return folder;
};
const run = (folder) => spawnSync(process.execPath, ['./scripts/validate-duel-social-captions.mjs', '--folder', folder], {cwd: repoRoot, encoding: 'utf8'});
const youtubeDescription = [
  'duel-1: نداء الوطن في مواجهة الأخبار.',
  'نداء الوطن https://www.youtube.com/channel/UCgDmbBPDnUWZdvMRrYG2C8Q',
  'الأخبار https://www.youtube.com/channel/UCesINM73oox7GBSXTHz9Xiw',
  'duel-2: المدن في مواجهة الديار.',
  'المدن https://www.youtube.com/user/Almodononline',
  'الديار https://www.youtube.com/channel/UC6ObY8lCD2oHmyLjKqLAn1g/featured'
].join('\n');
const youtubeHashtags = [
  ...RADAR_BEIRUT_PUBLISHING_HASHTAGS,
  '#نداء_الوطن',
  '#NidaaAlWatan',
  '#الأخبار',
  '#AlAkhbar',
  '#المدن',
  '#AlModon',
  '#الديار',
  '#Addiyar'
];

test('passes when every manifest duelId has a caption', () => {
  const folder = make();
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-1': {}, 'duel-2': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({
    clips: [{duelId: 'duel-1', caption: 'a'}, {duelId: 'duel-2', caption: 'b'}]
  }));
  const r = run(folder);
  assert.equal(r.status, 0, r.stderr);
});

test('fails when a manifest duelId is missing a caption', () => {
  const folder = make();
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-1': {}, 'duel-2': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({clips: [{duelId: 'duel-1', caption: 'a'}]}));
  const r = run(folder);
  assert.notEqual(r.status, 0);
});

test('requires known outlet YouTube links in each duel caption and YouTube description', () => {
  const folder = make();
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-1': {}, 'duel-2': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel.json'), JSON.stringify({
    scenes: [
      {id: 'duel-1', left: {outlet: 'نداء الوطن'}, right: {outlet: 'الأخبار'}},
      {id: 'duel-2', left: {outlet: 'المدن'}, right: {outlet: 'الديار'}}
    ]
  }));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({
    youtube: {description: youtubeDescription, hashtags: youtubeHashtags},
    clips: [
      {
        duelId: 'duel-1',
        caption: 'a https://www.youtube.com/channel/UCgDmbBPDnUWZdvMRrYG2C8Q https://www.youtube.com/channel/UCesINM73oox7GBSXTHz9Xiw',
        hashtags: ['#نداء_الوطن', '#NidaaAlWatan', '#الأخبار', '#AlAkhbar']
      },
      {
        duelId: 'duel-2',
        caption: 'b https://www.youtube.com/user/Almodononline https://www.youtube.com/channel/UC6ObY8lCD2oHmyLjKqLAn1g/featured',
        hashtags: ['#المدن', '#AlModon', '#الديار', '#Addiyar']
      }
    ]
  }));
  const r = run(folder);
  assert.equal(r.status, 0, r.stderr);
});

test('fails when a duel caption omits a known outlet YouTube link', () => {
  const folder = make();
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-1': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel.json'), JSON.stringify({
    scenes: [{id: 'duel-1', left: {outlet: 'نداء الوطن'}, right: {outlet: 'الأخبار'}}]
  }));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({
    youtube: {description: youtubeDescription, hashtags: youtubeHashtags},
    clips: [{duelId: 'duel-1', caption: 'a https://www.youtube.com/channel/UCgDmbBPDnUWZdvMRrYG2C8Q', hashtags: ['#نداء_الوطن', '#NidaaAlWatan', '#الأخبار', '#AlAkhbar']}]
  }));
  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /الأخبار/);
});

test('fails when a duel clip omits a known outlet hashtag', () => {
  const folder = make();
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-1': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel.json'), JSON.stringify({
    scenes: [{id: 'duel-1', left: {outlet: 'نداء الوطن'}, right: {outlet: 'الأخبار'}}]
  }));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({
    youtube: {description: youtubeDescription, hashtags: youtubeHashtags},
    clips: [{
      duelId: 'duel-1',
      caption: 'a https://www.youtube.com/channel/UCgDmbBPDnUWZdvMRrYG2C8Q https://www.youtube.com/channel/UCesINM73oox7GBSXTHz9Xiw',
      hashtags: ['#نداء_الوطن', '#NidaaAlWatan', '#الأخبار']
    }]
  }));
  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /#AlAkhbar/);
});

test('fails when YouTube hashtags omit a required publishing tag', () => {
  const folder = make();
  fs.writeFileSync(path.join(folder, 'audio', 'quote-duel-manifest.json'), JSON.stringify({audioByDuel: {'duel-1': {}}}));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel.json'), JSON.stringify({
    scenes: [{id: 'duel-1', left: {outlet: 'نداء الوطن'}, right: {outlet: 'الأخبار'}}]
  }));
  fs.writeFileSync(path.join(folder, 'output', 'quote-duel-social-captions.json'), JSON.stringify({
    youtube: {description: youtubeDescription, hashtags: youtubeHashtags.filter((tag) => tag !== '#RadarBeirut')},
    clips: [{
      duelId: 'duel-1',
      caption: 'a https://www.youtube.com/channel/UCgDmbBPDnUWZdvMRrYG2C8Q https://www.youtube.com/channel/UCesINM73oox7GBSXTHz9Xiw',
      hashtags: ['#نداء_الوطن', '#NidaaAlWatan', '#الأخبار', '#AlAkhbar']
    }]
  }));
  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /#RadarBeirut/);
});
