import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

const IMAGE_WIDTH = 938;
const IMAGE_HEIGHT = 1677;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export const MapFocusVideo = () => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();

  const baseScale = Math.max(width / IMAGE_WIDTH, height / IMAGE_HEIGHT);
  const centerPoint = {x: IMAGE_WIDTH / 2, y: IMAGE_HEIGHT / 2};
  const beirutMapPoint = {x: 610, y: 1000};

  const travel = spring({
    fps,
    frame,
    durationInFrames,
    config: {
      damping: 200
    }
  });

  const progress = clamp01(interpolate(travel, [0, 1], [0, 1]));
  const zoom = interpolate(progress, [0, 0.55, 1], [1, 1.12, 2.28]);
  const focusX = interpolate(progress, [0, 0.35, 1], [centerPoint.x, 520, beirutMapPoint.x]);
  const focusY = interpolate(progress, [0, 0.35, 1], [centerPoint.y, 930, beirutMapPoint.y]);
  const tx = width / 2 - focusX * baseScale * zoom;
  const ty = height / 2 - focusY * baseScale * zoom;
  const glow = interpolate(progress, [0, 1], [0.18, 0.42]);

  return (
    <AbsoluteFill style={{backgroundColor: '#07131d', overflow: 'hidden'}}>
      <Img
        src={staticFile('video-front-page-3.png')}
        style={{
          width: IMAGE_WIDTH * baseScale,
          height: IMAGE_HEIGHT * baseScale,
          transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
          transformOrigin: 'top left'
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 67% 61%, rgba(65, 225, 255, ${glow}), transparent 12%),
            linear-gradient(180deg, rgba(4, 10, 16, 0.05), rgba(4, 10, 16, 0.22))`,
          mixBlendMode: 'screen',
          pointerEvents: 'none'
        }}
      />
      <AbsoluteFill
        style={{
          boxShadow: 'inset 0 0 200px rgba(0, 0, 0, 0.35)',
          pointerEvents: 'none'
        }}
      />
    </AbsoluteFill>
  );
};
