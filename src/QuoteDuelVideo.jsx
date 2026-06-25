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
  eventLabelY: 60,
  quoteFontPx: 25,
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
  const accent = side === 'left' ? palette.amber : palette.cyan;
  const logoSrc = resolveSrc(outlet?.logoSrc);
  return (
    <div style={{direction: 'rtl', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0}}>
      <div
        style={{
          width: 78 * logoScale,
          height: 40 * logoScale,
          borderRadius: 12,
          background: 'rgba(244, 247, 250, 0.97)',
          border: `1px solid ${accent}29`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 22px rgba(0,0,0,0.18)',
          flexShrink: 0,
          overflow: 'hidden'
        }}
      >
        {logoSrc ? (
          <Img src={logoSrc} style={{maxWidth: 62 * logoScale, maxHeight: 24 * logoScale, objectFit: 'contain'}} />
        ) : (
          <span style={{color: '#0a1722', fontSize: 12, fontWeight: 700, padding: '0 6px', textAlign: 'center'}}>
            {outlet?.outlet}
          </span>
        )}
      </div>
      <div style={{minWidth: 0}}>
        <div style={{fontSize: 14, fontWeight: 700, color: palette.ink}}>{outlet?.outlet}</div>
        <div style={{color: palette.muted, fontSize: 11, fontWeight: 500}}>{outlet?.stance}</div>
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
        gridTemplateRows: 'auto 1fr',
        gap: 12,
        padding: '14px 12px',
        minWidth: 0,
        borderRadius: 22,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(4,13,21,0.64)',
        boxShadow: `inset 0 0 0 1px rgba(${rgba},0.08)`,
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
          padding: '14px 12px',
          borderRadius: 18,
          fontSize: layout.quoteFontPx,
          lineHeight: 1.52,
          fontWeight: 500,
          textAlign: 'center',
          color: quoteColor,
          background: `linear-gradient(180deg, rgba(${rgba},0.14), rgba(${rgba},0.05))`,
          border: `1px solid rgba(${rgba},0.16)`
        }}
      >
        {ellipsize(data?.quote, layout.quoteMaxLines, layout.quoteFontPx)}
      </div>
    </div>
  );
};

const DuelScene = ({scene, durationInFrames, dateLabel}) => {
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
      {/* date pill near the top, centered (visual rule) */}
      <div
        style={{
          position: 'absolute',
          top: 26,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            padding: '5px 14px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            color: palette.muted,
            background: 'rgba(5,13,20,0.84)',
            border: '1px solid rgba(154,178,197,0.2)'
          }}
        >
          {dateLabel}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: `${layout.eventLabelY}px 16px 16px`,
          display: 'grid',
          gridTemplateRows: 'auto auto 1fr auto',
          gap: 14
        }}
      >
        {/* event pill */}
        <div
          style={{
            justifySelf: 'center',
            maxWidth: '100%',
            padding: '10px 16px',
            borderRadius: 999,
            border: '1px solid rgba(205,127,50,0.28)',
            background: 'rgba(205,127,50,0.08)',
            color: palette.event,
            fontSize: 18,
            lineHeight: 1.4,
            fontWeight: 700,
            textAlign: 'center',
            direction: 'rtl',
            opacity: reveal
          }}
        >
          {scene.eventLabel}
        </div>

        {/* contrast question ("vs") */}
        <div style={{textAlign: 'center', color: palette.muted, fontSize: 14, lineHeight: 1.5, direction: 'rtl', opacity: reveal}}>
          {scene.contrastLabel}
        </div>

        {/* duel grid */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, direction: 'ltr', minHeight: 0}}>
          <DuelPanel data={scene.left} side="left" reveal={reveal} layout={layout} />
          <DuelPanel data={scene.right} side="right" reveal={reveal} layout={layout} />
        </div>

        {/* bottom summary */}
        {scene.summary ? (
          <div
            style={{
              textAlign: 'center',
              color: '#f1e2ca',
              fontSize: 13,
              lineHeight: 1.6,
              fontWeight: 400,
              padding: '12px 14px',
              borderTop: '1px solid rgba(205,127,50,0.14)',
              background: 'linear-gradient(180deg, rgba(205,127,50,0.06), rgba(205,127,50,0.02))',
              borderRadius: 18,
              direction: 'rtl',
              opacity: reveal
            }}
          >
            {scene.summary}
          </div>
        ) : (
          <div />
        )}
      </div>
    </AbsoluteFill>
  );
};

