import {DEFAULT_DUEL_HOOKS} from './duel-hooks.mjs';

const AR = {
  aawsat: '\u0627\u0644\u0634\u0631\u0642 \u0627\u0644\u0623\u0648\u0633\u0637',
  nidaa: '\u0646\u062f\u0627\u0621 \u0627\u0644\u0648\u0637\u0646',
  asas: '\u0623\u0633\u0627\u0633 \u0645\u064a\u062f\u064a\u0627',
  aliwaa: '\u0627\u0644\u0644\u0648\u0627\u0621',
  joumhouria: '\u0627\u0644\u062c\u0645\u0647\u0648\u0631\u064a\u0629',
  modon: '\u0627\u0644\u0645\u062f\u0646',
  akhbar: '\u0627\u0644\u0623\u062e\u0628\u0627\u0631',
  diyar: '\u0627\u0644\u062f\u064a\u0627\u0631',
  binaa: '\u0627\u0644\u0628\u0646\u0627\u0621',
  post180: '180 \u0628\u0648\u0633\u062a',
  sahafaToday: '\u0627\u0644\u0635\u062d\u0627\u0641\u0629 \u0627\u0644\u064a\u0648\u0645',
  quoteDuel: '\u062b\u0646\u0627\u0626\u064a\u0629 \u0627\u0644\u0627\u0642\u062a\u0628\u0627\u0633\u0627\u062a',
  faultMap: '\u0627\u0644\u062e\u0631\u064a\u0637\u0629 \u0627\u0644\u0623\u064a\u062f\u064a\u0648\u0644\u0648\u062c\u064a\u0629 \u0644\u0644\u064a\u0648\u0645',
  keywordRadar: '\u0631\u0627\u062f\u0627\u0631 \u0627\u0644\u0643\u0644\u0645\u0627\u062a',
  closingScene: '\u062e\u0644\u0627\u0635\u0629 \u0627\u0644\u0645\u0634\u0647\u062f',
  minAlNas: '\u0645\u0646 \u0627\u0644\u0646\u0635'
};

export const availableOutlets = [
  {outletKey: 'aawsat', outletName: AR.aawsat, logoFile: 'aawsat-logo.png', imagePrefixes: ['aawsat', 'asharqalawsat']},
  {outletKey: 'nidaa-al-watan', outletName: AR.nidaa, logoFile: 'nidaalwatan-logo.png', imagePrefixes: ['nidaalwatan', 'nidaaalwatan', 'nidaa-al-watan']},
  {outletKey: 'asas-media', outletName: AR.asas, logoFile: 'asasmedia-logo.png', imagePrefixes: ['asasmedia', 'asas-media']},
  {outletKey: 'aliwaa', outletName: AR.aliwaa, logoFile: 'aliwa2-logo.png', imagePrefixes: ['aliwaa', 'aliwaa2']},
  {outletKey: 'aljoumhouria', outletName: AR.joumhouria, logoFile: 'aljoumhouria-logo.png', imagePrefixes: ['aljoumhouria', 'joumhouria']},
  {outletKey: 'almodon', outletName: AR.modon, logoFile: 'almodon-logo.png', imagePrefixes: ['almodon', 'modon']},
  {outletKey: 'alakhbar', outletName: AR.akhbar, logoFile: 'alakhbar-logo.png', imagePrefixes: ['alakhbar', 'akhbar']},
  {outletKey: 'aldiyar', outletName: AR.diyar, logoFile: 'aldiyar-logo.png', imagePrefixes: ['aldiyar', 'addiyar', 'diyar']},
  {outletKey: 'albinaa', outletName: AR.binaa, logoFile: 'albina2-logo.png', imagePrefixes: ['albinaa', 'albina2', 'binaa']},
  {outletKey: '180post', outletName: AR.post180, logoFile: '180post-logo.png', imagePrefixes: ['180post']}
];

