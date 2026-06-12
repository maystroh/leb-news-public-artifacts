import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

const DEFAULT_FPS = 30;
const INTRO_STAGE_WIDTH = 405;
const INTRO_STAGE_HEIGHT = 720;

const fpsFromSeconds = (seconds, fps = DEFAULT_FPS) => Math.max(1, Math.round((seconds || 0) * fps));
const framesFromMs = (ms, fps = DEFAULT_FPS) => Math.round((ms / 1000) * fps);
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const cssEase = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const calculateProductionDurationInFrames = (briefing, fps = DEFAULT_FPS) => {
  const introSeconds = briefing?.intro?.durationSeconds || 0;
  const sceneSeconds = (briefing?.scenes || []).reduce((sum, scene) => sum + (scene.durationSeconds || 0), 0);
  const outroSeconds = briefing?.outro?.durationSeconds || 0;
  return fpsFromSeconds(introSeconds + sceneSeconds + outroSeconds, fps);
};

export const calculateProductionIntroDurationInFrames = (briefing, fps = DEFAULT_FPS) => {
  return fpsFromSeconds(briefing?.intro?.durationSeconds || 8, fps);
};

const palette = {
  bg: '#071822',
  bgDeep: '#030d14',
  ink: '#eef3f6',
  accent: '#d9702f',
  gold: '#d38b3f',
  muted: '#9bb2c2',
  line: 'rgba(124, 172, 204, 0.14)',
  panelStrong: 'rgba(5, 17, 26, 0.92)'
};

const rtlText = {
  direction: 'rtl',
  textAlign: 'right',
  fontFamily: 'Dubai, Tahoma, "Segoe UI", Arial, sans-serif',
  letterSpacing: 0
};

const ltrText = {
  direction: 'ltr',
  textAlign: 'left',
  fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif',
  letterSpacing: 0
};

const mapPoints = [
  {x: 0.42, y: 0.2, label: 'Hamra', offset: 0},
  {x: 0.58, y: 0.18, label: 'Gemmayzeh', offset: 8},
  {x: 0.65, y: 0.35, label: 'Achrafieh', offset: 18},
  {x: 0.38, y: 0.38, label: 'Verdun', offset: 26},
  {x: 0.28, y: 0.26, label: 'Mreisseh', offset: 34},
  {x: 0.52, y: 0.55, label: 'Badaro', offset: 44},
  {x: 0.7, y: 0.25, label: 'Mar Mikhael', offset: 52}
];

const getMediaForScene = (scene, assets) => {
  const explicit = assets?.mediaBySceneId?.[scene.id];
  if (explicit?.items?.length) return explicit;

  const byOutlet = assets?.mediaByOutletKey?.[scene.outlet?.key];
  if (byOutlet?.items?.length) return byOutlet;

  return null;
};

const fitModeToObjectFit = (fitMode) => fitMode === 'contain' ? 'contain' : 'cover';

const assetSrc = (src) => {
  if (!src) return null;
  return /^(https?|file):/i.test(src) ? src : staticFile(src);
};

const getSceneExcerpt = (scene) => {
  const source = scene.body || scene.visual?.summary || scene.title || '';
  const normalized = source.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'يبقى هذا المشهد نصيا بانتظار مادة بصرية موازية.';

  const sentences = normalized.split(/(?<=[.؟!]|[.!?])\s+/).filter(Boolean);
  const excerpt = sentences.slice(0, 2).join(' ').trim();
  return excerpt.length <= 260 ? excerpt : `${excerpt.slice(0, 257).trim()}...`;
};

// ── Hook variants ──────────────────────────────────────────────────────────
// Mirrors the HOOKS logic in templates/radar-beirut-briefing-template.html:
// timings, thresholds and styles below must stay in lockstep with the HTML
// captions/stamps implementations so the MP4 matches the HTML variant.

const buildCaptionPhrases = (text) => {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.split(/(?<=[.؟!?])\s+/).filter(Boolean);
  const phrases = [];
  for (const sentence of sentences) {
    const segments = sentence.split(/(?<=[،;:])\s+/).filter(Boolean);
    for (const segment of segments) {
      const words = segment.split(' ').filter(Boolean);
      for (let i = 0; i < words.length; i += 6) {
        phrases.push(words.slice(i, i + 6));
      }
    }
  }
  return phrases;
};

const buildCaptionSchedule = (scene, sceneDurationMs) => {
  const text = scene.audioText || scene.body || scene.visual?.summary || '';
  const phrases = buildCaptionPhrases(text);
  if (!phrases.length) return null;

  const narrationMs = scene.audio?.durationSeconds
    ? scene.audio.durationSeconds * 1000
    : Math.max(2000, sceneDurationMs - 500);
  const totalChars = phrases.reduce((sum, words) => sum + words.join(' ').length + 1, 0);

  let cursorMs = 180;
  const schedule = phrases.map((words) => {
    const phraseChars = words.join(' ').length + 1;
    const phraseMs = (phraseChars / totalChars) * narrationMs;
    const entry = {words, startMs: cursorMs, durationMs: phraseMs};
    cursorMs += phraseMs;
    return entry;
  });

  return {schedule, hideMs: Math.min(cursorMs + 600, sceneDurationMs - 200)};
};

const HookCaptions = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sceneDurationMs = (durationInFrames / fps) * 1000;
  const elapsedMs = (frame / fps) * 1000;
  const plan = useMemo(() => buildCaptionSchedule(scene, sceneDurationMs), [scene, sceneDurationMs]);
  if (!plan || elapsedMs >= plan.hideMs) return null;

  let current = null;
  for (const entry of plan.schedule) {
    if (elapsedMs >= entry.startMs) current = entry;
    else break;
  }
  const perWordMs = current ? current.durationMs / current.words.length : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5,
        padding: '30px 14px 12px',
        background: 'linear-gradient(0deg, rgba(2,8,13,0.94) 0%, rgba(2,8,13,0.8) 58%, transparent 100%)',
        textAlign: 'center',
        fontSize: 16,
        lineHeight: 1.85,
        fontWeight: 500,
        minHeight: 66,
        direction: 'rtl'
      }}
    >
      {current
        ? current.words.map((word, wordIndex) => {
          const onMs = current.startMs + wordIndex * perWordMs * 0.86;
          const on = clamp01((elapsedMs - onMs) / 180);
          return (
            <React.Fragment key={`${current.startMs}-${wordIndex}`}>
              <span
                style={{
                  color: `rgba(244,239,229,${0.34 + 0.66 * on})`,
                  textShadow: on > 0 ? `0 0 14px rgba(205,127,50,${0.45 * on})` : 'none'
                }}
              >
                {word}
              </span>
              {wordIndex < current.words.length - 1 ? ' ' : null}
            </React.Fragment>
          );
        })
        : null}
    </div>
  );
};

