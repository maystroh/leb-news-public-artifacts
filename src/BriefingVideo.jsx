import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

const fpsFromSeconds = (seconds, fps) => Math.round(seconds * fps);
const INTRO_DURATION_SECONDS = 6;
const INTRO_TAGLINE = 'RADAR BEIRUT';
const INTRO_SUBTEXT = 'الذكاء اللبناني الاصطناعي';
const SCENE_BODY_NOTE = 'النص الكامل يبقى في التعليق الصوتي، بينما تركز الشاشة على زاوية كل صحيفة.';
const SCENE_FOOTER_NOTE = 'يمكن في المرحلة التالية تحويل هذا الموجز إلى سطور متزامنة مع الصوت.';
const INTRO_TICKER_ITEMS = [
  'RADAR BEIRUT',
  'الذكاء اللبناني الاصطناعي',
  'BEIRUT MEDIA MONITOR',
  'DAILY PRESS BRIEFING'
];

export const calculateDurationInFrames = (briefing) => {
  const totalSeconds =
    INTRO_DURATION_SECONDS +
    briefing.outro.durationSeconds +
    briefing.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  return totalSeconds * 30;
};

const palette = {
  bg: '#071822',
  bgDeep: '#030d14',
  bgGlow: '#103247',
  ink: '#eef3f6',
  accent: '#d9702f',
  gold: '#d38b3f',
  muted: '#9bb2c2',
  line: 'rgba(124, 172, 204, 0.14)',
  panel: 'rgba(8, 24, 35, 0.82)',
  panelStrong: 'rgba(5, 17, 26, 0.92)'
};

const logoBadgeStyle = {
  width: 180,
  height: 90,
  objectFit: 'contain'
};

const radarBeirutBadgeStyle = {
  width: 156,
  height: 198,
  objectFit: 'contain',
  filter: 'drop-shadow(0 18px 28px rgba(23, 20, 17, 0.18))'
};

const rtlText = {
  direction: 'rtl',
  textAlign: 'right',
  fontFamily: '"Noto Naskh Arabic", Tahoma, "Segoe UI", Arial, sans-serif'
};

const ltrText = {
  direction: 'ltr',
  textAlign: 'left',
  fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
};

const RadarBeirutBadge = () => {
  return (
    <div
      style={{
        position: 'absolute',
        left: 54,
        bottom: 54,
        width: 176,
        height: 218,
        borderRadius: 30,
        background: 'linear-gradient(180deg, rgba(8,30,42,0.92), rgba(4,18,28,0.84))',
        border: '1px solid rgba(211, 139, 63, 0.28)',
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.24)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(10px)'
      }}
    >
      <Img src={staticFile('radar_beirut_logo_orange_full_2.png')} style={radarBeirutBadgeStyle} />
    </div>
  );
};

const Background = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 300], [0, 56], {
    extrapolateRight: 'clamp'
  });
  const glowShift = interpolate(frame, [0, 300], [0, 40], {
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 18% ${18 + glowShift * 0.08}%, rgba(211, 139, 63, 0.16), transparent 22%),
          radial-gradient(circle at 78% 18%, rgba(55, 140, 188, 0.18), transparent 26%),
          radial-gradient(circle at 52% 78%, rgba(17, 68, 96, 0.22), transparent 30%),
          linear-gradient(180deg, ${palette.bgDeep} 0%, ${palette.bg} 48%, #08131b 100%)`,
        overflow: 'hidden'
      }}
    >
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
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.26) 100%)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 120,
          left: -120,
          width: 420,
          height: 420,
          borderRadius: '50%',
          border: '2px solid rgba(211, 139, 63, 0.14)',
          boxShadow: '0 0 80px rgba(211, 139, 63, 0.06)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: -60,
          bottom: 180,
          width: 500,
          height: 500,
          borderRadius: '50%',
          border: '2px solid rgba(96, 176, 221, 0.12)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '12% 10%',
          border: '1px solid rgba(211, 139, 63, 0.08)',
          borderRadius: 48
        }}
      />
    </AbsoluteFill>
  );
};

