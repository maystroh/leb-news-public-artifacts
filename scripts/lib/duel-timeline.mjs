// Single source of truth for Quote Duel video timing.
//
// Why this exists: the briefing pipeline computes scene offsets three
// independent ways — the Remotion comp (fpsFromSeconds), the muxer
// (frame-rounded cumulative sum), and the splitter (second-precision
// cumulative sum). On 15–20s briefing scenes the sub-frame drift is
// invisible. Duel clips are ~9s and the audio must land in the first ~1.5s,
// so the comp, the muxer, and the splitter MUST agree to the exact frame.
// They all consume computeDuelTimeline() so there is one place that does the
// rounding, the skip decision, the ranking, and the 60s cap.
//
// Timeline shape (coldOpen deferred — coldOpenSeconds defaults to 0):
//
//   frame 0           coldOpenFrames        +d0        +d1        ...
//   |───coldOpen──────|────duel[0]──────────|──duel[1]──|── ... ──|
//   (full reel only)   atomic clips start here; clip-N == source scene N
//
// Every duration is frame-quantized once (fpsFromSeconds) and offsets are
// accumulated in FRAMES, then echoed back to seconds, so seconds === frames/fps.

export const DEFAULT_FPS = 30;
export const DEFAULT_MAIN_RANK = 3; // ranks 1..3 are "main" → quote-duel-full.mp4
export const FULL_REEL_MAX_SECONDS = 60;

export const fpsFromSeconds = (seconds, fps = DEFAULT_FPS) =>
  Math.max(1, Math.round((seconds || 0) * fps));