const stampTimingFor = (sceneDurationMs) => ({
  inMs: Math.max(4200, Math.round(sceneDurationMs * 0.46)),
  holdMs: Math.max(3600, Math.min(6500, Math.round(sceneDurationMs * 0.2)))
});

const HookStamp = ({quote, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sceneDurationMs = (durationInFrames / fps) * 1000;
  const elapsedMs = (frame / fps) * 1000;
  if (!quote || sceneDurationMs <= 12000) return null;

  const {inMs, holdMs} = stampTimingFor(sceneDurationMs);
  const outStartMs = inMs + holdMs;
  if (elapsedMs < inMs || elapsedMs >= outStartMs + 460) return null;

  const enterMs = elapsedMs - inMs;
  const scale = interpolate(enterMs, [0, 276, 460], [1.45, 0.97, 1], {extrapolateRight: 'clamp'});
  const rotate = interpolate(enterMs, [0, 276, 460], [1.5, -0.6, 0], {extrapolateRight: 'clamp'});
  const enterOpacity = interpolate(enterMs, [0, 276], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const exitOpacity = elapsedMs > outStartMs ? Math.max(0, 1 - (elapsedMs - outStartMs) / 420) : 1;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        display: 'grid',
        placeItems: 'center',
        padding: 18,
        direction: 'rtl'
      }}
    >
      <div
        style={{
          border: '2px solid rgba(205,127,50,0.92)',
          borderRadius: 10,
          background: 'rgba(3,9,14,0.86)',
          boxShadow: '0 18px 44px rgba(0,0,0,0.5), inset 0 0 22px rgba(205,127,50,0.14)',
          padding: '14px 18px',
          textAlign: 'center',
          fontSize: 18,
          lineHeight: 1.65,
          fontWeight: 700,
          color: '#f4efe5',
          maxWidth: '100%',
          opacity: enterOpacity * exitOpacity,
          transform: `scale(${scale}) rotate(${rotate}deg)`
        }}
      >
        {`«${quote}»`}
      </div>
    </div>
  );
};

// Approximates the HTML chip pop-in bezier(.2,.9,.25,1.2) — eases out with a
// slight overshoot past the resting position.
const chipEase = (t) => {
  const x = clamp01(t) - 1;
  return 1 + 1.8 * x * x * x + 0.8 * x * x;
};