export const buildCodexPrompt = ({
  dateLabel,
  briefingFolder,
  briefingFolderRelative,
  briefingFolderTerminalPath,
  briefingFolderWindowsPath,
  briefingText,
  paragraphBlocks,
  briefingFileName
}) => {
  const sceneParagraphs = paragraphBlocks.map((paragraph, index) => ({
    sceneId: `scene-${index + 1}`,
    paragraph
  }));

  const terminalPath = briefingFolderTerminalPath ?? briefingFolder;
  const relativePath = briefingFolderRelative ?? `briefings/${dateLabel}`;
  const sourceBriefingPath = `${relativePath}/${briefingFileName}`;
  const analysisFileNames = [
    'visual-script.json',
    'outlet-map.json',
    'quote-duel.json',
    'fault-line-map-script.json',
    'keyword-radar-script.json'
  ];
  const analysisFilePaths = analysisFileNames.map((fileName) => `${relativePath}/${fileName}`);
  const terminalAnalysisFilePaths = analysisFileNames.map((fileName) => `${terminalPath}/${fileName}`);

  return [
    `Create the Radar Beirut analysis pack for ${dateLabel}.`,
    '',
    'Work only inside this briefing folder.',
    '',
    'WSL / terminal path:',
    terminalPath,
    '',
    'Project-relative path:',
    relativePath,
    '',
    'Windows reference path:',
    briefingFolderWindowsPath ?? briefingFolder,
    '',
    'If running under WSL Codex CLI, use the WSL / terminal path or the project-relative path. Do not use Windows backslash paths for shell commands.',
    '',
    'Source briefing text:',
    `- ${sourceBriefingPath}`,
    '- when both AI-generated and human-corrected briefing text files exist, always use the `_corrected.txt` source as the editorial source of truth',
    '',
    'Fill only these JSON files.',
    '',
    'Use these project-relative paths for apply_patch and shell commands run from the repo root:',
    ...analysisFilePaths.map((filePath) => `- ${filePath}`),
    '',
    'If you need absolute WSL terminal paths, use these:',
    ...terminalAnalysisFilePaths.map((filePath) => `- ${filePath}`),
    '',
    'Do not patch or create bare filenames at the repo root such as `visual-script.json`; always include the briefing folder path.',
    '',
    'Rules:',
    '- for analysis, preserve every source paragraph in visual-script.json under `scenes` and give each paragraph a headline, summary, and quote',
    '- visual-script.json must also include top-level `outroQuestion`, extracted from the final paragraph as one question only',
    '- `outroQuestion` must not include setup phrases, follow-up sentences, sign-offs, or anything after the question mark',
    '- example: from `والسؤال الذي تتجنبه كل الصحف: ماذا عن الجنوب الذي يبدو خارج أي تهدئة شاملة في كل السيناريوهات؟ هذا ما ستكشفه الساعات القادمة. حتى نلتقي.` extract only `ماذا عن الجنوب الذي يبدو خارج أي تهدئة شاملة في كل السيناريوهات؟`',
    '- for final full-editorial rendering, do not treat every source paragraph as a rendered scene',
    '- scene 1 is framing, the penultimate paragraph is synthesis, and the final paragraph is the open-question outro, so outlet-map.json normally starts at scene-2 and excludes non-outlet scenes',
    '- for the final `radar-beirut-briefing.html` review flow, do not keep the opening paragraph as a standalone rendered scene',
    `- instead, play all outlet scenes first, then one shared closing scene called \`${AR.closingScene}\`, then the open-question outro`,
    '- for the shared closing scene analysis/text, read the opening paragraph together with the penultimate summary paragraph so the closing scene has the full frame plus synthesis',
    '- for the shared closing scene audio/narration, use only the penultimate summary paragraph; do not append the opening paragraph to the Hamsa audio text',
    '- the final paragraph remains the open-question outro and should not be duplicated inside the shared closing scene',
    '- the rendered outro must show only visual-script.json `outroQuestion`, not the full final paragraph',
    '- the build creates or reuses generated `output/timing-config.json`, and that file is the manual source of truth for intro, scene, synthesis, and outro durations after generation',
    '- in outlet scenes, the orange label beside the logo should use the scene thesis/headline, not the outlet name',
    '- in outlet scenes, `visual.summary` must state the editorial position directly and must not repeat the outlet name or begin with formulas such as `المدن ترى`, `الأخبار تقول`, `الجمهورية تعتبر`, or `ترى الصحيفة` because outlet identity is already rendered separately',
    '- example: write `التسوية لا تولد في واشنطن وحدها، والجنوب دخل إدارة توتر طويلة لا سلاماً قريباً.` instead of `المدن ترى أن التسوية لا تولد في واشنطن وحدها، وأن الجنوب دخل إدارة توتر طويلة لا سلاماً قريباً.`',
    '- if any outlet media exists inside this date folder, front page or article screenshots, use it in the outlet image area instead of text filler',
    '- if an outlet has multiple article screenshots in the date folder, use them as an ordered image sequence in the outlet content area and rotate through them during that outlet scene',
    '- this multi-image content behavior is especially expected for asas-media and almodon when screenshots are available',
    `- if no outlet media exists for that outlet, use a short excerpt fallback and do not label it \`${AR.minAlNas}\``,
    '- do not show the old attached quote box below the outlet image area',
    '- the outlet image area should be tall and should fill the remaining card space under the summary',
    '- the outlet image area should fit inside the main outlet card, and front pages may pan vertically inside that box so the viewer sees the page over time instead of forcing the whole cover into one static crop',
    '- if a front page is smaller than the image box, scale it up to cover the whole box before any pan starts',
    '- article screenshot sequences should fit cleanly inside the outlet image box in contained mode rather than being cropped like full newspaper front pages',
    '- once `output/timing-config.json` exists, the generated HTML should follow those duration values directly instead of using hardcoded scene timing maps',
    '- default outlet timing can start in the 15000ms to 20000ms range, but final timing should be adjustable through `output/timing-config.json`',
    '- use only outlets from the allowed outlet list below',
    '- Quote Duel: pick the strongest 2-4 clashes, each scene = one event + two opposed outlets + two direct quotes + one contrast line',
    '- Quote Duel: every scene must include `audioText`, a spoken Lebanese-Arabic narration for that one clash',
    '- Quote Duel `audioText` must be written for one standalone short: state what the event/clash is, name each outlet, and say what each outlet says about that event',
    '- Quote Duel `audioText` should sound like a natural voiceover, not a mechanical template; do not start every line with `الحدث هو` unless it genuinely sounds best',
    '- Quote Duel `audioText` can be 1-3 short sentences, but it must still mention both outlet names and their opposing readings clearly',
    '- Quote Duel `audioText` must fit comfortably under 25 seconds of AI audio; target 35-55 Arabic words and never exceed 65 words',
    '- Quote Duel `audioText` should be one compact spoken paragraph, not bullets and not a long article-style summary',
    '- Quote Duel `audioText`: infer the text inside the quotes editorially from the source, stance, and direct quotes; do not blindly copy the on-screen quote if a clearer spoken paraphrase is better',
    '- Quote Duel: optionally fill `left.audioLine` and `right.audioLine` with the same short inferred outlet phrases used inside the spoken `audioText` quotes',
    '- Quote Duel `audioText` should sound natural when read aloud, mention both outlet names, state the event/clash clearly, and keep the quoted outlet phrasing short',
    '- Quote Duel `audioText` is the editable source for per-clash WAV generation; keep it separate from the short on-screen `summary`',
    '- Fault Line Map: create one fresh day-specific axis, not a permanent one',
    '- Keyword Radar: 3-4 charged terms per outlet scene, ordered by rhetorical force',
    '- keep Arabic concise, sharp, editorial, and readable for vertical video',
    '- use short direct phrases from the source text whenever possible for quote fields',
    '- fault line positions must be between 0 and 1',
    '- keyword radar cluster positions must be between 0 and 1',
    '',
    'After the user validates the JSON files, the guided workflow will run this command from the project root:',
    `npm run briefing:build:folder -- --folder briefings/${dateLabel}`,
    'After the first build, edit `output/timing-config.json` if needed and rerun the same build command to apply your manual timings.',
    '',
    'Allowed outlets:',
    JSON.stringify(availableOutlets, null, 2),
    '',
    'Paragraphs by scene id:',
    JSON.stringify(sceneParagraphs, null, 2),
    '',
    'Full briefing text:',
    briefingText
  ].join('\n');
};

