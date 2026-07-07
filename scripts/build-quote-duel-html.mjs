import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, readJson, writeJson} from './lib/briefing-helpers.mjs';
import {DEFAULT_HOOK_ID, normalizeHookId, resolveSharedHook, resolveSharedOutro} from './lib/duel-hooks.mjs';
import {
  DEFAULT_DUEL_ENDING_AUDIO_GAP_SECONDS,
  DEFAULT_DUEL_OUTRO_TEXT,
  mergeDuelAudioManifest
} from './lib/duel-timeline.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const dataPath = args.data ? path.resolve(cwd, args.data) : path.join(cwd, 'src', 'data', 'quote-duel.json');
const htmlPath = args.output ? path.resolve(cwd, args.output) : path.join(cwd, 'radar-beirut-quote-duel.html');
const outputDir = path.dirname(htmlPath);
const selectedHookId = normalizeHookId(args.hook) ?? DEFAULT_HOOK_ID;

if (!fs.existsSync(dataPath)) {
  console.error(`Missing generated quote duel data: ${dataPath}`);
  process.exit(1);
}

const quoteDuelSourceData = readJson(dataPath);
const audioManifestPath = path.join(path.dirname(path.dirname(dataPath)), 'audio', 'quote-duel-manifest.json');
const audioManifest = fs.existsSync(audioManifestPath) ? readJson(audioManifestPath) : null;
const quoteDuelData = mergeDuelAudioManifest(quoteDuelSourceData, audioManifest);
const scenes = Array.isArray(quoteDuelData.scenes) ? quoteDuelData.scenes : [];
const reviewScenes = scenes.map((scene, index) => ({scene, index}));
const hookFromData = (Array.isArray(quoteDuelData.hooks) ? quoteDuelData.hooks : []).find((hook) => hook.id === selectedHookId);
const sharedHook = resolveSharedHook(cwd, selectedHookId);
const sharedOutro = resolveSharedOutro(cwd);
const hookAudioSeconds = sharedHook?.rawSeconds ?? Math.max(0, (sharedHook?.durationSeconds ?? 2.5) - 0.5);
const selectedHook = {
  id: selectedHookId,
  text: hookFromData?.text ?? sharedHook?.text ?? '',
  audioSeconds: hookAudioSeconds,
  durationSeconds: hookAudioSeconds + 0.5,
  audioPath: sharedHook?.wavPath ?? path.join(cwd, 'audio', 'hooks', `${selectedHookId}.wav`)
};
const outroAudioSeconds = sharedOutro?.rawSeconds ?? Math.max(0, (sharedOutro?.durationSeconds ?? 3) - 0.5);
const selectedOutro = {
  text: DEFAULT_DUEL_OUTRO_TEXT,
  audioText: sharedOutro?.text ?? '',
  audioSeconds: outroAudioSeconds,
  durationSeconds: sharedOutro?.durationSeconds ?? (outroAudioSeconds + 0.5),
  audioPath: sharedOutro?.wavPath ?? path.join(cwd, 'audio', 'hooks', 'outro.wav')
};

fs.mkdirSync(outputDir, {recursive: true});
for (const entry of fs.readdirSync(outputDir)) {
  if (/^radar-beirut-quote-duel-\d{2}\.html$/.test(entry)) {
    fs.unlinkSync(path.join(outputDir, entry));
  }
}