const IntroRadarOpening = ({intro, dateLabel}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const flashOpacity = interpolate(frame, [0, 5, 12], [0.4, 0.14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const bgOpacity = interpolate(frame, [0, 18, 40], [0, 0.72, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const bgScale = interpolate(frame, [0, durationInFrames], [1.06, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic)
  });
  const radarSweepDeg = interpolate(frame, [0, durationInFrames], [-90, 270], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const sweepLineX = interpolate(frame, [45, 130], [-760, 1080], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const introReveal = spring({frame: frame - 84, fps, config: {damping: 16}});
  const titleReveal = spring({frame: frame - 112, fps, config: {damping: 18}});
  const titleOpacity = interpolate(titleReveal, [0, 0.25, 1], [0, 0.5, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const mapReveal = interpolate(frame, [60, 86], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const ringBaseOpacity = interpolate(frame, [36, 56], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const tickerReveal = interpolate(frame, [70, 86], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  const tickerOffset = 180 - (((frame * 8) % 1260) / 1260) * 1260;
  const tickerText = [...INTRO_TICKER_ITEMS, ...INTRO_TICKER_ITEMS].join('  ◆  ');

  const radarBlips = [
    {r: 0.38, angle: 22},
    {r: 0.62, angle: 110},
    {r: 0.75, angle: 196},
    {r: 0.5, angle: 290},
    {r: 0.85, angle: 160}
  ];

  const mapPoints = [
    {x: 0.42, y: 0.2, label: 'Hamra', offset: 0},
    {x: 0.58, y: 0.18, label: 'Gemmayzeh', offset: 8},
    {x: 0.65, y: 0.35, label: 'Achrafieh', offset: 18},
    {x: 0.38, y: 0.38, label: 'Verdun', offset: 26},
    {x: 0.28, y: 0.26, label: 'Mreisseh', offset: 34},
    {x: 0.52, y: 0.55, label: 'Badaro', offset: 44},
    {x: 0.7, y: 0.25, label: 'Mar Mikhael', offset: 52}
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000',
        color: '#f4eee3',
        overflow: 'hidden',
        opacity: fadeOut
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${staticFile('video-front-page-3.png')})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: bgOpacity,
          transform: `scale(${bgScale})`
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at center, transparent 28%, rgba(0,0,0,0.55) 100%)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: '56%',
          background:
            'linear-gradient(90deg, transparent 0%, rgba(205,127,50,0.08) 40%, rgba(205,127,50,0.24) 50%, rgba(205,127,50,0.08) 60%, transparent 100%)',
          transform: `translateX(${sweepLineX}px) skewX(-16deg)`,
          opacity: interpolate(frame, [45, 60], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          }),
          mixBlendMode: 'screen'
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#fff',
          opacity: flashOpacity
        }}
      />

      <div
        style={{
          ...ltrText,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '18px 36px',
          background: 'rgba(0,0,0,0.7)',
          borderBottom: '1px solid rgba(205,127,50,0.4)',
          overflow: 'hidden',
          opacity: tickerReveal,
          zIndex: 6
        }}
      >
        <div
          style={{
            display: 'inline-block',
            whiteSpace: 'nowrap',
            color: 'rgba(205,127,50,0.92)',
            fontSize: 22,
            letterSpacing: '0.22em',
            transform: `translateX(${tickerOffset}px)`
          }}
        >
          {tickerText}
        </div>
      </div>

      {[0, 1, 2].map((index) => {
        const localFrame = (frame - 54 - index * 16 + durationInFrames * 10) % 84;
        const pulseProgress = localFrame / 84;
        const scale = interpolate(pulseProgress, [0, 1], [0.86, 1.58]);
        const opacity = Math.max(0, 0.75 - pulseProgress * 0.75) * ringBaseOpacity;

        return (
          <div
            key={`ring-${index}`}
            style={{
              position: 'absolute',
              top: 160,
              left: '50%',
              width: 600,
              height: 600,
              marginLeft: -300,
              borderRadius: '50%',
              border: '3px solid rgba(205,127,50,0.58)',
              transform: `scale(${scale})`,
              opacity,
              boxShadow: '0 0 30px rgba(205,127,50,0.16)'
            }}
          />
        );
      })}

      <div
        style={{
          position: 'absolute',
          top: 160,
          left: '50%',
          width: 600,
          height: 600,
          marginLeft: -300,
          borderRadius: '50%',
          opacity: interpolate(frame, [30, 46], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          }),
          background:
            'radial-gradient(circle, rgba(205,127,50,0.08) 0%, rgba(205,127,50,0.04) 44%, transparent 45%), repeating-radial-gradient(circle, transparent 0 98px, rgba(205,127,50,0.18) 99px 102px)',
          border: '2px solid rgba(205,127,50,0.5)',
          boxShadow: '0 0 40px rgba(205,127,50,0.2)'
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `conic-gradient(from ${radarSweepDeg}deg,
              rgba(205,127,50,0.92) 0deg,
              rgba(205,127,50,0.24) 34deg,
              rgba(205,127,50,0.08) 76deg,
              transparent 112deg,
              transparent 360deg)`,
            maskImage: 'radial-gradient(circle, transparent 0 7%, black 8%)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 0 7%, black 8%)'
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 2,
            height: 286,
            background: 'rgba(205,127,50,0.95)',
            transform: `translate(-50%, -100%) rotate(${radarSweepDeg}deg)`,
            transformOrigin: 'bottom center',
            boxShadow: '0 0 12px rgba(205,127,50,0.72)'
          }}
        />
        {radarBlips.map((blip, index) => {
          const sweepProgress = ((radarSweepDeg + 90) % 360 + 360) % 360;
          const diff = (sweepProgress - blip.angle + 360) % 360;
          const life = diff < 16 ? 1 - diff / 16 : 0.12;
          const radius = 300 * blip.r;
          const x = 300 + radius * Math.cos((blip.angle * Math.PI) / 180);
          const y = 300 + radius * Math.sin((blip.angle * Math.PI) / 180);

          return (
            <div
              key={`blip-${index}`}
              style={{
                position: 'absolute',
                left: x - 6,
                top: y - 6,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: `rgba(255,186,84,${life})`,
                boxShadow: `0 0 18px rgba(255,186,84,${life})`
              }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 16,
            height: 16,
            marginLeft: -8,
            marginTop: -8,
            borderRadius: '50%',
            background: 'rgba(205,127,50,0.94)',
            boxShadow: '0 0 18px rgba(205,127,50,0.76)'
          }}
        />
      </div>

      {[
        {top: 132, left: 116, sx: 1, sy: 1},
        {top: 132, right: 116, sx: -1, sy: 1},
        {bottom: 412, left: 116, sx: 1, sy: -1},
        {bottom: 412, right: 116, sx: -1, sy: -1}
      ].map((bracket, index) => {
        const opacity = interpolate(frame, [42 + index * 4, 54 + index * 4], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        });

        return (
          <div
            key={`bracket-${index}`}
            style={{
              position: 'absolute',
              width: 60,
              height: 60,
              opacity,
              transform: `scale(${bracket.sx}, ${bracket.sy})`,
              ...bracket
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: 4,
                background: 'rgba(205,127,50,0.9)',
                boxShadow: '0 0 10px rgba(205,127,50,0.82)'
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 4,
                height: '100%',
                background: 'rgba(205,127,50,0.9)',
                boxShadow: '0 0 10px rgba(205,127,50,0.82)'
              }}
            />
          </div>
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 520,
          width: 440,
          height: 300,
          transform: `translateX(-50%) scale(${0.94 + mapReveal * 0.06})`,
          opacity: mapReveal
        }}
      >
        {mapPoints.map((point) => {
          const cycle = (frame - 72 - point.offset + durationInFrames * 20) % 90;
          const pointProgress = cycle / 90;
          const rippleScale = 0.4 + pointProgress * 1.6;
          const rippleOpacity = Math.max(0, 0.7 - pointProgress * 0.7);
          const labelOpacity = Math.max(0, 1 - pointProgress * 1.4);

          return (
            <React.Fragment key={point.label}>
              <div
                style={{
                  position: 'absolute',
                  left: `${point.x * 100}%`,
                  top: `${point.y * 100}%`,
                  width: 10,
                  height: 10,
                  marginLeft: -5,
                  marginTop: -5,
                  borderRadius: '50%',
                  background: 'rgba(205,127,50,0.95)',
                  boxShadow: '0 0 14px rgba(255,180,60,0.88)'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: `${point.x * 100}%`,
                  top: `${point.y * 100}%`,
                  width: 10,
                  height: 10,
                  marginLeft: -5,
                  marginTop: -5,
                  borderRadius: '50%',
                  border: `2px solid rgba(205,127,50,${rippleOpacity})`,
                  transform: `scale(${rippleScale})`
                }}
              />
              <div
                style={{
                  ...ltrText,
                  position: 'absolute',
                  left: `calc(${point.x * 100}% + 14px)`,
                  top: `calc(${point.y * 100}% - 16px)`,
                  color: `rgba(180,220,255,${labelOpacity})`,
                  fontSize: 14,
                  letterSpacing: '0.08em'
                }}
              >
                {point.label}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '40px 54px 58px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.88) 0%, transparent 100%)',
          opacity: interpolate(frame, [66, 92], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          }),
          transform: `translateY(${interpolate(introReveal, [0, 1], [32, 0])}px)`,
          zIndex: 5
        }}
      >
        <div
          style={{
            ...ltrText,
            color: 'rgba(205,127,50,0.96)',
            fontSize: 28,
            letterSpacing: '0.32em',
            textAlign: 'center',
            marginBottom: 10,
            textShadow: '0 0 18px rgba(205,127,50,0.46)'
          }}
        >
          {INTRO_TAGLINE}
        </div>
        <div
          style={{
            width: 220,
            height: 2,
            background:
              'linear-gradient(90deg, transparent, rgba(205,127,50,0.9), transparent)',
            margin: '0 auto 14px'
          }}
        />
        <div
          style={{
            ...rtlText,
            color: 'rgba(213,225,236,0.88)',
            fontSize: 22,
            textAlign: 'center',
            letterSpacing: '0.08em',
            marginBottom: 24
          }}
        >
          {INTRO_SUBTEXT}
        </div>
        <div
          style={{
            ...rtlText,
            maxWidth: 860,
            margin: '0 auto',
            textAlign: 'center',
            transform: `translateY(${interpolate(titleReveal, [0, 1], [26, 0])}px)`,
            opacity: titleOpacity
          }}
        >
          <div
            style={{
              color: 'rgba(205,127,50,0.92)',
              fontSize: 26,
              letterSpacing: '0.16em',
              marginBottom: 14
            }}
          >
            {intro.eyebrow}
          </div>
          <div
            style={{
              color: '#fff7e8',
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.22,
              marginBottom: intro.subtitle ? 18 : 12
            }}
          >
            {intro.title}
          </div>
          {intro.subtitle ? (
            <div
              style={{
                color: 'rgba(231,222,206,0.88)',
                fontSize: 34,
                lineHeight: 1.4,
                marginBottom: 14
              }}
            >
              {intro.subtitle}
            </div>
          ) : null}
          <div
            style={{
              ...ltrText,
              color: 'rgba(205,127,50,0.84)',
              fontSize: 22,
              letterSpacing: '0.12em',
              textAlign: 'center'
            }}
          >
            {dateLabel}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SceneCard = ({scene, dateLabel}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const reveal = spring({frame, fps, config: {damping: 16}});
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const accentShift = interpolate(frame, [0, durationInFrames], [0, 24], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill style={{padding: 72}}>
      <div
        style={{
          alignSelf: 'stretch',
          display: 'flex',
          justifyContent: 'flex-end',
          color: palette.muted,
          fontSize: 28,
          marginBottom: 24
        }}
      >
        <div>{dateLabel}</div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          flex: 1,
          background: `linear-gradient(180deg, rgba(10, 30, 42, 0.92), ${palette.panelStrong})`,
          borderRadius: 34,
          padding: '54px 48px',
          border: '1px solid rgba(107, 162, 197, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,0.03)',
          opacity: fadeOut,
          transform: `translateY(${interpolate(reveal, [0, 1], [80, 0])}px)`
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 32
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
            {scene.outlet ? (
              <div
                style={{
                  width: 212,
                  height: 112,
                  borderRadius: 24,
                  backgroundColor: 'rgba(242, 247, 250, 0.96)',
                  border: '1px solid rgba(211, 139, 63, 0.16)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.18)'
                }}
              >
                <Img src={staticFile(`outlet-logos/${scene.outlet.logoFile}`)} style={logoBadgeStyle} />
              </div>
            ) : null}
            <div
              style={{
                ...rtlText,
                color: palette.gold,
                fontSize: 28
              }}
            >
              {scene.outlet ? scene.outlet.name : ''}
            </div>
          </div>
          <div
            style={{
              width: 140,
              height: 5,
              borderRadius: 999,
              background: `linear-gradient(90deg, rgba(81, 170, 223, 0.7), ${palette.gold}, ${palette.accent})`,
              transform: `translateX(${accentShift}px)`
            }}
          />
        </div>
        <div style={rtlText}>
          <div
            style={{
              color: palette.ink,
              fontWeight: 700,
              fontSize: 64,
              lineHeight: 1.22,
              marginBottom: 24
            }}
          >
            {scene.visual?.headline ?? scene.title}
          </div>
          <div
            style={{
              color: 'rgba(227, 236, 242, 0.92)',
              fontSize: 36,
              lineHeight: 1.6,
              marginBottom: scene.visual?.quote ? 28 : 0
            }}
          >
            {scene.visual?.summary ?? scene.body}
          </div>
          {scene.visual?.quote ? (
            <div
              style={{
                borderRight: `5px solid ${palette.gold}`,
                paddingRight: 20,
                color: '#ffd29a',
                fontSize: 30,
                lineHeight: 1.55,
                fontWeight: 700,
                maxWidth: '88%'
              }}
            >
              {scene.visual.quote}
            </div>
          ) : null}
          <div
            style={{
              color: palette.muted,
              fontSize: 24,
              lineHeight: 1.5,
              marginTop: 30
            }}
          >
            {SCENE_BODY_NOTE}
          </div>
        </div>
        <div
        style={{
          ...rtlText,
          marginTop: 32,
          color: 'rgba(155, 178, 194, 0.86)',
          fontSize: 24
        }}
      >
        {SCENE_FOOTER_NOTE}
        </div>
      </div>
      <RadarBeirutBadge />
    </AbsoluteFill>
  );
};

const OutroCard = ({outro, dateLabel}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const rise = spring({frame, fps, config: {stiffness: 90}});

  return (
    <AbsoluteFill style={{padding: 90, justifyContent: 'center'}}>
      <div
        style={{
          ...rtlText,
          color: palette.ink,
          background: `linear-gradient(180deg, rgba(10, 30, 42, 0.92), ${palette.panelStrong})`,
          borderRadius: 36,
          padding: '70px 60px',
          border: '1px solid rgba(107, 162, 197, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28)',
          transform: `translateY(${interpolate(rise, [0, 1], [70, 0])}px)`
        }}
      >
        <div style={{color: palette.muted, fontSize: 28, marginBottom: 20}}>{dateLabel}</div>
        <div style={{color: palette.accent, fontSize: 34, marginBottom: 24}}>{outro.title}</div>
        <div style={{fontSize: 84, fontWeight: 700, lineHeight: 1.3}}>{outro.body}</div>
      </div>
      <RadarBeirutBadge />
    </AbsoluteFill>
  );
};

export const BriefingVideo = ({briefing}) => {
  const {fps} = useVideoConfig();
  const introFrames = fpsFromSeconds(INTRO_DURATION_SECONDS, fps);
  const outroFrames = fpsFromSeconds(briefing.outro.durationSeconds, fps);
  let cursor = introFrames;

  const sceneSequences = briefing.scenes.map((scene, index) => {
    const durationInFrames = fpsFromSeconds(scene.durationSeconds, fps);
    const sequence = {
      scene,
      index,
      from: cursor,
      durationInFrames
    };
    cursor += durationInFrames;
    return sequence;
  });

  return (
    <AbsoluteFill style={{color: palette.ink}}>
      <Sequence from={0} durationInFrames={introFrames}>
        <IntroRadarOpening intro={briefing.intro} dateLabel={briefing.meta.dateLabel} />
      </Sequence>
      <Sequence from={introFrames} durationInFrames={cursor + outroFrames - introFrames}>
        <Background />
      </Sequence>
      {sceneSequences.map(({scene, index, from, durationInFrames}) => {
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <SceneCard
              scene={scene}
              sceneIndex={index}
              sceneCount={briefing.scenes.length}
              dateLabel={briefing.meta.dateLabel}
            />
          </Sequence>
        );
      })}
      <Sequence from={cursor} durationInFrames={outroFrames}>
        <OutroCard outro={briefing.outro} dateLabel={briefing.meta.dateLabel} />
      </Sequence>
    </AbsoluteFill>
  );
};