export const createEmptyAnalysisFiles = ({dateLabel}) => ({
  'visual-script.json': {
    outroQuestion: '',
    scenes: [
      {
        sceneId: 'scene-1',
        headline: '',
        summary: '',
        quote: ''
      }
    ]
  },
  'outlet-map.json': [
    {
      sceneId: 'scene-2',
      outletKey: '',
      outletName: '',
      logoFile: ''
    }
  ],
  'quote-duel.json': {
    meta: {
      title: 'The Quote Duel',
      dateLabel,
      totalScenes: 0
    },
    intro: {
      eyebrow: AR.sahafaToday,
      title: AR.quoteDuel,
      subtitle: '',
      durationSeconds: 8
    },
    hooks: DEFAULT_DUEL_HOOKS.map((h) => ({...h})),
    scenes: [
      {
        id: 'duel-1',
        eventLabel: '',
        contrastLabel: '',
        summary: '',
        audioText: '',
        durationSeconds: 8,
        left: {
          outlet: '',
          logoFile: '',
          stance: '',
          quote: '',
          audioLine: ''
        },
        right: {
          outlet: '',
          logoFile: '',
          stance: '',
          quote: '',
          audioLine: ''
        }
      }
    ],
    outro: {
      title: '',
      body: '',
      durationSeconds: 5
    }
  },
  'fault-line-map-script.json': {
    axis: {
      id: '',
      label: AR.faultMap,
      headline: '',
      leftPole: '',
      rightPole: '',
      leftColor: '#cd7f32',
      rightColor: '#67bfd8'
    },
    intro: {
      eyebrow: AR.sahafaToday,
      title: '',
      subtitle: '',
      durationSeconds: 5
    },
    entries: [
      {
        sceneId: 'scene-2',
        position: 0.5,
        stanceLabel: '',
        rationale: '',
        quote: '',
        durationSeconds: 5
      }
    ],
    synthesis: {
      headline: '',
      summary: '',
      durationSeconds: 5
    },
    outro: {
      title: '',
      body: '',
      durationSeconds: 5
    }
  },
  'keyword-radar-script.json': {
    intro: {
      eyebrow: AR.sahafaToday,
      title: AR.keywordRadar,
      subtitle: '',
      durationSeconds: 5
    },
    entries: [
      {
        sceneId: 'scene-2',
        sceneLabel: '',
        summary: '',
        terms: [
          {text: '', family: '', weight: 0.9},
          {text: '', family: '', weight: 0.8},
          {text: '', family: '', weight: 0.7}
        ],
        durationSeconds: 6
      }
    ],
    clusters: [
      {
        id: '',
        label: '',
        color: '#cd7f32',
        position: {x: 0.5, y: 0.5}
      }
    ],
    synthesis: {
      headline: '',
      summary: '',
      durationSeconds: 6
    },
    outro: {
      title: '',
      body: '',
      durationSeconds: 5
    }
  }
});
