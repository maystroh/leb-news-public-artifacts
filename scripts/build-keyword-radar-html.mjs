import fs from 'node:fs';
import path from 'node:path';
import {parseCliArgs} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const dataPath = args.data ? path.resolve(cwd, args.data) : path.join(cwd, 'src', 'data', 'keyword-radar.json');
const htmlPath = args.output ? path.resolve(cwd, args.output) : path.join(cwd, 'radar-beirut-keyword-radar.html');
const introAudioPath = path.join(cwd, 'templates', 'radar-beirut-into-audio-new.mp3');
const outputDir = path.dirname(htmlPath);
const toHtmlRelativePath = (assetPath) => {
  const relativePath = path.relative(outputDir, assetPath).replace(/\\/g, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};
const introAudioSrc = fs.existsSync(introAudioPath) ? toHtmlRelativePath(introAudioPath) : '';

if (!fs.existsSync(dataPath)) {
  console.error(`Missing generated keyword radar data: ${dataPath}`);
  console.error('Run `node ./scripts/prepare-briefing.mjs` first.');
  process.exit(1);
}

const dataJson = fs.readFileSync(dataPath, 'utf8');
const encodedData = Buffer.from(dataJson, 'utf8').toString('base64');

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Radar Beirut Keyword Radar</title>
<style>
  @font-face {
    font-family: "Dubai";
    src: url("./fonts/Dubai-Regular.ttf") format("truetype");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: "Dubai";
    src: url("./fonts/Dubai-Medium.ttf") format("truetype");
    font-weight: 500;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: "Dubai";
    src: url("./fonts/Dubai-Bold.ttf") format("truetype");
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }

  :root {
    --bg: #050d14;
    --bg-deep: #02080d;
    --panel: rgba(7, 19, 30, 0.92);
    --panel-strong: rgba(5, 13, 22, 0.96);
    --line: rgba(120, 172, 205, 0.12);
    --text: #f4efe5;
    --muted: #9ab2c5;
    --accent: #cd7f32;
    --accent-soft: rgba(205, 127, 50, 0.18);
    --cyan: #67bfd8;
    --cyan-soft: rgba(103, 191, 216, 0.14);
    --shadow: 0 24px 60px rgba(0, 0, 0, 0.34);
    --scan-sweep-duration: 3200ms;
    --font-arabic: "Dubai", "Noto Naskh Arabic", Tahoma, "Segoe UI", Arial, sans-serif;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 18% 16%, rgba(205, 127, 50, 0.16), transparent 18%),
      radial-gradient(circle at 80% 14%, rgba(103, 191, 216, 0.18), transparent 22%),
      linear-gradient(180deg, #06131d, #03080d 72%);
    color: var(--text);
    overflow: hidden;
    font-family: var(--font-arabic);
    font-weight: 400;
  }

  #stage {
    position: relative;
    width: min(100vw, 405px);
    aspect-ratio: 9 / 16;
    overflow: hidden;
    background:
      radial-gradient(circle at 24% 18%, rgba(205, 127, 50, 0.11), transparent 18%),
      radial-gradient(circle at 74% 22%, rgba(103, 191, 216, 0.12), transparent 22%),
      linear-gradient(180deg, var(--bg-deep), var(--bg));
    border: 1px solid rgba(205, 127, 50, 0.18);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  }

  #audio-gate {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 50% 44%, rgba(205, 127, 50, 0.2), transparent 28%),
      rgba(2, 8, 13, 0.42);
    transition: opacity 260ms ease;
  }

  #audio-gate.is-hidden {
    opacity: 0;
    pointer-events: none;
  }

  #audio-gate-button {
    width: 116px;
    height: 116px;
    border-radius: 50%;
    border: 1px solid rgba(205, 127, 50, 0.78);
    background: rgba(5, 13, 20, 0.84);
    color: var(--text);
    cursor: pointer;
    font-family: var(--font-arabic);
    font-size: 21px;
    font-weight: 700;
    box-shadow: 0 18px 46px rgba(0, 0, 0, 0.38), inset 0 0 26px rgba(205, 127, 50, 0.18);
  }

  #audio-gate-button:focus-visible {
    outline: 2px solid var(--cyan);
    outline-offset: 5px;
  }

  #bg-photo,
  #grid,
  #ambient,
  #scan-line,
  #flash,
  #vignette,
  #bg-noise {
    position: absolute;
    inset: 0;
  }

  #bg-photo {
    background: url('./logos/video-front-page-3.png') center/cover no-repeat;
    opacity: 0;
    transform: scale(1.08);
    transition: opacity 1.2s ease, transform 6s ease;
  }

  #bg-noise {
    background:
      linear-gradient(180deg, rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.26)),
      radial-gradient(circle at 50% 120%, rgba(205, 127, 50, 0.14), transparent 30%);
    opacity: 0.9;
  }

  #grid {
    inset: -18%;
    background-image:
      linear-gradient(var(--line) 1px, transparent 1px),
      linear-gradient(90deg, var(--line) 1px, transparent 1px);
    background-size: 44px 44px;
    transform: rotate(-8deg) scale(1.08);
    opacity: 0.7;
    animation: driftGrid 22s linear infinite;
  }

  #ambient {
    pointer-events: none;
  }

  #scan-line {
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
    opacity: 0;
    pointer-events: none;
    animation: scanSweepLoop var(--scan-sweep-duration) linear infinite;
  }

  #flash {
    background: #fff;
    opacity: 0;
    pointer-events: none;
  }

  #vignette {
    background: radial-gradient(circle at center, transparent 28%, rgba(0, 0, 0, 0.6) 100%);
    pointer-events: none;
  }

  #radar-canvas {
    position: absolute;
    top: 70px;
    left: 50%;
    width: 250px;
    height: 250px;
    margin-left: -125px;
    opacity: 0;
    transition: opacity 0.6s ease;
    z-index: 2;
  }

  .ring {
    position: absolute;
    top: 70px;
    left: 50%;
    width: 250px;
    height: 250px;
    margin-left: -125px;
    border-radius: 50%;
    border: 2px solid rgba(205, 127, 50, 0.5);
    opacity: 0;
    transform: scale(0.86);
    pointer-events: none;
  }

  .ring.is-live {
    animation: ringPulse 2.6s ease-out infinite;
  }

  .bracket {
    position: absolute;
    width: 40px;
    height: 40px;
    opacity: 0;
    transition: opacity 0.4s ease;
  }

  .bracket::before,
  .bracket::after {
    content: "";
    position: absolute;
    background: rgba(205, 127, 50, 0.9);
    box-shadow: 0 0 8px rgba(205, 127, 50, 0.82);
  }

  .bracket::before {
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
  }

  .bracket::after {
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
  }

  .bracket.tl { top: 10px; left: 10px; }
  .bracket.tr { top: 10px; right: 10px; transform: scaleX(-1); }
  .bracket.bl { bottom: 10px; left: 10px; transform: scaleY(-1); }
  .bracket.br { bottom: 10px; right: 10px; transform: scale(-1, -1); }

  #map-canvas {
    position: absolute;
    top: 398px;
    left: calc(50% + 62px);
    width: 175px;
    height: 120px;
    margin-left: -87.5px;
    opacity: 0;
    transition: opacity 0.6s ease;
    pointer-events: none;
    z-index: 3;
  }

  #intro-copy {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 20px 22px 30px;
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.9) 0%, transparent 100%);
    text-align: center;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.8s ease, transform 0.8s ease;
    z-index: 6;
  }

  #intro-eyebrow {
    color: rgba(205, 127, 50, 0.92);
    font-size: 17px;
    font-weight: 500;
    margin-bottom: 0;
  }

  #intro-title {
    font-size: 46px;
    line-height: 1.18;
    font-weight: 700;
    margin-bottom: 12px;
  }

  #intro-date {
    color: rgba(205, 127, 50, 0.84);
    font-family: var(--font-arabic);
    font-size: 11px;
    letter-spacing: 0.16em;
    font-weight: 500;
  }

  #content {
    position: absolute;
    inset: 18px 18px 78px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    opacity: 0;
    transition: opacity 0.45s ease;
    z-index: 7;
  }

  #content.is-visible {
    opacity: 1;
  }

  .panel {
    background: linear-gradient(180deg, rgba(10, 28, 42, 0.9), var(--panel-strong));
    border: 1px solid rgba(107, 162, 197, 0.16);
    border-radius: 26px;
    box-shadow: var(--shadow);
    backdrop-filter: blur(10px);
  }

  .hidden {
    display: none;
  }

  #scene-date-box {
    align-self: center;
    border: 1px solid rgba(205, 127, 50, 0.24);
    background: rgba(0, 0, 0, 0.42);
    color: rgba(212, 222, 232, 0.9);
    padding: 6px 12px;
    border-radius: 999px;
    font-family: var(--font-arabic);
    font-size: 12px;
    letter-spacing: 0.14em;
    font-weight: 500;
    direction: ltr;
    backdrop-filter: blur(8px);
    width: min(260px, calc(100% - 72px));
    text-align: center;
  }

  #scene-card {
    padding: 16px 16px 18px;
    margin-top: 92px;
  }

  #scene-top {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    margin-bottom: 16px;
  }

  #outlet-chip {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  #outlet-logo-box {
    width: 96px;
    height: 48px;
    border-radius: 14px;
    background: rgba(244, 247, 250, 0.97);
    border: 1px solid rgba(205, 127, 50, 0.16);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
  }

  #outlet-logo {
    max-width: 76px;
    max-height: 30px;
    object-fit: contain;
  }

  #outlet-name {
    font-size: 24px;
    line-height: 1.2;
    font-weight: 700;
    margin-bottom: 4px;
  }

  #scene-label {
    color: rgba(212, 222, 232, 0.74);
    font-size: 13px;
    line-height: 1.4;
    font-weight: 500;
  }

  #term-grid {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
  }

  .term-chip {
    position: relative;
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 16px;
    border-radius: 20px;
    border: 1px solid rgba(205, 127, 50, 0.1);
    background: linear-gradient(180deg, rgba(6, 20, 31, 0.94), rgba(5, 14, 23, 0.98));
    text-align: center;
    overflow: hidden;
    opacity: 0.32;
    transform: scale(0.96);
    transition: opacity 0.28s ease, transform 0.28s ease, border-color 0.28s ease;
  }

  .term-chip::before {
    content: "";
    position: absolute;
    inset: -30%;
    background: radial-gradient(circle, rgba(205, 127, 50, 0.22), transparent 55%);
    opacity: 0;
    transform: scale(0.6);
  }

  .term-chip.is-active {
    opacity: 1;
    transform: scale(1);
    border-color: rgba(205, 127, 50, 0.34);
    box-shadow: inset 0 0 0 1px rgba(205, 127, 50, 0.08), 0 0 28px rgba(205, 127, 50, 0.12);
  }

  .term-chip.is-active::before {
    animation: chipPulse 900ms ease-out;
  }

  .term-chip.is-settled {
    opacity: 0.84;
    transform: scale(1);
  }

  .term-text {
    position: relative;
    z-index: 1;
    font-size: 25px;
    line-height: 1.34;
    font-weight: 700;
  }

  #scene-summary {
    color: rgba(212, 222, 232, 0.84);
    font-size: 16px;
    line-height: 1.65;
    font-weight: 400;
  }

  #synthesis-card {
    padding: 16px 16px 18px;
  }

  #synthesis-headline {
    font-size: 28px;
    line-height: 1.28;
    font-weight: 700;
    margin-bottom: 10px;
  }

  #synthesis-summary {
    color: rgba(212, 222, 232, 0.86);
    font-size: 17px;
    line-height: 1.65;
    font-weight: 400;
  }

  #cluster-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .legend-pill {
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 500;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(212, 222, 232, 0.92);
  }

  #synthesis-radar {
    position: relative;
    height: 260px;
    margin-top: 16px;
    border-radius: 24px;
    overflow: hidden;
    background:
      radial-gradient(circle at center, rgba(103, 191, 216, 0.08), transparent 52%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(0, 0, 0, 0.16));
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  #synthesis-radar::before,
  #synthesis-radar::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px solid rgba(103, 191, 216, 0.12);
  }

  #synthesis-radar::before {
    width: 72%;
    height: 72%;
  }

  #synthesis-radar::after {
    width: 42%;
    height: 42%;
  }

  .crosshair {
    position: absolute;
    background: rgba(103, 191, 216, 0.12);
  }

  .crosshair-x {
    left: 8%;
    right: 8%;
    top: 50%;
    height: 1px;
  }

  .crosshair-y {
    top: 8%;
    bottom: 8%;
    left: 50%;
    width: 1px;
  }

  .cluster-node {
    position: absolute;
    width: 126px;
    padding: 12px 12px 10px;
    border-radius: 18px;
    transform: translate(-50%, -50%) scale(0.94);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(5, 14, 23, 0.9);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .cluster-node.is-visible {
    opacity: 1;
    animation: clusterSettle 540ms cubic-bezier(0.2, 0.84, 0.24, 1) forwards;
  }

  .cluster-label {
    font-size: 12px;
    line-height: 1.35;
    margin-bottom: 8px;
    color: rgba(244, 239, 229, 0.95);
  }

  .cluster-terms {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cluster-term {
    font-size: 11px;
    line-height: 1.35;
    color: rgba(212, 222, 232, 0.84);
  }

  @keyframes driftGrid {
    from { transform: rotate(-8deg) scale(1.08) translate3d(0, 0, 0); }
    to { transform: rotate(-8deg) scale(1.08) translate3d(-24px, -18px, 0); }
  }

  @keyframes scanSweepLoop {
    0% { transform: translateX(0) skewX(-15deg); }
    100% { transform: translateX(290px) skewX(-15deg); }
  }

  @keyframes ringPulse {
    0% {
      opacity: 0.72;
      transform: scale(0.86);
    }
    100% {
      opacity: 0;
      transform: scale(1.24);
    }
  }

  @keyframes chipPulse {
    0% {
      opacity: 0.8;
      transform: scale(0.6);
    }
    100% {
      opacity: 0;
      transform: scale(1.26);
    }
  }

  @keyframes clusterSettle {
    0% {
      transform: translate(-50%, -50%) scale(0.82);
    }
    76% {
      transform: translate(-50%, -50%) scale(1.02);
    }
    100% {
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
</head>
<body>
<div id="stage">
  <div id="audio-gate">
    <button id="audio-gate-button" type="button">تشغيل</button>
  </div>
  <div id="bg-photo"></div>
  <div id="bg-noise"></div>
  <div id="grid"></div>
  <div id="ambient"></div>
  <div id="scan-line"></div>
  <canvas id="radar-canvas" width="260" height="260"></canvas>
  <canvas id="map-canvas" width="175" height="120"></canvas>
  <div class="ring"></div>
  <div class="ring"></div>
  <div class="ring"></div>
  <div class="bracket tl"></div>
  <div class="bracket tr"></div>
  <div class="bracket bl"></div>
  <div class="bracket br"></div>
  <div id="flash"></div>
  <div id="vignette"></div>

  <section id="intro-copy">
    <div id="intro-eyebrow"></div>
    <div id="intro-title"></div>
    <div id="intro-date"></div>
  </section>

  <main id="content">
    <div id="scene-date-box"></div>

    <section id="scene-card" class="panel">
      <div id="scene-top">
        <div id="outlet-chip">
          <div id="outlet-logo-box">
            <img id="outlet-logo" alt="">
          </div>
          <div>
            <div id="outlet-name"></div>
            <div id="scene-label"></div>
          </div>
        </div>
      </div>

      <div id="term-grid"></div>
      <div id="scene-summary"></div>
    </section>

    <section id="synthesis-card" class="panel hidden">
      <div id="synthesis-headline"></div>
      <div id="synthesis-summary"></div>
      <div id="cluster-legend"></div>
      <div id="synthesis-radar">
        <div class="crosshair crosshair-x"></div>
        <div class="crosshair crosshair-y"></div>
      </div>
    </section>

  </main>

</div>

<script id="keyword-radar-data" type="text/plain">${encodedData}</script>
<script>
  const BRIEFING = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(document.getElementById('keyword-radar-data').textContent.trim()),
        function (char) { return char.charCodeAt(0); }
      )
    )
  );

  const PLAYBACK_CONFIG = {
    introMs: (BRIEFING.intro && BRIEFING.intro.durationSeconds ? BRIEFING.intro.durationSeconds : 8) * 1000,
    introTextRevealMs: (
      typeof (BRIEFING.intro && BRIEFING.intro.textRevealSeconds) === 'number'
        ? BRIEFING.intro.textRevealSeconds * 1000
        : Math.max(0, (((BRIEFING.intro && BRIEFING.intro.durationSeconds) || 8) - 3) * 1000)
    ),
    synthesisMs: (BRIEFING.synthesis.durationSeconds || 6) * 1000,
    defaultEntryMs: 6000,
    termRevealStepMs: 820,
    ambientMotion: {
      scanSweepDurationMs: 3200
    }
  };

  const getEntryDurationMs = function (entry) {
    return (entry.durationSeconds ? entry.durationSeconds * 1000 : null) || PLAYBACK_CONFIG.defaultEntryMs;
  };

  const stage = document.getElementById('stage');
  stage.style.setProperty('--scan-sweep-duration', PLAYBACK_CONFIG.ambientMotion.scanSweepDurationMs + 'ms');
  const audioGate = document.getElementById('audio-gate');
  const audioGateButton = document.getElementById('audio-gate-button');

  const flash = document.getElementById('flash');
  const bgPhoto = document.getElementById('bg-photo');
  const introCopy = document.getElementById('intro-copy');
  const radarCanvas = document.getElementById('radar-canvas');
  const mapCanvas = document.getElementById('map-canvas');
  const scanLine = document.getElementById('scan-line');
  const rings = Array.from(document.querySelectorAll('.ring'));
  const brackets = Array.from(document.querySelectorAll('.bracket'));
  const content = document.getElementById('content');
  const sceneCard = document.getElementById('scene-card');
  const synthesisCard = document.getElementById('synthesis-card');
  const introEyebrow = document.getElementById('intro-eyebrow');
  const introTitle = document.getElementById('intro-title');
  const introDate = document.getElementById('intro-date');
  const sceneDateBox = document.getElementById('scene-date-box');
  const outletLogo = document.getElementById('outlet-logo');
  const outletName = document.getElementById('outlet-name');
  const sceneLabel = document.getElementById('scene-label');
  const termGrid = document.getElementById('term-grid');
  const sceneSummary = document.getElementById('scene-summary');
  const synthesisHeadline = document.getElementById('synthesis-headline');
  const synthesisSummary = document.getElementById('synthesis-summary');
  const clusterLegend = document.getElementById('cluster-legend');
  const synthesisRadar = document.getElementById('synthesis-radar');
  let activeEntryIndex = -1;
  let phaseStart = 0;
  let phaseDuration = PLAYBACK_CONFIG.introMs;
  let phaseType = 'intro';
  let ended = false;
  let synthesisNodes = [];
  let termElements = [];

  introEyebrow.textContent = '';
  introTitle.textContent = BRIEFING.intro && BRIEFING.intro.title ? BRIEFING.intro.title : 'الصحافة اليوم';
  introDate.textContent = BRIEFING.meta.dateLabel;
  sceneDateBox.textContent = BRIEFING.meta.dateLabel;
  synthesisHeadline.textContent = BRIEFING.synthesis.headline;
  synthesisSummary.textContent = BRIEFING.synthesis.summary;

  const mapPoints = [
    {x: 0.42, y: 0.20, label: 'Hamra', offset: 0},
    {x: 0.58, y: 0.18, label: 'Gemmayzeh', offset: 8},
    {x: 0.65, y: 0.35, label: 'Achrafieh', offset: 18},
    {x: 0.38, y: 0.38, label: 'Verdun', offset: 26},
    {x: 0.28, y: 0.26, label: 'Mreisseh', offset: 34},
    {x: 0.52, y: 0.55, label: 'Badaro', offset: 44},
    {x: 0.70, y: 0.25, label: 'Mar Mikhael', offset: 52}
  ];
  const INTRO_AUDIO_SRC = ${JSON.stringify(introAudioSrc)};
  let introAudio = null;

  function stopIntroAudio() {
    if (!introAudio) return;
    introAudio.pause();
    introAudio.removeAttribute('src');
    introAudio.load();
    introAudio = null;
  }

  function playIntroAudio() {
    stopIntroAudio();
    if (!INTRO_AUDIO_SRC) return;

    introAudio = new Audio(INTRO_AUDIO_SRC);
    introAudio.preload = 'auto';
    introAudio.playsInline = true;
    introAudio.play().catch(function (error) {
      console.warn('Could not autoplay intro audio:', error);
    });
  }

  function familyLabel(familyId) {
    const family = BRIEFING.clusters.find(function (cluster) { return cluster.id === familyId; });
    return family ? family.label : '';
  }

  function renderEntry(entry) {
    outletLogo.src = './public/outlet-logos/' + entry.outlet.logoFile;
    outletLogo.alt = entry.outlet.name;
    outletName.textContent = entry.outlet.name;
    sceneLabel.textContent = entry.sceneLabel;
    sceneSummary.textContent = entry.summary;
    termGrid.innerHTML = '';

    termElements = entry.terms.map(function (term) {
      const chip = document.createElement('div');
      chip.className = 'term-chip';

      const text = document.createElement('div');
      text.className = 'term-text';
      text.textContent = term.text;

      chip.appendChild(text);
      termGrid.appendChild(chip);
      return chip;
    });
  }

  function renderSynthesisNodes() {
    synthesisNodes.forEach(function (node) {
      node.remove();
    });
    synthesisNodes = [];

    const clustersById = new Map(
      BRIEFING.clusters.map(function (cluster) { return [cluster.id, cluster]; })
    );

    const groupedTerms = new Map();

    BRIEFING.entries.forEach(function (entry) {
      entry.terms.forEach(function (term) {
        if (!groupedTerms.has(term.family)) {
          groupedTerms.set(term.family, []);
        }

        groupedTerms.get(term.family).push(term.text);
      });
    });

    clusterLegend.innerHTML = '';

    BRIEFING.clusters.forEach(function (cluster) {
      if (!groupedTerms.has(cluster.id)) {
        return;
      }

      const pill = document.createElement('div');
      pill.className = 'legend-pill';
      pill.textContent = cluster.label;
      pill.style.borderColor = cluster.color + '40';
      pill.style.background = cluster.color + '18';
      clusterLegend.appendChild(pill);

      const node = document.createElement('div');
      node.className = 'cluster-node';
      node.style.left = (cluster.position.x * 100) + '%';
      node.style.top = (cluster.position.y * 100) + '%';
      node.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.22), 0 0 0 1px ' + cluster.color + '22';
      node.style.borderColor = cluster.color + '44';

      const label = document.createElement('div');
      label.className = 'cluster-label';
      label.style.color = cluster.color;
      label.textContent = cluster.label;
      node.appendChild(label);

      const termsWrap = document.createElement('div');
      termsWrap.className = 'cluster-terms';

      groupedTerms.get(cluster.id).slice(0, 4).forEach(function (termText) {
        const term = document.createElement('div');
        term.className = 'cluster-term';
        term.textContent = termText;
        termsWrap.appendChild(term);
      });

      node.appendChild(termsWrap);
      synthesisRadar.appendChild(node);
      synthesisNodes.push(node);
    });
  }

  function showIntro() {
    phaseType = 'intro';
    phaseStart = performance.now();
    phaseDuration = PLAYBACK_CONFIG.introMs;
    playIntroAudio();

    flash.animate([{opacity: 0.42}, {opacity: 0}], {duration: 500, fill: 'forwards'});
    bgPhoto.style.transition = 'none';
    bgPhoto.style.opacity = '0';
    bgPhoto.style.transform = 'scale(1.08)';
    void bgPhoto.offsetWidth;
    bgPhoto.style.transition = 'opacity 1.2s ease, transform 6s ease';
    bgPhoto.style.opacity = '1';
    bgPhoto.style.transform = 'scale(1)';
    scanLine.style.opacity = '1';
    setTimeout(function () { radarCanvas.style.opacity = '1'; }, 900);
    setTimeout(function () {
      rings.forEach(function (ring, index) {
        ring.classList.add('is-live');
        ring.style.animationDelay = index * 0.7 + 's';
        ring.style.opacity = '1';
      });
    }, 1200);
    setTimeout(function () {
      brackets.forEach(function (bracket, index) {
        setTimeout(function () { bracket.style.opacity = '1'; }, index * 90);
      });
    }, 1300);
    setTimeout(function () { mapCanvas.style.opacity = '1'; }, 1900);
    setTimeout(function () {
      introCopy.style.opacity = '1';
      introCopy.style.transform = 'translateY(0)';
    }, PLAYBACK_CONFIG.introTextRevealMs);
    content.classList.remove('is-visible');
    sceneCard.classList.remove('hidden');
    synthesisCard.classList.add('hidden');
  }

  function showEntry(index) {
    const entry = BRIEFING.entries[index];
    activeEntryIndex = index;
    phaseType = 'entry';
    phaseStart = performance.now();
    phaseDuration = getEntryDurationMs(entry);
    stopIntroAudio();
    renderEntry(entry);

    introCopy.style.opacity = '0';
    introCopy.style.transform = 'translateY(20px)';
    content.classList.add('is-visible');
    sceneCard.classList.remove('hidden');
    synthesisCard.classList.add('hidden');
  }

  function showSynthesis() {
    phaseType = 'synthesis';
    phaseStart = performance.now();
    phaseDuration = PLAYBACK_CONFIG.synthesisMs;

    sceneCard.classList.add('hidden');
    synthesisCard.classList.remove('hidden');
    renderSynthesisNodes();
    synthesisNodes.forEach(function (node, index) {
      window.setTimeout(function () {
        node.classList.add('is-visible');
      }, index * 180);
    });

  }

  function updateTermReveal(elapsed) {
    if (phaseType !== 'entry') return;

    const revealCount = Math.min(
      termElements.length,
      Math.floor(elapsed / PLAYBACK_CONFIG.termRevealStepMs) + 1
    );

    termElements.forEach(function (element, index) {
      element.classList.remove('is-active', 'is-settled');
      if (index < revealCount - 1) {
        element.classList.add('is-settled');
      } else if (index === revealCount - 1) {
        element.classList.add('is-active');
      }
    });
  }

  function drawRadar(now) {
    const ctx = radarCanvas.getContext('2d');
    const w = radarCanvas.width;
    const h = radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = 114;
    const sweep = ((now / 18) % 360) * Math.PI / 180;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(103, 191, 216, 0.2)';
    ctx.lineWidth = 1;

    for (let i = 1; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, (r / 4) * i, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, 'rgba(205, 127, 50, 0.2)');
    gradient.addColorStop(1, 'rgba(205, 127, 50, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, sweep - 0.34, sweep + 0.06);
    ctx.closePath();
    ctx.fill();

    if (phaseType === 'entry' && activeEntryIndex >= 0) {
      const entry = BRIEFING.entries[activeEntryIndex];
      entry.terms.forEach(function (term, index) {
        const angle = (-90 + index * 34 + activeEntryIndex * 6) * Math.PI / 180;
        const radius = 34 + (term.weight || 0.7) * 64;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const pulse = index === Math.min(termElements.length - 1, Math.floor((performance.now() - phaseStart) / PLAYBACK_CONFIG.termRevealStepMs))
          ? 1
          : 0.45;

        ctx.fillStyle = 'rgba(205, 127, 50, ' + (0.4 + pulse * 0.45) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 3.2 + pulse * 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function drawMap(now) {
    const ctx = mapCanvas.getContext('2d');
    const w = mapCanvas.width;
    const h = mapCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(103, 191, 216, 0.18)';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(26, 62);
    ctx.lineTo(46, 28);
    ctx.lineTo(82, 18);
    ctx.lineTo(128, 28);
    ctx.lineTo(150, 56);
    ctx.lineTo(138, 88);
    ctx.lineTo(92, 104);
    ctx.lineTo(56, 98);
    ctx.closePath();
    ctx.stroke();

    mapPoints.forEach(function (point) {
      const cycle = ((now / 28) + point.offset) % 90;
      const progress = cycle / 90;
      const rippleScale = 0.4 + progress * 1.6;
      const rippleOpacity = Math.max(0, 0.7 - progress * 0.7);
      const labelOpacity = Math.max(0, 1 - progress * 1.4);
      const x = point.x * w;
      const y = point.y * h;

      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(205,127,50,0.95)';
      ctx.shadowColor = 'rgba(255,180,60,0.88)';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(x, y, 4 + rippleScale * 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(205,127,50,' + rippleOpacity + ')';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(180,220,255,' + labelOpacity + ')';
      ctx.font = '8px Segoe UI';
      ctx.fillText(point.label, x + 5, y - 4);
    });
  }

  function tick(now) {
    drawRadar(now);
    drawMap(now);

    if (!phaseStart) phaseStart = now;

    const phaseElapsed = now - phaseStart;
    updateTermReveal(phaseElapsed);

    if (phaseType === 'intro' && phaseElapsed >= PLAYBACK_CONFIG.introMs) {
      showEntry(0);
    } else if (phaseType === 'entry' && phaseElapsed >= phaseDuration) {
      const nextIndex = activeEntryIndex + 1;
      if (nextIndex >= BRIEFING.entries.length) {
        showSynthesis();
      } else {
        showEntry(nextIndex);
      }
    } else if (phaseType === 'synthesis' && phaseElapsed >= PLAYBACK_CONFIG.synthesisMs) {
      ended = true;
    }

    if (!ended) requestAnimationFrame(tick);
  }

  audioGateButton.addEventListener('click', function () {
    audioGate.classList.add('is-hidden');
    showIntro();
    requestAnimationFrame(tick);
  }, {once: true});
</script>
</body>
</html>
`;

fs.writeFileSync(htmlPath, html);
console.log(`Built keyword radar HTML at ${htmlPath}`);