const toNumber = (value, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const roundSeconds = (value) => Number(value.toFixed(3));

/**
 * Build the frame-accurate timeline for a quote-duel document.
 *
 * @param {object} duel - parsed quote-duel.json (scenes[], optional coldOpen)
 * @param {number} [fps=30]
 * @param {object} [options]
 * @param {number} [options.coldOpenSeconds] - overrides duel.coldOpen.durationSeconds; defaults to 0
 * @param {boolean} [options.requireAudio=false] - when true, a scene with no usable
 *        audio duration is marked skipped and excluded from the timeline + outputs
 *        (mirrors the briefing splitter's per-segment failure handling). When false
 *        (silent placeholder renders), scenes keep their declared durationSeconds.
 * @param {number} [options.mainRank=3]
 * @param {number} [options.maxFullSeconds=60]
 * @returns {{
 *   fps:number, coldOpenSeconds:number, coldOpenFrames:number,
 *   duels: Array<{duelId:string,index:number,rank:number,main:boolean,skipped:boolean,
 *                 narration:(string|null),durationSeconds:number,durationFrames:number,
 *                 startSeconds:number,startFrame:number,endSeconds:number,endFrame:number,
 *                 audio:(object|null), skipReason:(string|null)}>,
 *   totalFrames:number, totalSeconds:number,
 *   mainPlan: Array<string>, droppedFromFull: Array<string>, fullSeconds:number,
 *   warnings: Array<string>
 * }}
 */
export const computeDuelTimeline = (duel, fps = DEFAULT_FPS, options = {}) => {
  const {
    requireAudio = false,
    mainRank = DEFAULT_MAIN_RANK,
    maxFullSeconds = FULL_REEL_MAX_SECONDS
  } = options;

  const scenes = Array.isArray(duel?.scenes) ? duel.scenes : [];
  const warnings = [];

  const coldOpenSeconds = toNumber(
    options.coldOpenSeconds ?? duel?.coldOpen?.durationSeconds,
    0
  );
  const coldOpenFrames = coldOpenSeconds > 0 ? fpsFromSeconds(coldOpenSeconds, fps) : 0;

  // First pass: resolve identity + skip decision in stable SOURCE order.
  // Filenames/ranks/captions key off `index` (1-based source ordinal) and
  // `duelId`, so a skipped duel never renumbers the survivors.
  const resolved = scenes.map((scene, sourceIndex) => {
    const duelId = scene?.id ?? `duel-${sourceIndex + 1}`;
    const rank = Number.isFinite(scene?.rank) ? scene.rank : sourceIndex + 1;
    const audio = scene?.audio ?? null;
    const audioSeconds = toNumber(audio?.durationSeconds);
    const declaredSeconds = toNumber(scene?.durationSeconds);
    const durationSeconds = audioSeconds > 0 ? audioSeconds : declaredSeconds;

    let skipped = scene?.skipped === true;
    let skipReason = skipped ? 'flagged' : null;
    if (!skipped && requireAudio && audioSeconds <= 0) {
      skipped = true;
      skipReason = 'missing-audio';
      warnings.push(`Skipping ${duelId}: no usable audio duration (requireAudio).`);
    }
    if (!skipped && durationSeconds <= 0) {
      skipped = true;
      skipReason = 'no-duration';
      warnings.push(`Skipping ${duelId}: no duration available.`);
    }

    return {
      duelId,
      index: sourceIndex + 1,
      rank,
      narration: scene?.narration ?? null,
      audio,
      skipped,
      skipReason,
      durationSeconds
    };
  });

  // Second pass: accumulate FRAME offsets over non-skipped duels only.
  let cursorFrame = coldOpenFrames;
  const duels = resolved.map((entry) => {
    if (entry.skipped) {
      return {
        ...entry,
        main: false,
        durationFrames: 0,
        startFrame: null,
        startSeconds: null,
        endFrame: null,
        endSeconds: null
      };
    }
    const durationFrames = fpsFromSeconds(entry.durationSeconds, fps);
    const startFrame = cursorFrame;
    cursorFrame += durationFrames;
    return {
      ...entry,
      // main is finalized below once we know how many duels survived
      main: false,
      durationFrames,
      startFrame,
      startSeconds: roundSeconds(startFrame / fps),
      durationSeconds: roundSeconds(durationFrames / fps),
      endFrame: cursorFrame,
      endSeconds: roundSeconds(cursorFrame / fps)
    };
  });

  const totalFrames = cursorFrame;

  // Ranking → main plan. Ranks 1..mainRank are "main"; if no duel qualifies
  // (all ranks > mainRank) fall back to the top-N by rank. With N<=mainRank
  // survivors this naturally selects all of them (edge case: N<3 → full = all).
  const survivors = duels.filter((d) => !d.skipped);
  let mainCandidates = survivors.filter((d) => d.rank <= mainRank);
  if (mainCandidates.length === 0) {
    mainCandidates = [...survivors]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, mainRank);
  }
  const mainSet = new Set(mainCandidates.map((d) => d.duelId));
  for (const d of duels) {
    if (mainSet.has(d.duelId)) d.main = true;
  }

  // Full-reel plan: main duels in rank order, capped at maxFullSeconds by
  // dropping the LOWEST-priority (largest rank) main until it fits.
  let fullPlan = [...mainCandidates].sort((a, b) => a.rank - b.rank);
  const droppedFromFull = [];
  const sumSeconds = (plan) => plan.reduce((s, d) => s + d.durationSeconds, 0);
  while (fullPlan.length > 1 && sumSeconds(fullPlan) > maxFullSeconds) {
    const worst = fullPlan.reduce((a, b) => (b.rank > a.rank ? b : a), fullPlan[0]);
    droppedFromFull.push(worst.duelId);
    warnings.push(
      `quote-duel-full over ${maxFullSeconds}s — dropping lowest-rank main ${worst.duelId} (rank ${worst.rank}).`
    );
    fullPlan = fullPlan.filter((d) => d.duelId !== worst.duelId);
  }

  return {
    fps,
    coldOpenSeconds,
    coldOpenFrames,
    duels,
    totalFrames,
    totalSeconds: roundSeconds(totalFrames / fps),
    mainPlan: fullPlan.map((d) => d.duelId),
    droppedFromFull,
    fullSeconds: roundSeconds(sumSeconds(fullPlan)),
    warnings
  };
};

/**
 * Composition duration helper — mirror of calculateProductionDurationInFrames.
 * Uses the same frame-quantized total the muxer/splitter use, so all three agree.
 */
export const calculateQuoteDuelDurationInFrames = (duel, fps = DEFAULT_FPS, options = {}) =>
  computeDuelTimeline(duel, fps, options).totalFrames;