const toHtmlRelativePath = (assetPath) => {
  const relativePath = path.relative(outputDir, assetPath).replace(/\\/g, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const padTwo = (value) => String(value).padStart(2, '0');
const introBackgroundSrc = toHtmlRelativePath(path.join(cwd, 'logos', 'video-front-page-3.png'));
const getSceneDurationSeconds = (scene) => {
  const declaredSeconds = typeof scene?.durationSeconds === 'number' ? scene.durationSeconds : 5;
  const audioSeconds = typeof scene?.audio?.durationSeconds === 'number' ? scene.audio.durationSeconds : 0;
  const bufferedAudioSeconds = audioSeconds > 0 ? audioSeconds + DEFAULT_DUEL_ENDING_AUDIO_GAP_SECONDS : 0;
  return Math.max(declaredSeconds, bufferedAudioSeconds);
};

const css = `
  @font-face {
    font-family: Dubai;
    src: url("${toHtmlRelativePath(path.join(cwd, 'fonts', 'Dubai-Regular.ttf'))}") format("truetype");
    font-weight: 400;
  }
  @font-face {
    font-family: Dubai;
    src: url("${toHtmlRelativePath(path.join(cwd, 'fonts', 'Dubai-Bold.ttf'))}") format("truetype");
    font-weight: 700;
  }
  :root {
    --bg: #07131d;
    --panel: rgba(9, 28, 42, 0.9);
    --line: rgba(205, 127, 50, 0.24);
    --accent: #cd7f32;
    --text: #eef5f8;
    --muted: #9bb2c5;
    --cyan: #67bfd8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 50% 18%, rgba(205, 127, 50, 0.16), transparent 30%),
      linear-gradient(180deg, #0b2233, var(--bg));
    color: var(--text);
    font-family: Dubai, "Noto Naskh Arabic", Tahoma, sans-serif;
  }
  .stage {
    position: relative;
    width: min(405px, 100vw);
    aspect-ratio: 405 / 720;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 120%, rgba(205, 127, 50, 0.15), transparent 30%),
      linear-gradient(180deg, rgba(4, 17, 27, 0.88), rgba(5, 13, 20, 0.98));
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.38);
  }
  .intro-layers,
  .bg-photo,
  .grid-overlay,
  .ambient-overlay,
  .scan-line,
  .ring,
  .bracket {
    position: absolute;
    pointer-events: none;
  }
  .intro-layers {
    inset: 0;
    z-index: 0;
    opacity: 1;
    transition: opacity 0.35s ease;
  }
  .stage.is-scene .intro-layers {
    opacity: 0.42;
  }
  .bg-photo {
    inset: 0;
    background: url("${introBackgroundSrc}") center/cover no-repeat;
    opacity: 1;
    transform: scale(1.08);
    animation: photoZoomOut var(--intro-ms, 3440ms) ease forwards;
  }
  .grid-overlay {
    inset: -12%;
    background-image:
      linear-gradient(rgba(103, 191, 216, 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(103, 191, 216, 0.05) 1px, transparent 1px);
    background-size: 44px 44px;
    transform: rotate(-8deg) scale(1.08);
    opacity: 0.34;
    animation: driftGrid 22s linear infinite;
  }
  .ambient-overlay {
    inset: 0;
    background:
      radial-gradient(circle at center, transparent 28%, rgba(0, 0, 0, 0.62) 100%),
      linear-gradient(0deg, rgba(0, 0, 0, 0.88) 0%, transparent 44%);
  }
  .scan-line {
    inset: 0 auto 0 -70%;
    width: 64%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(205, 127, 50, 0.06) 36%,
      rgba(205, 127, 50, 0.26) 50%,
      rgba(205, 127, 50, 0.06) 64%,
      transparent 100%
    );
    transform: skewX(-15deg);
    opacity: 1;
    animation: scanSweepLoop 3200ms linear infinite;
  }
  .ring {
    top: 70px;
    left: 50%;
    width: 250px;
    height: 250px;
    margin-left: -125px;
    border-radius: 50%;
    border: 2px solid rgba(205, 127, 50, 0.46);
    transform: scale(0.86);
    animation: ringPulse 2.4s ease-out infinite;
  }
  .ring.r2 { animation-delay: 0.7s; }
  .ring.r3 { animation-delay: 1.4s; }
  .bracket {
    width: 40px;
    height: 40px;
    opacity: 0.86;
  }
  .bracket::before,
  .bracket::after {
    content: "";
    position: absolute;
    background: rgba(205, 127, 50, 0.9);
    box-shadow: 0 0 8px rgba(205, 127, 50, 0.82);
  }
  .bracket::before { top: 0; left: 0; width: 100%; height: 3px; }
  .bracket::after { top: 0; left: 0; width: 3px; height: 100%; }
  .bracket.tl { top: 10px; left: 10px; }
  .bracket.tr { top: 10px; right: 10px; transform: scaleX(-1); }
  .bracket.bl { bottom: 10px; left: 10px; transform: scaleY(-1); }
  .bracket.br { bottom: 10px; right: 10px; transform: scale(-1, -1); }
  .content {
    position: absolute;
    inset: 34px 20px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 16px;
    z-index: 1;
    direction: rtl;
  }
  .date-pill {
    justify-self: center;
    min-width: 230px;
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.36);
    color: #d4dee8;
    direction: ltr;
    text-align: center;
    font-size: 12px;
    letter-spacing: 0.14em;
  }
  .hook-card,
  .intro-card,
  .duel-card {
    align-self: center;
    display: grid;
    gap: 18px;
    padding: 24px 20px;
    border-radius: 24px;
    border: 1px solid rgba(107, 162, 197, 0.18);
    background: var(--panel);
    box-shadow: 0 22px 54px rgba(0, 0, 0, 0.34);
  }
  .duel-card {
    align-self: stretch;
    min-height: 0;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 12px;
    padding: 18px 16px 16px;
  }
  .eyebrow {
    color: var(--accent);
    font-size: 14px;
    font-weight: 700;
    text-align: center;
  }
  .intro-title {
    margin: 0;
    color: #ffd39f;
    font-size: 50px;
    line-height: 1.24;
    font-weight: 700;
    text-align: center;
    text-shadow: 0 6px 22px rgba(0, 0, 0, 0.88);
  }
  .intro-date {
    color: rgba(205, 127, 50, 0.84);
    font-size: 12px;
    letter-spacing: 0.16em;
    font-weight: 500;
    direction: ltr;
    text-align: center;
    text-shadow: 0 5px 18px rgba(0, 0, 0, 0.82);
  }
  .intro-card {
    align-self: end;
    margin-bottom: 56px;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    opacity: 0;
    transform: translateY(20px);
    animation: introCopyIn 0.8s ease var(--intro-title-delay, 440ms) forwards;
  }
  .outro-copy {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 20px 22px 70px;
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.9) 0%, transparent 100%);
    text-align: center;
    opacity: 0;
    transform: translateY(32px);
    transition: opacity 0.8s ease, transform 0.8s ease;
    z-index: 6;
    direction: rtl;
  }
  .outro-screen.is-active .outro-copy {
    opacity: 1;
    transform: translateY(0);
  }
  .outro-title {
    color: #ffd39f;
    font-size: 50px;
    line-height: 1.24;
    font-weight: 700;
    text-shadow: 0 6px 22px rgba(0, 0, 0, 0.88);
  }
  .intro-screen,
  .scene-screen {
    position: absolute;
    inset: 0;
    opacity: 1;
    transition: opacity 0.2s ease;
  }
  .scene-screen {
    opacity: 0;
    pointer-events: none;
  }
  .scene-screen.is-active {
    opacity: 1;
    pointer-events: auto;
  }
  .stage.is-scene .intro-screen {
    opacity: 0;
    pointer-events: none;
  }
  .scene-screen .content {
    inset: 28px 18px 56px;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }
  .duel-audio {
    position: absolute;
    left: 18px;
    right: 18px;
    bottom: 12px;
    z-index: 3;
    width: calc(100% - 36px);
    height: 32px;
    direction: ltr;
    opacity: 0.92;
  }
  .outro-audio {
    display: none;
  }
  .play-gate {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: none;
    place-items: center;
    background: rgba(3, 10, 16, 0.64);
  }
  .play-gate.is-visible {
    display: grid;
  }
  .play-gate button {
    border: 1px solid rgba(205, 127, 50, 0.42);
    border-radius: 999px;
    background: rgba(205, 127, 50, 0.16);
    color: #ffdcb2;
    font: 700 18px Dubai, Tahoma, sans-serif;
    padding: 12px 26px;
    cursor: pointer;
  }
  .hook-text {
    margin: 0;
    color: #ffd39f;
    font-size: 40px;
    line-height: 1.36;
    font-weight: 700;
    text-align: center;
  }
  .meta {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
    text-align: center;
  }
  .audio {
    width: 100%;
    direction: ltr;
  }
  .event {
    color: #ffdcb2;
    font-size: 24px;
    line-height: 1.35;
    font-weight: 700;
    text-align: center;
  }
  .contrast {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
    text-align: center;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    direction: ltr;
    min-height: 0;
  }
  .panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    min-width: 0;
    min-height: 0;
    padding: 14px 12px;
    border-radius: 18px;
    background: rgba(2, 12, 20, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .outlet {
    direction: rtl;
    display: grid;
    place-items: center;
  }
  .logo-box {
    width: 86px;
    height: 44px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: rgba(244, 247, 250, 0.96);
  }
  .logo-box img {
    max-width: 72px;
    max-height: 30px;
    object-fit: contain;
  }
  .quote {
    min-height: 0;
    display: grid;
    align-content: center;
    border-radius: 16px;
    padding: 12px 10px;
    font-size: 24px;
    line-height: 1.48;
    text-align: center;
    direction: rtl;
  }
  .left .quote {
    color: #ffd39f;
    background: rgba(205, 127, 50, 0.12);
    border: 1px solid rgba(205, 127, 50, 0.18);
  }
  .right .quote {
    color: #cfeef6;
    background: rgba(103, 191, 216, 0.12);
    border: 1px solid rgba(103, 191, 216, 0.18);
  }
  .summary {
    align-self: end;
    padding: 11px 13px;
    border-radius: 16px;
    border-top: 1px solid rgba(205, 127, 50, 0.14);
    background: rgba(205, 127, 50, 0.06);
    color: #f1e2ca;
    font-size: 13px;
    line-height: 1.62;
    text-align: center;
  }
  @keyframes photoZoomOut {
    from { transform: scale(1.08); }
    to { transform: scale(1); }
  }
  @keyframes scanSweepLoop {
    0% { opacity: 0; transform: translateX(-140%) skewX(-15deg); }
    8% { opacity: 0.9; transform: translateX(-60%) skewX(-15deg); }
    45% { opacity: 1; transform: translateX(90%) skewX(-15deg); }
    68% { opacity: 0.18; transform: translateX(155%) skewX(-15deg); }
    100% { opacity: 0; transform: translateX(155%) skewX(-15deg); }
  }
  @keyframes ringPulse {
    0% { transform: scale(0.86); opacity: 0.72; }
    100% { transform: scale(1.52); opacity: 0; }
  }
  @keyframes driftGrid {
    from { transform: translateY(0) rotate(-8deg) scale(1.08); }
    to { transform: translateY(52px) rotate(-8deg) scale(1.08); }
  }
  @keyframes introCopyIn {
    to { opacity: 1; transform: translateY(0); }
  }
`;

const pageShell = ({title, body}) => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>
`;

const introScreen = () => `
  <div class="intro-layers">
    <div class="bg-photo"></div>
    <div class="grid-overlay"></div>
    <div class="ambient-overlay"></div>
    <div class="scan-line"></div>
    <div class="ring r1"></div>
    <div class="ring r2"></div>
    <div class="ring r3"></div>
    <div class="bracket tl"></div>
    <div class="bracket tr"></div>
    <div class="bracket bl"></div>
    <div class="bracket br"></div>
  </div>
  <section class="content intro-screen">
    <div></div>
    <article class="intro-card">
      <h1 class="intro-title">نفس الحدث غير رواية</h1>
      <div class="intro-date">${escapeHtml(quoteDuelData.meta?.dateLabel ?? '')}</div>
    </article>
    <div class="meta"></div>
  </section>`;

const hookAudioElement = () =>
  `<audio class="hook-audio" preload="auto" src="${escapeHtml(toHtmlRelativePath(selectedHook.audioPath))}"></audio>`;

const outroAudioElement = () =>
  `<audio class="outro-audio" preload="auto" src="${escapeHtml(toHtmlRelativePath(selectedOutro.audioPath))}"></audio>`;

const playbackScript = ({sceneDurations, outroDuration}) => `
<script>
  const stage = document.querySelector('.stage');
  const gate = document.querySelector('.play-gate');
  const button = gate?.querySelector('button');
  const hookAudio = document.querySelector('.hook-audio');
  const outroAudio = document.querySelector('.outro-audio');
  const scenes = Array.from(document.querySelectorAll('.scene-screen:not(.outro-screen)'));
  const outroScreen = document.querySelector('.outro-screen');
  const sceneAudios = scenes.map((scene) => scene.querySelector('.duel-audio'));
  const introMs = Number(stage?.dataset.introMs || 0);
  const sceneDurations = ${JSON.stringify(sceneDurations ?? [])};
  const outroDuration = ${JSON.stringify(Math.round((outroDuration ?? selectedOutro.durationSeconds) * 1000))};
  let started = false;
  let activeScene = -1;

  function showOutro() {
    scenes.forEach((scene) => scene.classList.remove('is-active'));
    sceneAudios.forEach((audio) => {
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
    });
    stage?.classList.add('is-scene');
    outroScreen?.classList.add('is-active');
    if (outroAudio) {
      outroAudio.currentTime = 0;
      outroAudio.play().catch(() => {});
    }
  }

  function showScene(index) {
    if (!scenes.length) return;
    outroScreen?.classList.remove('is-active');
    scenes.forEach((scene, sceneIndex) => scene.classList.toggle('is-active', sceneIndex === index));
    sceneAudios.forEach((audio, audioIndex) => {
      if (!audio) return;
      if (audioIndex !== index) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    stage?.classList.add('is-scene');
    activeScene = index;
    const activeAudio = sceneAudios[index];
    if (activeAudio) {
      activeAudio.currentTime = 0;
      activeAudio.play().catch(() => {});
    }
    const nextDelay = sceneDurations[index] || 0;
    if (index + 1 < scenes.length && nextDelay > 0) {
      setTimeout(() => showScene(index + 1), nextDelay);
    } else if (outroScreen && nextDelay > 0) {
      setTimeout(showOutro, nextDelay);
    }
  }

  function start() {
    if (started) return;
    started = true;
    gate?.classList.remove('is-visible');
    if (hookAudio) {
      hookAudio.currentTime = 0;
      hookAudio.play().catch(() => {
        gate?.classList.add('is-visible');
        started = false;
      });
    }
    if (scenes.length) setTimeout(() => showScene(0), introMs);
  }

  button?.addEventListener('click', start);
  window.addEventListener('load', () => {
    const attempt = hookAudio?.play();
    if (attempt?.then) {
      attempt
        .then(() => { started = true; if (scenes.length) setTimeout(() => showScene(0), introMs); })
        .catch(() => gate?.classList.add('is-visible'));
    } else {
      start();
    }
  });
</script>`;

const duelAudioSrc = (sourceIndex) =>
  toHtmlRelativePath(path.join(path.dirname(outputDir), 'audio', `duel-${padTwo(sourceIndex + 1)}.wav`));

const sceneScreen = (scene, index, durationSeconds) => `
  <section class="content">
    <div class="date-pill">${escapeHtml(quoteDuelData.meta?.dateLabel ?? '')}</div>
    <article class="duel-card">
      <div class="event">${escapeHtml(scene.eventLabel)}</div>
      <div class="contrast">${escapeHtml(scene.contrastLabel)}</div>
      <div class="grid">
        ${renderSide(scene.left, 'left')}
        ${renderSide(scene.right, 'right')}
      </div>
      <div class="summary">${escapeHtml(scene.summary)}</div>
    </article>
    <div class="meta"></div>
  </section>
  <audio class="duel-audio" controls preload="metadata" src="${escapeHtml(duelAudioSrc(index))}"></audio>`;

const outroScreen = () => `
  <section class="content">
    <div class="outro-copy">
      <div class="outro-title">الصحافة اليوم</div>
    </div>
    <div class="meta"></div>
  </section>
  ${outroAudioElement()}`;

const logoSrc = (logoFile) => toHtmlRelativePath(path.join(cwd, 'public', 'outlet-logos', logoFile ?? ''));

const renderSide = (side, className) => `
  <article class="panel ${className}">
    <div class="outlet">
      <div class="logo-box"><img src="${escapeHtml(logoSrc(side?.logoFile))}" alt="${escapeHtml(side?.outlet)}"></div>
    </div>
    <div class="quote">${escapeHtml(side?.quote)}</div>
  </article>`;

const duelFileName = (index) => `radar-beirut-quote-duel-${padTwo(index + 1)}.html`;
const introStageAttrs = `data-intro-ms="${escapeHtml(Math.round(selectedHook.durationSeconds * 1000))}" style="--intro-ms:${escapeHtml(Math.round(selectedHook.durationSeconds * 1000))}ms;--intro-title-delay:${escapeHtml(Math.max(0, Math.round((selectedHook.durationSeconds - 3) * 1000)))}ms"`;
const duelOutputs = reviewScenes.map(({scene, index}, outputIndex) => {
  const fileName = duelFileName(outputIndex);
  const filePath = path.join(outputDir, fileName);
  const durationSeconds = getSceneDurationSeconds(scene);
  const html = pageShell({
    title: `Radar Beirut Quote Duel ${padTwo(outputIndex + 1)}`,
    body: `
<main class="stage" data-duration-seconds="${escapeHtml(selectedHook.durationSeconds + durationSeconds + selectedOutro.durationSeconds)}" ${introStageAttrs} data-duel-id="${escapeHtml(scene.id ?? `duel-${index + 1}`)}">
  ${introScreen()}
  <section class="scene-screen">
    ${sceneScreen(scene, index, durationSeconds)}
  </section>
  <section class="scene-screen outro-screen">
    ${outroScreen()}
  </section>
  ${hookAudioElement()}
  <div class="play-gate"><button type="button">تشغيل</button></div>
</main>
${playbackScript({sceneDurations: [Math.round(durationSeconds * 1000)], outroDuration: selectedOutro.durationSeconds})}`
  });
  fs.writeFileSync(filePath, html);
  return {
    label: fileName,
    fileName,
    path: filePath,
    duelId: scene.id ?? `duel-${index + 1}`,
    sourceIndex: index + 1,
    durationSeconds,
    audioDurationSeconds: scene.audio?.durationSeconds ?? null
  };
});

const combinedSceneDurations = reviewScenes.map(({scene}) => Math.round(getSceneDurationSeconds(scene) * 1000));
const combinedHtml = pageShell({
  title: `Radar Beirut Quote Duel - ${selectedHook.id}`,
  body: `
<main class="stage" data-duration-seconds="${escapeHtml(selectedHook.durationSeconds + combinedSceneDurations.reduce((sum, durationMs) => sum + durationMs, 0) / 1000 + selectedOutro.durationSeconds)}" ${introStageAttrs} data-hook-id="${escapeHtml(selectedHook.id)}">
  ${introScreen()}
  ${reviewScenes.map(({scene, index}) => {
    const durationSeconds = getSceneDurationSeconds(scene);
    return `<section class="scene-screen">${sceneScreen(scene, index, durationSeconds)}</section>`;
  }).join('\n')}
  <section class="scene-screen outro-screen">
    ${outroScreen()}
  </section>
  ${hookAudioElement()}
  <div class="play-gate"><button type="button">تشغيل</button></div>
</main>
${playbackScript({sceneDurations: combinedSceneDurations, outroDuration: selectedOutro.durationSeconds})}`
});

fs.writeFileSync(htmlPath, combinedHtml);

const manifestPath = path.join(outputDir, 'quote-duel-html-manifest.json');
writeJson(manifestPath, {
  generatedAt: new Date().toISOString(),
  selectedHook: {
    id: selectedHook.id,
    text: selectedHook.text,
    durationSeconds: selectedHook.durationSeconds,
    fileName: path.basename(htmlPath)
  },
  outro: {
    text: selectedOutro.text,
    audioText: selectedOutro.audioText,
    durationSeconds: selectedOutro.durationSeconds,
    audioPath: path.relative(cwd, selectedOutro.audioPath).replace(/\\/g, '/')
  },
  duels: duelOutputs.map(({fileName, duelId, sourceIndex, durationSeconds, audioDurationSeconds}) => ({
    fileName,
    duelId,
    sourceIndex,
    durationSeconds,
    audioDurationSeconds
  }))
});

console.log(`Built combined quote duel HTML at ${htmlPath}`);
console.log(`Built ${duelOutputs.length} quote duel clash HTML file(s) in ${outputDir}`);
