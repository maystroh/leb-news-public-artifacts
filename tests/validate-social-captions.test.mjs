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
    scenes: [{id: 'scene-1'}, {id: 'scene-2', outlet: {key: 'alakhbar', name: 'الأخبار'}}]
  }));
  fs.writeFileSync(path.join(output, 'social-captions.json'), JSON.stringify({
    youtube: {
      title: 'عنوان',
      description,
      thumbnailPrompt: 'prompt',
      hashtags
    },
    x: {
      accountUrl: 'https://x.com/RadarBeirut',
      posts: [
        {
          id: 'hook',
          label: '1/4 hook (native video)',
          text: 'الصحافة اليوم: اختبار سيادة في الجنوب ودعم خارجي للدولة. #لبنان #سيادة'
        },
        {
          id: 'faultline-1',
          label: '2/4 fault line',
          text: 'على خط أول، تقرأ الأخبار @AlakhbarNews الحدث كاختبار للضمانات الأميركية قبل أي انسحاب.'
        },
        {
          id: 'question',
          label: '3/4 open question (poll)',
          text: 'سؤال اليوم: هل الانسحاب ضمانة دولة أم مقايضة على السلاح؟',
          poll: ['ضمانة دولة', 'مقايضة على السلاح']
        },
        {
          id: 'link',
          label: '4/4 YouTube link',
          text: 'النسخة الكاملة على يوتيوب 👇 {YOUTUBE_LINK}'
        }
      ]
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

const mutateCaptions = (folder, mutate) => {
  const captionsPath = path.join(folder, 'output', 'social-captions.json');
  const captions = JSON.parse(fs.readFileSync(captionsPath, 'utf8'));
  mutate(captions);
  fs.writeFileSync(captionsPath, JSON.stringify(captions));
};

test('fails when X hook post does not start with الصحافة اليوم', () => {
  const folder = makeFolder();
  mutateCaptions(folder, (captions) => {
    captions.x.posts[0].text = 'عنوان آخر #لبنان #سيادة';
  });

  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /الصحافة اليوم/);
});

test('fails when X hook post does not have exactly two hashtags', () => {
  const folder = makeFolder();
  mutateCaptions(folder, (captions) => {
    captions.x.posts[0].text = 'الصحافة اليوم: انقسام حاد. #لبنان #سيادة #بيروت';
  });

  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /exactly 2 hashtags/);
});

test('fails when X faultline posts omit a scene outlet handle', () => {
  const folder = makeFolder();
  mutateCaptions(folder, (captions) => {
    captions.x.posts[1].text = 'على خط أول، تقرأ صحيفة الحدث كاختبار للضمانات الأميركية.';
  });

  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /@AlakhbarNews/);
});

test('fails when a faultline post starts with an @handle', () => {
  const folder = makeFolder();
  mutateCaptions(folder, (captions) => {
    captions.x.posts[1].text = '@AlakhbarNews تقرأ الحدث كاختبار للضمانات الأميركية.';
  });

  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /must not start with an @handle/);
});

test('fails when X hook post is over 275 characters', () => {
  const folder = makeFolder();
  mutateCaptions(folder, (captions) => {
    captions.x.posts[0].text = `الصحافة اليوم: ${'طويل '.repeat(70)} #لبنان #سيادة`;
  });

  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /max is 275/);
});

test('fails when the question post has no poll options', () => {
  const folder = makeFolder();
  mutateCaptions(folder, (captions) => {
    delete captions.x.posts[2].poll;
  });

  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /poll array with 2–4/);
});

test('fails when a poll option exceeds the 25-character X limit', () => {
  const folder = makeFolder();
  mutateCaptions(folder, (captions) => {
    captions.x.posts[2].poll = ['ضمانة دولة', 'خيار طويل جداً يتجاوز حدود إكس المسموح بها للاستفتاء'];
  });

  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /X limit is 25/);
});

test('fails when the link post is missing the YouTube link placeholder', () => {
  const folder = makeFolder();
  mutateCaptions(folder, (captions) => {
    captions.x.posts[3].text = 'النسخة الكاملة على يوتيوب 👇';
  });

  const r = run(folder);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /\{YOUTUBE_LINK\}/);
});