const HookChips = ({terms, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sceneDurationMs = (durationInFrames / fps) * 1000;
  const elapsedMs = (frame / fps) * 1000;
  const shownTerms = (terms || []).slice(0, 4);
  if (!shownTerms.length || elapsedMs >= sceneDurationMs * 0.94) return null;

  const windowStartMs = Math.round(sceneDurationMs * 0.16);
  const windowEndMs = Math.round(sceneDurationMs * 0.82);
  const stepMs = shownTerms.length > 1 ? (windowEndMs - windowStartMs) / (shownTerms.length - 1) : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 10,
        zIndex: 6,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        justifyContent: 'center',
        direction: 'rtl'
      }}
    >
      {shownTerms.map((term, termIndex) => {
        const startMs = windowStartMs + termIndex * stepMs;
        if (elapsedMs < startMs) return null;
        const progress = clamp01((elapsedMs - startMs) / 420);
        const eased = chipEase(progress);
        const text = typeof term === 'string' ? term : term.text;
        return (
          <span
            key={`${text}-${termIndex}`}
            style={{
              border: '1px solid rgba(103,191,216,0.6)',
              background: 'rgba(4,13,21,0.88)',
              color: '#67bfd8',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 500,
              opacity: progress,
              transform: `translateY(${10 * (1 - eased)}px) scale(${0.92 + 0.08 * eased})`
            }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
};

const SceneHookOverlays = ({hooks, scene, durationInFrames}) => {
  const variant = hooks?.variant;
  if (!variant || variant === 'default') return null;

  return (
    <>
      {variant === 'captions' ? <HookCaptions scene={scene} durationInFrames={durationInFrames} /> : null}
      {variant === 'stamps' ? (
        <>
          <HookStamp quote={(scene.visual?.quote || '').trim()} durationInFrames={durationInFrames} />
          <HookChips terms={hooks?.keywordsBySceneId?.[scene.id]} durationInFrames={durationInFrames} />
        </>
      ) : null}
    </>
  );
};

const FontFaces = () => (
  <style>
    {`
      @font-face {
        font-family: "Dubai";
        src: url("${staticFile('fonts/Dubai-Regular.ttf')}") format("truetype");
        font-weight: 400;
      }
      @font-face {
        font-family: "Dubai";
        src: url("${staticFile('fonts/Dubai-Medium.ttf')}") format("truetype");
        font-weight: 500;
      }
      @font-face {
        font-family: "Dubai";
        src: url("${staticFile('fonts/Dubai-Bold.ttf')}") format("truetype");
        font-weight: 700;
      }
    `}
  </style>
);

const Background = ({frontPageSrc}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const drift = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 90], {
    extrapolateRight: 'clamp'
  });
  const sweepX = ((frame * 18) % 1900) - 500;
  const radarRotation = (frame * 3.2) % 360;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${palette.bgDeep} 0%, ${palette.bg} 48%, #08131b 100%)`,
        overflow: 'hidden'
      }}
    >
      {frontPageSrc ? (
        <Img
          src={assetSrc(frontPageSrc)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.08,
            filter: 'saturate(0.7) contrast(1.1)'
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: -120,
          backgroundImage:
            `linear-gradient(${palette.line} 1px, transparent 1px), linear-gradient(90deg, ${palette.line} 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
          transform: `translateY(${drift}px) rotate(-8deg) scale(1.1)`
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: '56%',
          background:
            'linear-gradient(90deg, transparent 0%, rgba(205,127,50,0.08) 40%, rgba(205,127,50,0.22) 50%, rgba(205,127,50,0.08) 60%, transparent 100%)',
          transform: `translateX(${sweepX}px) skewX(-16deg)`,
          opacity: 0.5,
          mixBlendMode: 'screen'
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 42,
          bottom: 130,
          width: 260,
          height: 260,
          borderRadius: '50%',
          opacity: 0.24,
          background:
            'radial-gradient(circle, rgba(205,127,50,0.08) 0%, rgba(205,127,50,0.04) 44%, transparent 45%), repeating-radial-gradient(circle, transparent 0 42px, rgba(205,127,50,0.18) 43px 45px)',
          border: '1px solid rgba(205,127,50,0.45)'
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `conic-gradient(from ${radarRotation}deg, rgba(205,127,50,0.78) 0deg, rgba(205,127,50,0.18) 34deg, transparent 96deg, transparent 360deg)`,
            maskImage: 'radial-gradient(circle, transparent 0 8%, black 9%)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 0 8%, black 9%)'
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at center, transparent 24%, rgba(0,0,0,0.62) 100%)'
        }}
      />
    </AbsoluteFill>
  );
};

const IntroRadarOpening = ({intro, dateLabel, assets}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const durationInFrames = fpsFromSeconds(intro?.durationSeconds || 8, fps);
  const revealFrame = fpsFromSeconds(intro?.textRevealSeconds ?? Math.max(0, (intro?.durationSeconds || 8) - 3), fps);
  const scale = Math.min(width / INTRO_STAGE_WIDTH, height / INTRO_STAGE_HEIGHT);
  const stageLeft = (width - INTRO_STAGE_WIDTH * scale) / 2;
  const stageTop = (height - INTRO_STAGE_HEIGHT * scale) / 2;
  const elapsedMs = (frame / fps) * 1000;
  const bgOpacity = cssEase(elapsedMs / 1200);
  const bgScale = 1.08 - 0.08 * cssEase(elapsedMs / 6000);
  const flashOpacity = frame <= framesFromMs(500, fps) ? 0.42 * (1 - frame / framesFromMs(500, fps)) : 0;
  const scanCycle = ((elapsedMs % 3200) / 3200) * 100;
  const scanProgress = scanCycle <= 8
    ? interpolate(scanCycle, [0, 8], [-140, -60])
    : scanCycle <= 45
      ? interpolate(scanCycle, [8, 45], [-60, 90])
      : scanCycle <= 68
        ? interpolate(scanCycle, [45, 68], [90, 155])
        : 155;
  const scanOpacity = scanCycle <= 8
    ? interpolate(scanCycle, [0, 8], [0, 0.9])
    : scanCycle <= 45
      ? interpolate(scanCycle, [8, 45], [0.9, 1])
      : scanCycle <= 68
        ? interpolate(scanCycle, [45, 68], [1, 0.18])
        : interpolate(scanCycle, [68, 100], [0.18, 0]);
  const gridY = ((elapsedMs % 22000) / 22000) * 52;
  const radarVisible = cssEase((elapsedMs - 900) / 600);
  const ringVisible = clamp01((elapsedMs - 1200) / 1);
  const bracketVisible = (index) => cssEase((elapsedMs - 1300 - index * 90) / 400);
  const mapVisible = cssEase((elapsedMs - 1900) / 600);
  const copyProgress = cssEase((frame - revealFrame) / framesFromMs(800, fps));
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const radarSweep = ((elapsedMs / 18) % 360) * Math.PI / 180;
  const radarStartX = 125 + Math.cos(radarSweep - 0.34) * 108;
  const radarStartY = 125 + Math.sin(radarSweep - 0.34) * 108;
  const radarEndX = 125 + Math.cos(radarSweep + 0.06) * 108;
  const radarEndY = 125 + Math.sin(radarSweep + 0.06) * 108;
  const radarLargeArc = 0;
  const radarPath = `M 125 125 L ${radarStartX} ${radarStartY} A 108 108 0 ${radarLargeArc} 1 ${radarEndX} ${radarEndY} Z`;
  const stageFont = '"Dubai", "Noto Naskh Arabic", Tahoma, "Segoe UI", Arial, sans-serif';
  const cornerStyle = (opacity) => ({
    position: 'absolute',
    width: 40,
    height: 40,
    opacity
  });
  const cornerBars = (flipX = false, flipY = false, opacity = 1) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
        transformOrigin: 'center',
        opacity
      }}
    >
      <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: 'rgba(205,127,50,0.9)', boxShadow: '0 0 8px rgba(205,127,50,0.82)'}} />
      <div style={{position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: 'rgba(205,127,50,0.9)', boxShadow: '0 0 8px rgba(205,127,50,0.82)'}} />
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 20% 18%, rgba(205,127,50,0.16), transparent 20%), radial-gradient(circle at 78% 12%, rgba(60,152,196,0.18), transparent 25%), linear-gradient(180deg, #06131d, #03080d 72%)',
        color: '#f4efe5',
        overflow: 'hidden',
        opacity: fadeOut
      }}
    >
      <FontFaces />
      <div
        style={{
          position: 'absolute',
          left: stageLeft,
          top: stageTop,
          width: INTRO_STAGE_WIDTH,
          height: INTRO_STAGE_HEIGHT,
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background:
            'radial-gradient(circle at 22% 18%, rgba(205,127,50,0.12), transparent 18%), radial-gradient(circle at 78% 20%, rgba(86,170,212,0.12), transparent 24%), linear-gradient(180deg, #02080d, #050d14)',
          border: '1px solid rgba(205,127,50,0.18)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          fontFamily: stageFont
        }}
      >
        {assets?.frontPageSrc ? (
          <Img
            src={assetSrc(assets.frontPageSrc)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              opacity: bgOpacity,
              transform: `scale(${bgScale})`
            }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: '-18%',
            backgroundImage:
              'linear-gradient(rgba(120,172,205,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(120,172,205,0.14) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            transform: `translateY(${gridY}px) rotate(-8deg) scale(1.08)`,
            opacity: 0.7
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.28)), radial-gradient(circle at 50% 120%, rgba(205,127,50,0.15), transparent 30%)'
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 -70%',
            width: '64%',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(205,127,50,0.06) 36%, rgba(205,127,50,0.26) 50%, rgba(205,127,50,0.06) 64%, transparent 100%)',
            transform: `translateX(${scanProgress}%) skewX(-15deg)`,
            opacity: scanOpacity,
            mixBlendMode: 'screen'
          }}
        />
        <div style={{position: 'absolute', inset: 0, background: '#fff', opacity: flashOpacity}} />
        <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 28%, rgba(0,0,0,0.6) 100%)'}} />

        {[0, 1, 2].map((index) => {
          const cycleMs = ((elapsedMs - 1200 - index * 700) % 2400 + 2400) % 2400;
          const progress = cycleMs / 2400;
          const ringScale = 0.86 + progress * (1.52 - 0.86);
          const opacity = Math.max(0, 0.72 - progress * 0.72) * ringVisible;
          return (
            <div
              key={`intro-ring-${index}`}
              style={{
                position: 'absolute',
                top: 70,
                left: '50%',
                width: 250,
                height: 250,
                marginLeft: -125,
                borderRadius: '50%',
                border: '2px solid rgba(205,127,50,0.55)',
                transform: `scale(${ringScale})`,
                opacity
              }}
            />
          );
        })}

        <svg
          width="250"
          height="250"
          viewBox="0 0 250 250"
          style={{position: 'absolute', top: 70, left: '50%', marginLeft: -125, opacity: radarVisible, zIndex: 3}}
        >
          {[1, 2, 3, 4].map((index) => (
            <circle key={index} cx="125" cy="125" r={(108 / 4) * index} fill="none" stroke="rgba(103,191,216,0.22)" strokeWidth="1" />
          ))}
          <path d="M 17 125 L 233 125 M 125 17 L 125 233" stroke="rgba(103,191,216,0.22)" strokeWidth="1" fill="none" />
          <defs>
            <radialGradient id="intro-radar-wedge" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(205,127,50,0.22)" />
              <stop offset="100%" stopColor="rgba(205,127,50,0)" />
            </radialGradient>
          </defs>
          <path d={radarPath} fill="url(#intro-radar-wedge)" />
        </svg>

        <svg
          width="175"
          height="120"
          viewBox="0 0 175 120"
          style={{position: 'absolute', top: 398, left: 'calc(50% + 62px)', marginLeft: -87.5, opacity: mapVisible}}
        >
          {mapPoints.map((point) => {
            const cycle = ((elapsedMs / 28) + point.offset) % 90;
            const progress = cycle / 90;
            const rippleScale = 0.4 + progress * 1.6;
            const rippleOpacity = Math.max(0, 0.7 - progress * 0.7);
            const labelOpacity = Math.max(0, 1 - progress * 1.4);
            const x = point.x * 175;
            const y = point.y * 120;
            return (
              <g key={point.label}>
                <circle cx={x} cy={y} r="2.5" fill="rgba(205,127,50,0.95)" filter="url(#intro-map-glow)" />
                <circle cx={x} cy={y} r={4 + rippleScale * 9} fill="none" stroke={`rgba(205,127,50,${rippleOpacity})`} strokeWidth="1.2" />
                <text x={x + 5} y={y - 4} fill={`rgba(180,220,255,${labelOpacity})`} fontFamily='"Segoe UI", Tahoma, Arial, sans-serif' fontSize="8">
                  {point.label}
                </text>
              </g>
            );
          })}
          <defs>
            <filter id="intro-map-glow" x="-300%" y="-300%" width="700%" height="700%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgba(255,180,60,0.88)" />
            </filter>
          </defs>
        </svg>

        <div style={{...cornerStyle(bracketVisible(0)), top: 10, left: 10}}>{cornerBars(false, false)}</div>
        <div style={{...cornerStyle(bracketVisible(1)), top: 10, right: 10}}>{cornerBars(true, false)}</div>
        <div style={{...cornerStyle(bracketVisible(2)), bottom: 10, left: 10}}>{cornerBars(false, true)}</div>
        <div style={{...cornerStyle(bracketVisible(3)), bottom: 10, right: 10}}>{cornerBars(true, true)}</div>

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '20px 22px 30px',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, transparent 100%)',
            textAlign: 'center',
            opacity: copyProgress,
            transform: `translateY(${20 * (1 - copyProgress)}px)`,
            zIndex: 6,
            direction: 'rtl'
          }}
        >
          <div style={{color: 'rgba(205,127,50,0.92)', fontSize: 17, fontWeight: 500, marginBottom: 0}} />
          <div style={{fontSize: 46, lineHeight: 1.18, fontWeight: 700, marginBottom: 12, color: '#f4efe5'}}>
            {intro?.title || 'الصحافة اليوم'}
          </div>
          <div style={{color: 'rgba(205,127,50,0.84)', fontFamily: stageFont, fontSize: 11, letterSpacing: '0.16em', fontWeight: 500, direction: 'ltr'}}>
            {dateLabel}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Natural image size, resolved before the frame is captured (delayRender).
const useImageNaturalSize = (src) => {
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!src) {
      return undefined;
    }
    const handle = delayRender(`measure image ${src}`);
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    const probe = new window.Image();
    probe.onload = () => {
      setSize({width: probe.naturalWidth, height: probe.naturalHeight});
      finish();
    };
    probe.onerror = finish;
    probe.src = src;
    return finish;
  }, [src]);
  return size;
};

const SceneMediaDetail = ({media, scene, durationInFrames, stageFont, hooks}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const items = media?.items || [];
  const switchEveryFrames = items.length > 1
    ? Math.max(framesFromMs(2800), Math.floor((durationInFrames - framesFromMs(400)) / items.length))
    : Math.max(1, durationInFrames);
  const itemIndex = items.length
    ? Math.min(items.length - 1, Math.floor(frame / switchEveryFrames) % items.length)
    : 0;
  const isCover = media?.fitMode !== 'contain';
  const coverSrc = items.length && isCover ? assetSrc(items[itemIndex]) : null;
  const naturalSize = useImageNaturalSize(coverSrc);
  const boxRef = useRef(null);
  const [boxSize, setBoxSize] = useState(null);
  const [boxHandle] = useState(() => delayRender('measure media box'));
  useEffect(() => {
    if (boxRef.current) {
      setBoxSize({width: boxRef.current.offsetWidth, height: boxRef.current.offsetHeight});
    }
    continueRender(boxHandle);
  }, [boxHandle]);
  const detailStyle = {
    position: 'relative',
    minHeight: 0,
    marginTop: 2,
    borderRadius: 22,
    border: '1px solid rgba(205,127,50,0.14)',
    display: 'block',
    background:
      'linear-gradient(180deg, rgba(8,17,27,0.84), rgba(6,12,20,0.92)), radial-gradient(circle at top, rgba(205,127,50,0.08), transparent 52%)',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
    overflow: 'hidden'
  };

  const hookOverlays = <SceneHookOverlays hooks={hooks} scene={scene} durationInFrames={durationInFrames} />;

  if (!items.length) {
    return (
      <div style={detailStyle}>
        {/* The captions variant hides the text fallback — the karaoke strip carries the words. */}
        {hooks?.variant === 'captions' ? null : (
          <div
            style={{
              height: '100%',
              display: 'grid',
              alignContent: 'center',
              gap: 12,
              padding: '18px 18px 20px',
              color: 'rgba(235,239,244,0.94)',
              fontSize: 14,
              lineHeight: 1.95,
              fontFamily: stageFont,
              direction: 'rtl',
              textAlign: 'right'
            }}
          >
            <div>{getSceneExcerpt(scene)}</div>
          </div>
        )}
        {hookOverlays}
      </div>
    );
  }

  const localFrame = frame % switchEveryFrames;
  const fadeOpacity = items.length > 1
    ? interpolate(localFrame, [0, 13, Math.max(14, switchEveryFrames - 8), switchEveryFrames], [0.18, 1, 1, 0.18], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    })
    : 1;
  // Mirror the HTML pan: one-way duration clamped to 3.5–7s regardless of
  // scene length, so audio-shortened scenes don't speed up the pan.
  const panOneWaySeconds = Math.max(3.5, Math.min(7, (durationInFrames / fps) / 2.4));
  const panCycleFrames = Math.max(1, Math.round(panOneWaySeconds * 2 * fps));
  const panProgress = (frame % panCycleFrames) / panCycleFrames;
  const panEase = 0.5 - Math.cos(panProgress * Math.PI * 2) / 2;
  const objectFit = fitModeToObjectFit(media.fitMode);

  if (media.fitMode === 'contain') {
    return (
      <div style={detailStyle}>
        <div
          style={{
            position: 'absolute',
            inset: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Img
            src={assetSrc(items[itemIndex])}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              borderRadius: 16,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
              opacity: fadeOpacity,
              filter: fadeOpacity < 0.4 ? 'blur(8px)' : 'none'
            }}
          />
        </div>
        {hookOverlays}
      </div>
    );
  }

  // Pan with a subpixel transform like the HTML's fitFrontPageImage —
  // object-position is pixel-snapped by Chromium, which turns slow pans
  // into a visible 1px staircase in rendered video.
  let coverStyle = null;
  if (naturalSize && boxSize && boxSize.width > 0 && boxSize.height > 0) {
    const coverScale = Math.max(boxSize.width / naturalSize.width, boxSize.height / naturalSize.height);
    const imgHeight = naturalSize.height * coverScale;
    const overflow = Math.max(0, imgHeight - boxSize.height);
    const translateY = overflow > 8 ? -overflow * panEase : 0;
    coverStyle = {
      position: 'absolute',
      top: 0,
      left: '50%',
      width: naturalSize.width * coverScale,
      height: imgHeight,
      transform: `translate(-50%, ${translateY}px)`,
      opacity: fadeOpacity,
      filter: fadeOpacity < 0.4 ? 'blur(8px)' : 'none'
    };
  }

  return (
    <div ref={boxRef} style={detailStyle}>
      <Img
        src={assetSrc(items[itemIndex])}
        style={coverStyle ?? {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit,
          objectPosition: 'center top',
          borderRadius: 22,
          opacity: fadeOpacity,
          filter: fadeOpacity < 0.4 ? 'blur(8px)' : 'none'
        }}
      />
      {hookOverlays}
    </div>
  );
};

const SceneCard = ({scene, dateLabel, assets, hooks}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const media = getMediaForScene(scene, assets);
  const scale = Math.min(width / INTRO_STAGE_WIDTH, height / INTRO_STAGE_HEIGHT);
  const stageLeft = (width - INTRO_STAGE_WIDTH * scale) / 2;
  const stageTop = (height - INTRO_STAGE_HEIGHT * scale) / 2;
  const elapsedMs = (frame / fps) * 1000;
  const stageFont = '"Dubai", "Noto Naskh Arabic", Tahoma, "Segoe UI", Arial, sans-serif';
  const cardReveal = cssEase(elapsedMs / 650);
  const gridY = ((elapsedMs % 22000) / 22000) * 52;
  const scanCycle = ((elapsedMs % 3200) / 3200) * 100;
  const scanProgress = scanCycle <= 8
    ? interpolate(scanCycle, [0, 8], [-140, -60])
    : scanCycle <= 45
      ? interpolate(scanCycle, [8, 45], [-60, 90])
      : scanCycle <= 68
        ? interpolate(scanCycle, [45, 68], [90, 155])
        : 155;
  const scanOpacity = scanCycle <= 8
    ? interpolate(scanCycle, [0, 8], [0, 0.9])
    : scanCycle <= 45
      ? interpolate(scanCycle, [8, 45], [0.9, 1])
      : scanCycle <= 68
        ? interpolate(scanCycle, [45, 68], [1, 0.18])
        : interpolate(scanCycle, [68, 100], [0.18, 0]);
  const radarSweep = ((elapsedMs / 18) % 360) * Math.PI / 180;
  const radarStartX = 125 + Math.cos(radarSweep - 0.34) * 108;
  const radarStartY = 125 + Math.sin(radarSweep - 0.34) * 108;
  const radarEndX = 125 + Math.cos(radarSweep + 0.06) * 108;
  const radarEndY = 125 + Math.sin(radarSweep + 0.06) * 108;
  const radarPath = `M 125 125 L ${radarStartX} ${radarStartY} A 108 108 0 0 1 ${radarEndX} ${radarEndY} Z`;
  const displayHeadline = scene.outlet ? (scene.visual?.headline || scene.title) : (scene.title || scene.shortLabel || 'المشهد الجامع');
  const summary = scene.visual?.summary || scene.body;
  const cornerStyle = {
    position: 'absolute',
    width: 40,
    height: 40,
    opacity: 0.32
  };
  const cornerBars = (flipX = false, flipY = false) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
        transformOrigin: 'center'
      }}
    >
      <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: 'rgba(205,127,50,0.9)', boxShadow: '0 0 8px rgba(205,127,50,0.82)'}} />
      <div style={{position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: 'rgba(205,127,50,0.9)', boxShadow: '0 0 8px rgba(205,127,50,0.82)'}} />
    </div>
  );

  // Stamps variant: the HTML fires a 0.22-opacity white flash when the quote
  // stamp slams in. The stamp itself only shows when the scene has a quote
  // and runs longer than 12s, so the flash is gated the same way.
  let stampFlashOpacity = 0;
  if (hooks?.variant === 'stamps' && (scene.visual?.quote || '').trim() && (durationInFrames / fps) * 1000 > 12000) {
    const stampInMs = stampTimingFor((durationInFrames / fps) * 1000).inMs;
    if (elapsedMs >= stampInMs) {
      stampFlashOpacity = interpolate(elapsedMs, [stampInMs, stampInMs + 320], [0.22, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp'
      });
    }
  }

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 20% 18%, rgba(205,127,50,0.16), transparent 20%), radial-gradient(circle at 78% 12%, rgba(60,152,196,0.18), transparent 25%), linear-gradient(180deg, #06131d, #03080d 72%)',
        overflow: 'hidden'
      }}
    >
      <FontFaces />
      <div
        style={{
          position: 'absolute',
          left: stageLeft,
          top: stageTop,
          width: INTRO_STAGE_WIDTH,
          height: INTRO_STAGE_HEIGHT,
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background:
            'radial-gradient(circle at 22% 18%, rgba(205,127,50,0.12), transparent 18%), radial-gradient(circle at 78% 20%, rgba(86,170,212,0.12), transparent 24%), linear-gradient(180deg, #02080d, #050d14)',
          border: '1px solid rgba(205,127,50,0.18)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          fontFamily: stageFont,
          opacity: fadeOut
        }}
      >
        {assets?.frontPageSrc ? (
          <Img
            src={assetSrc(assets.frontPageSrc)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              opacity: 1
            }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: '-18%',
            backgroundImage:
              'linear-gradient(rgba(120,172,205,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(120,172,205,0.14) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            transform: `translateY(${gridY}px) rotate(-8deg) scale(1.08)`,
            opacity: 0.7
          }}
        />
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.28)), radial-gradient(circle at 50% 120%, rgba(205,127,50,0.15), transparent 30%)'}} />
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 -70%',
            width: '64%',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(205,127,50,0.06) 36%, rgba(205,127,50,0.26) 50%, rgba(205,127,50,0.06) 64%, transparent 100%)',
            transform: `translateX(${scanProgress}%) skewX(-15deg)`,
            opacity: scanOpacity,
            mixBlendMode: 'screen'
          }}
        />
        <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 28%, rgba(0,0,0,0.6) 100%)'}} />
        {stampFlashOpacity > 0 ? (
          <div style={{position: 'absolute', inset: 0, background: '#fff', opacity: stampFlashOpacity, zIndex: 6}} />
        ) : null}
        {[0, 1, 2].map((index) => {
          const cycleMs = ((elapsedMs - index * 700) % 2400 + 2400) % 2400;
          const progress = cycleMs / 2400;
          return (
            <div
              key={`scene-ring-${index}`}
              style={{
                position: 'absolute',
                top: 70,
                left: '50%',
                width: 250,
                height: 250,
                marginLeft: -125,
                borderRadius: '50%',
                border: '2px solid rgba(205,127,50,0.55)',
                transform: `scale(${0.86 + progress * (1.52 - 0.86)})`,
                opacity: Math.max(0, 0.72 - progress * 0.72) * 0.22
              }}
            />
          );
        })}
        <svg width="250" height="250" viewBox="0 0 250 250" style={{position: 'absolute', top: 70, left: '50%', marginLeft: -125, opacity: 0.28, zIndex: 3}}>
          {[1, 2, 3, 4].map((index) => (
            <circle key={index} cx="125" cy="125" r={(108 / 4) * index} fill="none" stroke="rgba(103,191,216,0.22)" strokeWidth="1" />
          ))}
          <path d="M 17 125 L 233 125 M 125 17 L 125 233" stroke="rgba(103,191,216,0.22)" strokeWidth="1" fill="none" />
          <defs>
            <radialGradient id={`scene-radar-wedge-${scene.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(205,127,50,0.22)" />
              <stop offset="100%" stopColor="rgba(205,127,50,0)" />
            </radialGradient>
          </defs>
          <path d={radarPath} fill={`url(#scene-radar-wedge-${scene.id})`} />
        </svg>
        <div style={{...cornerStyle, top: 10, left: 10}}>{cornerBars(false, false)}</div>
        <div style={{...cornerStyle, top: 10, right: 10}}>{cornerBars(true, false)}</div>
        <div style={{...cornerStyle, bottom: 10, left: 10}}>{cornerBars(false, true)}</div>
        <div style={{...cornerStyle, bottom: 10, right: 10}}>{cornerBars(true, true)}</div>

        <div
          style={{
            position: 'absolute',
            inset: '18px 18px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            zIndex: 7
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -6,
              left: '50%',
              transform: 'translateX(-50%)',
              border: '1px solid rgba(205,127,50,0.24)',
              background: 'rgba(0,0,0,0.42)',
              color: 'rgba(212,222,232,0.9)',
              padding: '6px 12px',
              borderRadius: 999,
              fontFamily: stageFont,
              fontSize: 12,
              letterSpacing: '0.14em',
              fontWeight: 500,
              direction: 'ltr',
              backdropFilter: 'blur(8px)',
              width: 260,
              textAlign: 'center',
              zIndex: 8
            }}
          >
            {dateLabel}
          </div>

          <section
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              display: 'grid',
              gridTemplateRows: 'auto auto minmax(0, 1fr)',
              gap: 6,
              padding: '12px 18px 16px',
              marginTop: 30,
              overflow: 'hidden',
              transform: `translateY(${18 * (1 - cardReveal)}px)`,
              opacity: cardReveal,
              background: `linear-gradient(180deg, rgba(10,28,42,0.9), ${palette.panelStrong})`,
              border: '1px solid rgba(107,162,197,0.16)',
              borderRadius: 26,
              boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
              backdropFilter: 'blur(10px)'
            }}
          >
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 0, direction: 'rtl'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, direction: 'rtl'}}>
                {scene.outlet?.logoSrc ? (
                  <div
                    style={{
                      width: 96,
                      height: 52,
                      borderRadius: 14,
                      background: 'rgba(244,247,250,0.97)',
                      border: '1px solid rgba(205,127,50,0.16)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 10px 26px rgba(0,0,0,0.2)',
                      flexShrink: 0
                    }}
                  >
                    <Img src={assetSrc(scene.outlet.logoSrc)} style={{maxWidth: 76, maxHeight: 34, objectFit: 'contain'}} />
                  </div>
                ) : null}
                <div style={{display: 'flex', alignItems: 'center', minHeight: 52, minWidth: 0}}>
                  <div
                    style={{
                      color: palette.accent,
                      fontSize: 17,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      lineHeight: 1.1,
                      minHeight: 52,
                      maxWidth: '100%',
                      direction: 'rtl',
                      textAlign: 'right'
                    }}
                  >
                    {displayHeadline}
                  </div>
                </div>
              </div>
              <div style={{display: 'flex', alignItems: 'center', flexShrink: 0, direction: 'ltr'}}>
                <div
                  style={{
                    width: 62,
                    height: 4,
                    borderRadius: 999,
                    background: 'linear-gradient(90deg, rgba(81,170,223,0.78), #cd7f32, #ff9f54)',
                    transform: `translateX(${Math.sin((elapsedMs / 3400) * Math.PI * 2) * 7 + 7}px)`,
                    flexShrink: 0
                  }}
                />
              </div>
            </div>
            <div
              style={{
                color: 'rgba(230,236,243,0.92)',
                fontSize: 13,
                lineHeight: 1.7,
                fontWeight: 400,
                marginTop: 4,
                direction: 'rtl',
                textAlign: 'right'
              }}
            >
              {summary}
            </div>
            <SceneMediaDetail media={media} scene={scene} durationInFrames={durationInFrames} stageFont={stageFont} hooks={hooks} />
          </section>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const OutroCard = ({outro, assets}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const scale = Math.min(width / INTRO_STAGE_WIDTH, height / INTRO_STAGE_HEIGHT);
  const stageLeft = (width - INTRO_STAGE_WIDTH * scale) / 2;
  const stageTop = (height - INTRO_STAGE_HEIGHT * scale) / 2;
  const elapsedMs = (frame / fps) * 1000;
  const stageFont = '"Dubai", "Noto Naskh Arabic", Tahoma, "Segoe UI", Arial, sans-serif';
  const cardReveal = cssEase(elapsedMs / 650);
  const gridY = ((elapsedMs % 22000) / 22000) * 52;
  const scanCycle = ((elapsedMs % 3200) / 3200) * 100;
  const scanProgress = scanCycle <= 8
    ? interpolate(scanCycle, [0, 8], [-140, -60])
    : scanCycle <= 45
      ? interpolate(scanCycle, [8, 45], [-60, 90])
      : scanCycle <= 68
        ? interpolate(scanCycle, [45, 68], [90, 155])
        : 155;
  const scanOpacity = scanCycle <= 8
    ? interpolate(scanCycle, [0, 8], [0, 0.9])
    : scanCycle <= 45
      ? interpolate(scanCycle, [8, 45], [0.9, 1])
      : scanCycle <= 68
        ? interpolate(scanCycle, [45, 68], [1, 0.18])
        : interpolate(scanCycle, [68, 100], [0.18, 0]);
  const radarSweep = ((elapsedMs / 18) % 360) * Math.PI / 180;
  const radarStartX = 125 + Math.cos(radarSweep - 0.34) * 108;
  const radarStartY = 125 + Math.sin(radarSweep - 0.34) * 108;
  const radarEndX = 125 + Math.cos(radarSweep + 0.06) * 108;
  const radarEndY = 125 + Math.sin(radarSweep + 0.06) * 108;
  const radarPath = `M 125 125 L ${radarStartX} ${radarStartY} A 108 108 0 0 1 ${radarEndX} ${radarEndY} Z`;
  const cornerStyle = {
    position: 'absolute',
    width: 40,
    height: 40,
    opacity: 0.32
  };
  const cornerBars = (flipX = false, flipY = false) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
        transformOrigin: 'center'
      }}
    >
      <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: 'rgba(205,127,50,0.9)', boxShadow: '0 0 8px rgba(205,127,50,0.82)'}} />
      <div style={{position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: 'rgba(205,127,50,0.9)', boxShadow: '0 0 8px rgba(205,127,50,0.82)'}} />
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 20% 18%, rgba(205,127,50,0.16), transparent 20%), radial-gradient(circle at 78% 12%, rgba(60,152,196,0.18), transparent 25%), linear-gradient(180deg, #06131d, #03080d 72%)',
        overflow: 'hidden'
      }}
    >
      <FontFaces />
      <div
        style={{
          position: 'absolute',
          left: stageLeft,
          top: stageTop,
          width: INTRO_STAGE_WIDTH,
          height: INTRO_STAGE_HEIGHT,
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background:
            'radial-gradient(circle at 22% 18%, rgba(205,127,50,0.12), transparent 18%), radial-gradient(circle at 78% 20%, rgba(86,170,212,0.12), transparent 24%), linear-gradient(180deg, #02080d, #050d14)',
          border: '1px solid rgba(205,127,50,0.18)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          fontFamily: stageFont,
          color: '#f4efe5',
          opacity: fadeOut
        }}
      >
        {assets?.frontPageSrc ? (
          <Img
            src={assetSrc(assets.frontPageSrc)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              opacity: 1
            }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: '-18%',
            backgroundImage:
              'linear-gradient(rgba(120,172,205,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(120,172,205,0.14) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            transform: `translateY(${gridY}px) rotate(-8deg) scale(1.08)`,
            opacity: 0.7
          }}
        />
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.28)), radial-gradient(circle at 50% 120%, rgba(205,127,50,0.15), transparent 30%)'}} />
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 -70%',
            width: '64%',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(205,127,50,0.06) 36%, rgba(205,127,50,0.26) 50%, rgba(205,127,50,0.06) 64%, transparent 100%)',
            transform: `translateX(${scanProgress}%) skewX(-15deg)`,
            opacity: scanOpacity,
            mixBlendMode: 'screen'
          }}
        />
        <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 28%, rgba(0,0,0,0.6) 100%)'}} />
        {[0, 1, 2].map((index) => {
          const cycleMs = ((elapsedMs - index * 700) % 2400 + 2400) % 2400;
          const progress = cycleMs / 2400;
          return (
            <div
              key={`outro-ring-${index}`}
              style={{
                position: 'absolute',
                top: 70,
                left: '50%',
                width: 250,
                height: 250,
                marginLeft: -125,
                borderRadius: '50%',
                border: '2px solid rgba(205,127,50,0.55)',
                transform: `scale(${0.86 + progress * (1.52 - 0.86)})`,
                opacity: Math.max(0, 0.72 - progress * 0.72) * 0.22
              }}
            />
          );
        })}
        <svg width="250" height="250" viewBox="0 0 250 250" style={{position: 'absolute', top: 70, left: '50%', marginLeft: -125, opacity: 0.28, zIndex: 3}}>
          {[1, 2, 3, 4].map((index) => (
            <circle key={index} cx="125" cy="125" r={(108 / 4) * index} fill="none" stroke="rgba(103,191,216,0.22)" strokeWidth="1" />
          ))}
          <path d="M 17 125 L 233 125 M 125 17 L 125 233" stroke="rgba(103,191,216,0.22)" strokeWidth="1" fill="none" />
          <defs>
            <radialGradient id="outro-radar-wedge" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(205,127,50,0.22)" />
              <stop offset="100%" stopColor="rgba(205,127,50,0)" />
            </radialGradient>
          </defs>
          <path d={radarPath} fill="url(#outro-radar-wedge)" />
        </svg>
        <div style={{...cornerStyle, top: 10, left: 10}}>{cornerBars(false, false)}</div>
        <div style={{...cornerStyle, top: 10, right: 10}}>{cornerBars(true, false)}</div>
        <div style={{...cornerStyle, bottom: 10, left: 10}}>{cornerBars(false, true)}</div>
        <div style={{...cornerStyle, bottom: 10, right: 10}}>{cornerBars(true, true)}</div>

        <section
          style={{
            position: 'absolute',
            top: 132,
            right: 22,
            bottom: 110,
            left: 22,
            display: 'grid',
            alignContent: 'center',
            gap: 18,
            padding: '28px 22px',
            textAlign: 'center',
            zIndex: 7,
            opacity: cardReveal,
            transform: `translateY(${18 * (1 - cardReveal)}px)`,
            background: `linear-gradient(180deg, rgba(10,28,42,0.9), ${palette.panelStrong})`,
            border: '1px solid rgba(107,162,197,0.16)',
            borderRadius: 26,
            boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
            backdropFilter: 'blur(10px)',
            direction: 'rtl'
          }}
        >
          <div style={{color: palette.accent, fontSize: 16, fontWeight: 500}}>
            {outro.title}
          </div>
          <div style={{fontSize: 34, lineHeight: 1.55, fontWeight: 700}}>
            {outro.body}
          </div>
        </section>
      </div>
    </AbsoluteFill>
  );
};

