import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

import {
  computeDuelTimeline,
  calculateQuoteDuelDurationInFrames,
  DEFAULT_FPS
} from '../scripts/lib/duel-timeline.mjs';

// Quote Duel video composition. Faithful port of the duel layout from
// templates/radar-beirut-quote-duel-template.html (left amber card vs right cyan
// card, logo + stance + quote, event pill on top, contrast as the "vs" question,
// bottom summary, plus an ambient audio tail used by split clips.
//
// Stage coordinate system: 405x720 (matches ProductionBriefingVideo) scaled into
// the render resolution via useVideoConfig, so --resolution 1080x1920 stays crisp.
// Timeline math is delegated to lib/duel-timeline.mjs so the comp, the muxer, and
// the splitter agree to the exact frame.

const STAGE_W = 405;
const STAGE_H = 720;

export {calculateQuoteDuelDurationInFrames};

const palette = {
  bg: '#050d14',
  bgDeep: '#02080d',
  muted: '#9ab2c5',
  ink: '#eaf2f8',
  amber: '#cd7f32',
  cyan: '#67bfd8',
  event: '#ffdcb2'
};

const DEFAULT_LAYOUT = {
  quoteFontPx: 24,
  quoteMaxLines: 3,
  logoScale: 1.0
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const FontFaces = () => (
  <style>{`
    @font-face { font-family: "Dubai"; font-weight: 400;
      src: url("${staticFile('fonts/Dubai-Regular.ttf')}") format("truetype"); }
    @font-face { font-family: "Dubai"; font-weight: 500;
      src: url("${staticFile('fonts/Dubai-Medium.ttf')}") format("truetype"); }
    @font-face { font-family: "Dubai"; font-weight: 700;
      src: url("${staticFile('fonts/Dubai-Bold.ttf')}") format("truetype"); }
  `}</style>
);

const fontStack = '"Dubai", "Noto Naskh Arabic", Tahoma, "Segoe UI", Arial, sans-serif';

const resolveSrc = (src) => (src && /^(https?|file):/i.test(src) ? src : src ? staticFile(src) : null);

const ellipsize = (text, maxLines, fontPx) => {
  // Coarse line budget so the longest real quote doesn't overflow at small px.
  // ~18 chars/line at 25px on a 175px-wide card; scale inversely with fontPx.
  const charsPerLine = Math.max(8, Math.round((175 / fontPx) * 12));
  const budget = charsPerLine * maxLines;
  const t = String(text || '').trim();
  if (t.length <= budget) return t;
  return `${t.slice(0, Math.max(0, budget - 1)).trim()}…`;
};

const OutletHeader = ({outlet, side, logoScale}) => {
  const logoSrc = resolveSrc(outlet?.logoSrc);
  return (
    <div style={{direction: 'rtl', display: 'grid', placeItems: 'center'}}>
      <div
        style={{
          width: 86 * logoScale,
          height: 44 * logoScale,
          borderRadius: 10,
          background: 'rgba(244,247,250,0.96)',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          flex: '0 0 auto'
        }}
      >
        {logoSrc ? (
          <Img src={logoSrc} style={{maxWidth: 72 * logoScale, maxHeight: 30 * logoScale, objectFit: 'contain'}} />
        ) : (
          <span style={{color: '#0a1722', fontSize: 12, fontWeight: 700, padding: '0 6px', textAlign: 'center'}}>
            {outlet?.outlet}
          </span>
        )}
      </div>
    </div>
  );
};

const DuelPanel = ({data, side, reveal, layout}) => {
  const accent = side === 'left' ? palette.amber : palette.cyan;
  const quoteColor = side === 'left' ? '#ffd39f' : '#cfeef6';
  const rgba = side === 'left' ? '205, 127, 50' : '103, 191, 216';
  // Front-loaded reveal: panels slide in fast (clash legible within ~1.5s).
  const dx = (side === 'left' ? -1 : 1) * interpolate(reveal, [0, 1], [22, 0]);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: 12,
        padding: '14px 12px',
        minWidth: 0,
        minHeight: 0,
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(2,12,20,0.58)',
        opacity: reveal,
        transform: `translateX(${dx}px)`
      }}
    >
      <OutletHeader outlet={data} side={side} logoScale={layout.logoScale} />
      <div
        style={{
          direction: 'rtl',
          display: 'grid',
          alignContent: 'center',
          minHeight: 0,
          padding: '12px 10px',
          borderRadius: 16,
          fontSize: layout.quoteFontPx,
          lineHeight: 1.48,
          textAlign: 'center',
          color: quoteColor,
          background: `rgba(${rgba},0.12)`,
          border: `1px solid rgba(${rgba},0.18)`
        }}
      >
        {ellipsize(data?.quote, layout.quoteMaxLines, layout.quoteFontPx)}
      </div>
    </div>
  );
};

