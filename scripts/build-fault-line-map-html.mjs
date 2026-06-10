import fs from 'node:fs';
import path from 'node:path';
import {parseCliArgs} from './lib/briefing-helpers.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const dataPath = args.data ? path.resolve(cwd, args.data) : path.join(cwd, 'src', 'data', 'fault-line-map.json');
const htmlPath = args.output ? path.resolve(cwd, args.output) : path.join(cwd, 'radar-beirut-fault-line-map.html');
const introAudioPath = path.join(cwd, 'templates', 'radar-beirut-into-audio-new.mp3');
const outputDir = path.dirname(htmlPath);
const toHtmlRelativePath = (assetPath) => {
  const relativePath = path.relative(outputDir, assetPath).replace(/\\/g, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};
const introAudioSrc = fs.existsSync(introAudioPath) ? toHtmlRelativePath(introAudioPath) : '';

if (!fs.existsSync(dataPath)) {
  console.error(`Missing generated fault line map data: ${dataPath}`);
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
<title>Radar Beirut Fault Line Map</title>
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
    --panel: rgba(8, 23, 35, 0.9);
    --panel-strong: rgba(4, 13, 21, 0.96);
    --line: rgba(120, 172, 205, 0.14);
    --text: #f4efe5;
    --muted: #9ab2c5;
    --accent: #cd7f32;
    --accent-soft: rgba(205, 127, 50, 0.18);
    --cyan: #67bfd8;
    --cyan-soft: rgba(103, 191, 216, 0.16);
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
      radial-gradient(circle at 20% 18%, rgba(205, 127, 50, 0.16), transparent 20%),
      radial-gradient(circle at 78% 12%, rgba(60, 152, 196, 0.18), transparent 25%),
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
      radial-gradient(circle at 22% 18%, rgba(205, 127, 50, 0.12), transparent 18%),
      radial-gradient(circle at 78% 20%, rgba(86, 170, 212, 0.12), transparent 24%),
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
  #vignette {
    position: absolute;
    inset: 0;
  }

  #bg-photo {
    background: url('./logos/video-front-page-3.png') center/cover no-repeat;
    opacity: 0;
    transform: scale(1.08);
    transition: opacity 1.2s ease, transform 6s ease;
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
    background:
      linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.28)),
      radial-gradient(circle at 50% 120%, rgba(205, 127, 50, 0.15), transparent 30%);
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

  .ring {
    position: absolute;
    top: 70px;
    left: 50%;
    width: 250px;
    height: 250px;
    margin-left: -125px;
    border-radius: 50%;
    border: 2px solid rgba(205, 127, 50, 0.55);
    opacity: 0;
    transform: scale(0.86);
    pointer-events: none;
  }

  .ring.is-live {
    animation: ringPulse 2.4s ease-out infinite;
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
    z-index: 3;
  }

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
    font-size: 15px;
    font-weight: 500;
    margin-bottom: 4px;
  }

  #intro-title {
    font-size: 50px;
    line-height: 1.12;
    font-weight: 700;
    margin-bottom: 10px;
  }

  #intro-subtitle {
    color: rgba(212, 222, 232, 0.84);
    font-size: 18px;
    line-height: 1.5;
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

  #axis-card {
    padding: 16px 16px 12px;
  }

  #axis-kicker {
    color: rgba(205, 127, 50, 0.85);
    font-size: 12px;
    letter-spacing: 0.14em;
    font-weight: 500;
    margin-bottom: 6px;
  }

  #axis-headline {
    font-size: 18px;
    line-height: 1.45;
    font-weight: 700;
    margin-bottom: 12px;
  }

  #axis-shell {
    direction: ltr;
  }

  #axis-poles {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    gap: 16px;
  }

  .pole {
    width: 122px;
    padding: 8px 12px;
    border-radius: 16px;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 500;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
  }

  .pole-left {
    color: #f5c08f;
    box-shadow: inset 0 0 0 1px rgba(205, 127, 50, 0.1);
  }

  .pole-right {
    color: #9ed8ea;
    box-shadow: inset 0 0 0 1px rgba(103, 191, 216, 0.1);
  }

  #axis-track {
    position: relative;
    height: 122px;
    border-radius: 24px;
    background:
      radial-gradient(circle at 50% 50%, rgba(205, 127, 50, 0.08), transparent 52%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(0, 0, 0, 0.16));
    border: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }

  #axis-track::before {
    content: "";
    position: absolute;
    left: 18px;
    right: 18px;
    top: 50%;
    height: 4px;
    border-radius: 999px;
    transform: translateY(-50%);
    background: linear-gradient(90deg, rgba(205, 127, 50, 0.9), rgba(103, 191, 216, 0.95));
    box-shadow: 0 0 24px rgba(103, 191, 216, 0.18);
  }

  .axis-tick {
    position: absolute;
    top: 50%;
    width: 1px;
    height: 18px;
    transform: translate(-50%, -50%);
    background: rgba(255, 255, 255, 0.18);
  }

  #marker-layer {
    position: absolute;
    inset: 0;
  }

  .marker {
    position: absolute;
    top: 50%;
    transform: translate(-50%, 36px) scale(0.88);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .marker.is-settled {
    transform: translate(-50%, 0) scale(0.92);
    opacity: 0.64;
  }

  .marker.is-active {
    opacity: 1;
    animation: markerDrop 560ms cubic-bezier(0.2, 0.84, 0.24, 1) forwards;
  }

  .marker.is-highlighted .marker-point {
    box-shadow: 0 0 0 6px rgba(103, 191, 216, 0.12), 0 0 18px rgba(103, 191, 216, 0.5);
  }

  .marker-point {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: #f4efe5;
    border: 3px solid rgba(6, 19, 29, 0.95);
    box-shadow: 0 0 0 4px rgba(205, 127, 50, 0.18), 0 0 18px rgba(205, 127, 50, 0.28);
  }

  .marker.is-active .marker-point {
    box-shadow: 0 0 0 8px rgba(205, 127, 50, 0.12), 0 0 18px rgba(205, 127, 50, 0.5);
  }

  .marker-chip {
    position: absolute;
    left: 50%;
    bottom: 14px;
    min-width: 64px;
    max-width: 86px;
    padding: 8px 8px 7px;
    border-radius: 14px;
    transform: translateX(-50%);
    background: rgba(6, 20, 31, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.08);
    text-align: center;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
  }

  .marker-name {
    font-size: 11px;
    line-height: 1.3;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  #detail-card,
  #synthesis-card,
  #outro-card {
    padding: 14px 16px 16px;
  }

  #detail-top {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    margin-bottom: 14px;
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
    min-height: 48px;
    display: flex;
    align-items: center;
  }

  #detail-headline,
  #synthesis-headline,
  #outro-title {
    font-size: 28px;
    line-height: 1.28;
    font-weight: 700;
    margin-bottom: 10px;
  }

  #detail-rationale,
  #synthesis-summary,
  #outro-body {
    color: rgba(212, 222, 232, 0.86);
    font-size: 17px;
    line-height: 1.65;
    font-weight: 400;
  }

  #detail-quote {
    margin-top: 14px;
    padding: 14px 14px 12px;
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(205, 127, 50, 0.14), rgba(205, 127, 50, 0.04));
    border: 1px solid rgba(205, 127, 50, 0.14);
    color: rgba(244, 239, 229, 0.96);
    font-size: 18px;
    line-height: 1.6;
    font-weight: 500;
  }

  #synthesis-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 14px;
  }

  .meta-pill {
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 500;
    border: 1px solid rgba(103, 191, 216, 0.16);
    background: rgba(103, 191, 216, 0.08);
    color: rgba(212, 222, 232, 0.9);
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

  @keyframes markerDrop {
    0% {
      transform: translate(-50%, -54px) scale(0.82);
      opacity: 0;
    }
    72% {
      transform: translate(-50%, 6px) scale(1.04);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, 0) scale(1);
      opacity: 1;
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
  <div id="grid"></div>
  <div id="ambient"></div>
  <div id="scan-line"></div>
  <canvas id="radar-canvas" width="250" height="250"></canvas>
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
    <div id="intro-subtitle"></div>
    <div id="intro-date"></div>
  </section>

  <main id="content">
    <div id="scene-date-box"></div>

    <section id="axis-card" class="panel">
      <div id="axis-kicker"></div>
      <div id="axis-headline"></div>
      <div id="axis-shell">
        <div id="axis-poles">
          <div id="left-pole" class="pole pole-left"></div>
          <div id="right-pole" class="pole pole-right"></div>
        </div>
        <div id="axis-track">
          <div id="marker-layer"></div>
        </div>
      </div>
    </section>

    <section id="detail-card" class="panel">
      <div id="detail-top">
        <div id="outlet-chip">
          <div id="outlet-logo-box">
            <img id="outlet-logo" alt="">
          </div>
          <div>
            <div id="outlet-name"></div>
          </div>
        </div>
      </div>
      <div id="detail-headline"></div>
      <div id="detail-rationale"></div>
      <div id="detail-quote"></div>
    </section>

    <section id="synthesis-card" class="panel hidden">
      <div id="synthesis-headline"></div>
      <div id="synthesis-summary"></div>
      <div id="synthesis-meta">
        <div class="meta-pill" id="leftmost-pill"></div>
        <div class="meta-pill" id="bridge-pill"></div>
        <div class="meta-pill" id="rightmost-pill"></div>
      </div>
    </section>

    <section id="outro-card" class="panel hidden">
      <div id="outro-title"></div>
      <div id="outro-body"></div>
    </section>
  </main>

</div>

<script id="fault-line-data" type="text/plain">${encodedData}</script>
<script>
  const BRIEFING = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(document.getElementById('fault-line-data').textContent.trim()),
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
    synthesisMs: (BRIEFING.synthesis.durationSeconds || 5) * 1000,
    outroMs: (BRIEFING.outro.durationSeconds || 5) * 1000,
    defaultEntryMs: 2800,
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

  const bgPhoto = document.getElementById('bg-photo');
  const scanLine = document.getElementById('scan-line');
  const flash = document.getElementById('flash');
  const introCopy = document.getElementById('intro-copy');
  const radarCanvas = document.getElementById('radar-canvas');
  const mapCanvas = document.getElementById('map-canvas');
  const rings = Array.from(document.querySelectorAll('.ring'));
  const brackets = Array.from(document.querySelectorAll('.bracket'));
  const content = document.getElementById('content');
  const detailCard = document.getElementById('detail-card');
  const synthesisCard = document.getElementById('synthesis-card');
  const outroCard = document.getElementById('outro-card');
  const introEyebrow = document.getElementById('intro-eyebrow');
  const introTitle = document.getElementById('intro-title');
  const introSubtitle = document.getElementById('intro-subtitle');
  const introDate = document.getElementById('intro-date');
  const sceneDateBox = document.getElementById('scene-date-box');
  const axisKicker = document.getElementById('axis-kicker');
  const axisHeadline = document.getElementById('axis-headline');
  const leftPole = document.getElementById('left-pole');
  const rightPole = document.getElementById('right-pole');
  const axisTrack = document.getElementById('axis-track');
  const markerLayer = document.getElementById('marker-layer');
  const outletLogo = document.getElementById('outlet-logo');
  const outletName = document.getElementById('outlet-name');
  const detailHeadline = document.getElementById('detail-headline');
  const detailRationale = document.getElementById('detail-rationale');
  const detailQuote = document.getElementById('detail-quote');
  const synthesisHeadline = document.getElementById('synthesis-headline');
  const synthesisSummary = document.getElementById('synthesis-summary');
  const leftmostPill = document.getElementById('leftmost-pill');
  const bridgePill = document.getElementById('bridge-pill');
  const rightmostPill = document.getElementById('rightmost-pill');
  const outroTitle = document.getElementById('outro-title');
  const outroBody = document.getElementById('outro-body');
  let activeEntryIndex = -1;
  let phaseStart = 0;
  let phaseDuration = PLAYBACK_CONFIG.introMs;
  let phaseType = 'intro';
  let ended = false;

  introEyebrow.textContent = '';
  introTitle.textContent = BRIEFING.intro && BRIEFING.intro.title ? BRIEFING.intro.title : 'الصحافة اليوم';
  introSubtitle.textContent = BRIEFING.intro.subtitle || '';
  introDate.textContent = BRIEFING.meta.dateLabel;
  sceneDateBox.textContent = BRIEFING.meta.dateLabel;
  axisKicker.textContent = BRIEFING.axis.label;
  axisHeadline.textContent = BRIEFING.axis.headline || ('خط التوتر بين ' + BRIEFING.axis.leftPole + ' و' + BRIEFING.axis.rightPole);
  leftPole.textContent = BRIEFING.axis.leftPole;
  rightPole.textContent = BRIEFING.axis.rightPole;
  synthesisHeadline.textContent = BRIEFING.synthesis.headline;
  synthesisSummary.textContent = BRIEFING.synthesis.summary;
  leftmostPill.textContent = 'أقرب إلى ' + BRIEFING.axis.leftPole + ': ' + BRIEFING.synthesis.leftMostOutlet;
  bridgePill.textContent = 'الأقرب إلى الوسط: ' + BRIEFING.synthesis.bridgeOutlet;
  rightmostPill.textContent = 'أقرب إلى ' + BRIEFING.axis.rightPole + ': ' + BRIEFING.synthesis.rightMostOutlet;
  outroTitle.textContent = BRIEFING.outro.title;
  outroBody.textContent = BRIEFING.outro.body;

  for (let i = 0; i <= 4; i += 1) {
    const tick = document.createElement('div');
    tick.className = 'axis-tick';
    tick.style.left = (18 + (i / 4) * (axisTrack.clientWidth - 36)) + 'px';
    axisTrack.appendChild(tick);
  }

  const markers = BRIEFING.entries.map(function (entry) {
    const marker = document.createElement('div');
    marker.className = 'marker';
    marker.style.left = (18 + entry.position * (axisTrack.clientWidth - 36)) + 'px';
    marker.innerHTML =
      '<div class="marker-chip">' +
        '<div class="marker-name">' + entry.outlet.name + '</div>' +
      '</div>' +
      '<div class="marker-point"></div>';
    markerLayer.appendChild(marker);
    return marker;
  });

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

  function setMarkerState(index, state) {
    const marker = markers[index];
    marker.classList.remove('is-active', 'is-settled', 'is-highlighted');
    if (state) {
      marker.classList.add(state);
    }
  }

  function renderEntry(entry) {
    outletLogo.src = './public/outlet-logos/' + entry.outlet.logoFile;
    outletLogo.alt = entry.outlet.name;
    outletName.textContent = entry.outlet.name;
    detailHeadline.textContent = entry.headline;
    detailRationale.textContent = entry.rationale;
    detailQuote.textContent = '«' + entry.quote + '»';
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
    detailCard.classList.remove('hidden');
    synthesisCard.classList.add('hidden');
    outroCard.classList.add('hidden');
    markers.forEach(function (_, index) {
      setMarkerState(index, '');
    });
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
    detailCard.classList.remove('hidden');
    synthesisCard.classList.add('hidden');
    outroCard.classList.add('hidden');

    markers.forEach(function (_, markerIndex) {
      if (markerIndex < index) {
        setMarkerState(markerIndex, 'is-settled');
      } else if (markerIndex === index) {
        setMarkerState(markerIndex, 'is-active');
      } else {
        setMarkerState(markerIndex, '');
      }
    });

  }

  function showSynthesis() {
    phaseType = 'synthesis';
    phaseStart = performance.now();
    phaseDuration = PLAYBACK_CONFIG.synthesisMs;

    detailCard.classList.add('hidden');
    synthesisCard.classList.remove('hidden');
    outroCard.classList.add('hidden');
    markers.forEach(function (_, index) {
      setMarkerState(index, 'is-settled');
    });

    const highlightNames = [
      BRIEFING.synthesis.leftMostOutlet,
      BRIEFING.synthesis.bridgeOutlet,
      BRIEFING.synthesis.rightMostOutlet
    ];

    BRIEFING.entries.forEach(function (entry, index) {
      if (highlightNames.indexOf(entry.outlet.name) !== -1) {
        markers[index].classList.add('is-highlighted');
      }
    });

  }

  function showOutro() {
    phaseType = 'outro';
    phaseStart = performance.now();
    phaseDuration = PLAYBACK_CONFIG.outroMs;

    detailCard.classList.add('hidden');
    synthesisCard.classList.add('hidden');
    outroCard.classList.remove('hidden');
  }

  function drawRadar(now) {
    const ctx = radarCanvas.getContext('2d');
    const w = radarCanvas.width;
    const h = radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = 108;
    const sweep = ((now / 18) % 360) * Math.PI / 180;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(103, 191, 216, 0.22)';
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
    gradient.addColorStop(0, 'rgba(205, 127, 50, 0.22)');
    gradient.addColorStop(1, 'rgba(205, 127, 50, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, sweep - 0.34, sweep + 0.06);
    ctx.closePath();
    ctx.fill();
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
      showOutro();
    } else if (phaseType === 'outro' && phaseElapsed >= PLAYBACK_CONFIG.outroMs) {
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
console.log(`Built fault line map HTML at ${htmlPath}`);