export const ProductionBriefingVideo = ({briefing, assets = {}, hooks = {}}) => {
  const {fps} = useVideoConfig();
  const introFrames = fpsFromSeconds(briefing.intro.durationSeconds, fps);
  const outroFrames = fpsFromSeconds(briefing.outro.durationSeconds, fps);
  let cursor = introFrames;

  const sceneSequences = briefing.scenes.map((scene, index) => {
    const durationInFrames = fpsFromSeconds(scene.durationSeconds, fps);
    const sequence = {scene, index, from: cursor, durationInFrames};
    cursor += durationInFrames;
    return sequence;
  });

  return (
    <AbsoluteFill style={{color: palette.ink}}>
      {assets.introAudioSrc ? <Audio src={assetSrc(assets.introAudioSrc)} /> : null}
      <Sequence from={0} durationInFrames={introFrames}>
        <IntroRadarOpening intro={briefing.intro} dateLabel={briefing.meta.dateLabel} assets={assets} />
      </Sequence>
      <Sequence from={introFrames} durationInFrames={cursor + outroFrames - introFrames}>
        <Background frontPageSrc={assets.frontPageSrc} />
      </Sequence>
      {sceneSequences.map(({scene, from, durationInFrames}) => (
        <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
          {scene.audio?.src ? <Audio src={assetSrc(scene.audio.src)} /> : null}
          <SceneCard scene={scene} dateLabel={briefing.meta.dateLabel} assets={assets} hooks={hooks} />
        </Sequence>
      ))}
      <Sequence from={cursor} durationInFrames={outroFrames}>
        {briefing.outro?.audio?.src ? <Audio src={assetSrc(briefing.outro.audio.src)} /> : null}
        <OutroCard outro={briefing.outro} assets={assets} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const ProductionIntroOnly = ({briefing, assets = {}}) => {
  const {fps} = useVideoConfig();
  const introFrames = calculateProductionIntroDurationInFrames(briefing, fps);

  return (
    <AbsoluteFill style={{color: palette.ink}}>
      {assets.introAudioSrc ? <Audio src={assetSrc(assets.introAudioSrc)} /> : null}
      <Sequence from={0} durationInFrames={introFrames}>
        <IntroRadarOpening intro={briefing.intro} dateLabel={briefing.meta.dateLabel} assets={assets} />
      </Sequence>
    </AbsoluteFill>
  );
};