const scanTransformForMs = (elapsedMs) => {
  const cycle = ((elapsedMs % 3200) / 3200) * 100;
  const x = cycle <= 8
    ? interpolate(cycle, [0, 8], [-140, -60])
    : cycle <= 45
      ? interpolate(cycle, [8, 45], [-60, 90])
      : cycle <= 68
        ? interpolate(cycle, [45, 68], [90, 155])
        : 155;
  const opacity = cycle <= 8
    ? interpolate(cycle, [0, 8], [0, 0.9])
    : cycle <= 45
      ? interpolate(cycle, [8, 45], [0.9, 1])
      : cycle <= 68
        ? interpolate(cycle, [45, 68], [1, 0.18])
        : interpolate(cycle, [68, 100], [0.18, 0]);
  return {x, opacity};
};

const CornerBrackets = () => {
  const base = {position: 'absolute', width: 40, height: 40, opacity: 0.86};
  const bars = (flipX = false, flipY = false) => (
    <div style={{position: 'absolute', inset: 0, transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`}}>
      <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: 'rgba(205,127,50,0.9)', boxShadow: '0 0 8px rgba(205,127,50,0.82)'}} />
      <div style={{position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: 'rgba(205,127,50,0.9)', boxShadow: '0 0 8px rgba(205,127,50,0.82)'}} />
    </div>
  );
  return (
    <>
      <div style={{...base, top: 10, left: 10}}>{bars()}</div>
      <div style={{...base, top: 10, right: 10}}>{bars(true, false)}</div>
      <div style={{...base, bottom: 10, left: 10}}>{bars(false, true)}</div>
      <div style={{...base, bottom: 10, right: 10}}>{bars(true, true)}</div>
    </>
  );
};

const IntroLayers = ({opacity = 1, zoom = false, backgroundSrc}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const elapsedMs = (frame / fps) * 1000;
  const gridY = ((elapsedMs % 22000) / 22000) * 52;
  const scan = scanTransformForMs(elapsedMs);
  const bgScale = zoom ? 1.08 - 0.08 * clamp01(elapsedMs / 6000) : 1;

  return (
    <AbsoluteFill style={{opacity}}>
      {backgroundSrc ? (
        <Img
          src={resolveSrc(backgroundSrc)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            opacity: 1,
            transform: `scale(${bgScale})`
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: '-12%',
          backgroundImage:
            'linear-gradient(rgba(103,191,216,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(103,191,216,0.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          transform: `translateY(${gridY}px) rotate(-8deg) scale(1.08)`,
          opacity: 0.34
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at center, transparent 28%, rgba(0,0,0,0.62) 100%), linear-gradient(0deg, rgba(0,0,0,0.88) 0%, transparent 44%)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '0 auto 0 -70%',
          width: '64%',
          background:
            'linear-gradient(90deg, transparent 0%, rgba(205,127,50,0.06) 36%, rgba(205,127,50,0.26) 50%, rgba(205,127,50,0.06) 64%, transparent 100%)',
          transform: `translateX(${scan.x}%) skewX(-15deg)`,
          opacity: scan.opacity
        }}
      />
      {[0, 700, 1400].map((offset) => {
        const cycle = ((elapsedMs - offset) % 2400 + 2400) % 2400;
        const progress = cycle / 2400;
        return (
          <div
            key={offset}
            style={{
              position: 'absolute',
              top: 70,
              left: '50%',
              width: 250,
              height: 250,
              marginLeft: -125,
              borderRadius: '50%',
              border: '2px solid rgba(205,127,50,0.46)',
              transform: `scale(${0.86 + progress * (1.52 - 0.86)})`,
              opacity: Math.max(0, 0.72 - progress * 0.72)
            }}
          />
        );
      })}
      <CornerBrackets />
    </AbsoluteFill>
  );
};

const DuelScene = ({scene, durationInFrames, dateLabel, backgroundSrc}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const layout = {...DEFAULT_LAYOUT, ...(scene.layout || {})};

  // Reveal curve: 0→1 over the first ~10 frames (front-loaded), fade out tail.
  const reveal = clamp01(interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'}));
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill style={{opacity: fadeOut}}>
      <IntroLayers opacity={0.42} backgroundSrc={backgroundSrc} />
      <div
        style={{
          position: 'absolute',
          inset: '28px 18px 56px',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          gap: 10,
          direction: 'rtl',
          zIndex: 1
        }}
      >
        <div
          style={{
            justifySelf: 'center',
            minWidth: 230,
            padding: '7px 14px',
            borderRadius: 999,
            fontSize: 12,
            letterSpacing: '0.14em',
            color: '#d4dee8',
            background: 'rgba(0,0,0,0.36)',
            border: '1px solid rgba(205,127,50,0.24)',
            direction: 'ltr',
            textAlign: 'center'
          }}
        >
          {dateLabel}
        </div>
        <article
          style={{
            alignSelf: 'stretch',
            minHeight: 0,
            display: 'grid',
            gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
            gap: 12,
            padding: '18px 16px 16px',
            borderRadius: 24,
            border: '1px solid rgba(107,162,197,0.18)',
            background: 'rgba(9,28,42,0.9)',
            boxShadow: '0 22px 54px rgba(0,0,0,0.34)',
            opacity: reveal
          }}
        >
          <div style={{color: '#ffdcb2', fontSize: 24, lineHeight: 1.35, fontWeight: 700, textAlign: 'center'}}>
            {scene.eventLabel}
          </div>
          <div style={{color: palette.muted, fontSize: 13, lineHeight: 1.55, textAlign: 'center'}}>
            {scene.contrastLabel}
          </div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, direction: 'ltr', minHeight: 0}}>
            <DuelPanel data={scene.left} side="left" reveal={reveal} layout={layout} />
            <DuelPanel data={scene.right} side="right" reveal={reveal} layout={layout} />
          </div>
          <div
            style={{
              alignSelf: 'end',
              textAlign: 'center',
              color: '#f1e2ca',
              fontSize: 13,
              lineHeight: 1.62,
              padding: '11px 13px',
              borderTop: '1px solid rgba(205,127,50,0.14)',
              background: 'rgba(205,127,50,0.06)',
              borderRadius: 16,
              direction: 'rtl'
            }}
          >
            {scene.summary}
          </div>
        </article>
      </div>
    </AbsoluteFill>
  );
};

// Attention hook prepended to the master start. The audio still uses the
// selected hook WAV, while the visual matches the Quote Duel HTML intro.
const HookScene = ({hook, intro, durationInFrames, dateLabel, backgroundSrc}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fadeOut = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const revealFrame = Math.max(0, durationInFrames - Math.round(3 * fps));
  const copyProgress = clamp01(interpolate(frame, [revealFrame, revealFrame + Math.round(0.8 * fps)], [0, 1], {extrapolateRight: 'clamp'}));

  return (
    <AbsoluteFill style={{opacity: fadeOut}}>
      <IntroLayers opacity={1} zoom backgroundSrc={backgroundSrc} />
      <section
        style={{
          position: 'absolute',
          inset: '34px 20px',
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          gap: 16,
          zIndex: 1,
          direction: 'rtl'
        }}
      >
        <div />
        <div
          style={{
            alignSelf: 'end',
            marginBottom: 56,
            opacity: copyProgress,
            transform: `translateY(${20 * (1 - copyProgress)}px)`,
            textAlign: 'center'
          }}
        >
          <h1 style={{margin: 0, color: '#ffd39f', fontSize: 50, lineHeight: 1.24, fontWeight: 700, textShadow: '0 6px 22px rgba(0,0,0,0.88)'}}>
            {intro?.title || 'ثنائية الاقتباسات'}
          </h1>
          <div style={{color: 'rgba(205,127,50,0.84)', fontSize: 12, letterSpacing: '0.16em', fontWeight: 500, direction: 'ltr', textShadow: '0 5px 18px rgba(0,0,0,0.82)'}}>
            {dateLabel}
          </div>
        </div>
        <div />
      </section>
      {hook?.audioSrc ? <Audio src={resolveSrc(hook.audioSrc)} /> : null}
    </AbsoluteFill>
  );
};

const OutroScene = ({outro, durationInFrames, backgroundSrc}) => {
  const frame = useCurrentFrame();
  const copyProgress = clamp01(interpolate(frame, [0, 24], [0, 1], {extrapolateRight: 'clamp'}));
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const audioSrc = resolveSrc(outro?.audioSrc);

  return (
    <AbsoluteFill style={{opacity: fadeOut}}>
      <IntroLayers opacity={0.42} backgroundSrc={backgroundSrc} />
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center'}}>
        <div
          style={{
            width: '100%',
            padding: '20px 22px 70px',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, transparent 100%)',
            textAlign: 'center',
            opacity: copyProgress,
            transform: `translateY(${32 * (1 - copyProgress)}px)`,
            direction: 'rtl'
          }}
        >
          <div
            style={{
              color: '#ffd39f',
              fontSize: 50,
              lineHeight: 1.24,
              fontWeight: 700,
              textShadow: '0 6px 22px rgba(0, 0, 0, 0.88)'
            }}
          >
            {outro?.title || 'خلاصة الصدام'}
          </div>
          {outro?.body ? (
            <div
              style={{
                margin: '14px auto 0',
                maxWidth: 330,
                color: '#f1e2ca',
                fontSize: 22,
                lineHeight: 1.55,
                fontWeight: 500,
                textShadow: '0 5px 18px rgba(0, 0, 0, 0.82)'
              }}
            >
              {outro.body}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
      {audioSrc ? <Audio src={audioSrc} /> : null}
    </AbsoluteFill>
  );
};

export const QuoteDuelVideo = ({duel}) => {
  const {fps, width, height} = useVideoConfig();
  const data = duel ?? {scenes: []};
  const dateLabel = data?.meta?.dateLabel ?? '';
  const backgroundSrc = data?.assets?.introBackgroundSrc;
  // requireAudio:false → silent placeholder renders keep declared durations.
  const timeline = computeDuelTimeline(data, fps, {requireAudio: false});
  const scale = Math.min(width / STAGE_W, height / STAGE_H);

  const byId = new Map(timeline.duels.map((d) => [d.duelId, d]));

  return (
    <AbsoluteFill style={{background: palette.bg, fontFamily: fontStack, color: palette.ink}}>
      <FontFaces />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div
          style={{
            width: STAGE_W,
            height: STAGE_H,
            position: 'relative',
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            overflow: 'hidden'
          }}
        >
          {timeline.coldOpenFrames > 0 && data.hook?.text ? (
            <Sequence from={0} durationInFrames={timeline.coldOpenFrames} name="hook">
              <HookScene hook={data.hook} intro={data.intro} durationInFrames={timeline.coldOpenFrames} dateLabel={dateLabel} backgroundSrc={backgroundSrc} />
            </Sequence>
          ) : null}
          {(data.scenes ?? []).map((scene, index) => {
            const duelId = scene.id ?? `duel-${index + 1}`;
            const t = byId.get(duelId);
            if (!t || t.skipped) return null;
            const audioSrc = resolveSrc(scene.audio?.src);
            return (
              <Sequence key={duelId} from={t.startFrame} durationInFrames={t.durationFrames} name={duelId}>
                <DuelScene scene={scene} durationInFrames={t.durationFrames} dateLabel={dateLabel} backgroundSrc={backgroundSrc} />
                {audioSrc ? <Audio src={audioSrc} /> : null}
              </Sequence>
            );
          })}
          {timeline.outroFrames > 0 ? (
            <Sequence from={timeline.outroStartFrame} durationInFrames={timeline.outroFrames} name="outro">
              <OutroScene outro={data.outro} durationInFrames={timeline.outroFrames} backgroundSrc={backgroundSrc} />
            </Sequence>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default QuoteDuelVideo;