// Attention hook prepended to the master start (e.g. "اليوم شو عم بقولوا
// للبنانية"). Punchy radar-ping visual + big bold text; spoken via <Audio> when
// a hook WAV was synthesized. The splitter prepends this same range to every
// output, so every short and the full reel open with it.
const HookScene = ({hook, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  // Text punch-in: scale overshoot + fade over the first ~12 frames.
  const enter = clamp01(interpolate(frame, [0, 12], [0, 1], {extrapolateRight: 'clamp'}));
  const scale = interpolate(enter, [0, 0.6, 1], [1.18, 0.99, 1]);
  const fadeOut = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  // Sweeping scan beam + breathing.
  const sweep = interpolate(frame % Math.max(1, Math.round(fps * 1.6)), [0, Math.round(fps * 1.6)], [-120, 120]);
  const breathe = 1 + 0.015 * Math.sin(t * 6);

  // Two radar pulse rings expanding on a loop.
  const ring = (offset) => {
    const cyc = (t + offset) % 1.3;
    return {
      size: interpolate(cyc, [0, 1.3], [40, 360]),
      opacity: interpolate(cyc, [0, 0.15, 1.3], [0, 0.5, 0])
    };
  };
  const rings = [ring(0), ring(0.65)];

  return (
    <AbsoluteFill style={{opacity: fadeOut}}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        {rings.map((r, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: r.size,
              height: r.size,
              borderRadius: '50%',
              border: `2px solid ${palette.amber}`,
              opacity: r.opacity
            }}
          />
        ))}
        {/* sweeping beam */}
        <div
          style={{
            position: 'absolute',
            width: 2,
            height: STAGE_H,
            left: `calc(50% + ${sweep}px)`,
            background: `linear-gradient(180deg, transparent, ${palette.amber}55, transparent)`,
            opacity: 0.5
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: '0 36px'}}>
        <div
          style={{
            direction: 'rtl',
            textAlign: 'center',
            fontSize: 40,
            lineHeight: 1.3,
            fontWeight: 700,
            color: palette.ink,
            textShadow: `0 0 24px ${palette.amber}66`,
            transform: `scale(${scale * breathe})`,
            opacity: enter
          }}
        >
          {hook?.text}
        </div>
      </AbsoluteFill>
      {hook?.audioSrc ? <Audio src={resolveSrc(hook.audioSrc)} /> : null}
    </AbsoluteFill>
  );
};

const OutroScene = ({outro, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const copyProgress = clamp01(interpolate(frame, [0, 24], [0, 1], {extrapolateRight: 'clamp'}));
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const sweep = interpolate(frame % Math.max(1, Math.round(fps * 1.8)), [0, Math.round(fps * 1.8)], [-150, 150]);
  const pulse = 1 + 0.025 * Math.sin(t * 5);
  const audioSrc = resolveSrc(outro?.audioSrc);

  return (
    <AbsoluteFill style={{opacity: fadeOut}}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div
          style={{
            position: 'absolute',
            width: 330,
            height: 330,
            borderRadius: '50%',
            border: `1px solid ${palette.amber}44`,
            boxShadow: `0 0 48px ${palette.amber}18`,
            transform: `scale(${pulse})`,
            opacity: 0.9
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 2,
            height: STAGE_H,
            left: `calc(50% + ${sweep}px)`,
            background: `linear-gradient(180deg, transparent, ${palette.cyan}44, transparent)`,
            opacity: 0.55
          }}
        />
      </AbsoluteFill>
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
            الصحافة اليوم
          </div>
        </div>
      </AbsoluteFill>
      {audioSrc ? <Audio src={audioSrc} /> : null}
    </AbsoluteFill>
  );
};

const StageBackground = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const drift = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 40], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 80% at 50% ${10 + drift / 8}%, #06131d 0%, ${palette.bgDeep} 72%)`
      }}
    />
  );
};

export const QuoteDuelVideo = ({duel}) => {
  const {fps, width, height} = useVideoConfig();
  const data = duel ?? {scenes: []};
  const dateLabel = data?.meta?.dateLabel ?? '';
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
          <StageBackground />
          {timeline.coldOpenFrames > 0 && data.hook?.text ? (
            <Sequence from={0} durationInFrames={timeline.coldOpenFrames} name="hook">
              <HookScene hook={data.hook} durationInFrames={timeline.coldOpenFrames} />
            </Sequence>
          ) : null}
          {(data.scenes ?? []).map((scene, index) => {
            const duelId = scene.id ?? `duel-${index + 1}`;
            const t = byId.get(duelId);
            if (!t || t.skipped) return null;
            const audioSrc = resolveSrc(scene.audio?.src);
            return (
              <Sequence key={duelId} from={t.startFrame} durationInFrames={t.durationFrames} name={duelId}>
                <DuelScene scene={scene} durationInFrames={t.durationFrames} dateLabel={dateLabel} />
                {audioSrc ? <Audio src={audioSrc} /> : null}
              </Sequence>
            );
          })}
          {timeline.outroFrames > 0 ? (
            <Sequence from={timeline.outroStartFrame} durationInFrames={timeline.outroFrames} name="outro">
              <OutroScene outro={data.outro} durationInFrames={timeline.outroFrames} />
            </Sequence>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default QuoteDuelVideo;
