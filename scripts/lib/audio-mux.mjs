// ffmpeg filter_complex builder for narration mux — extracted verbatim from
// mux-briefing-audio.mjs so the quote-duel muxer reuses the exact same audio
// graph (per-track adelay → amix, optional sidechain-ducked music bed) instead
// of cloning it. Pure string builder: no fs, no spawn, fully unit-testable.
//
// Input/stream convention (must match the caller's ffmpeg -i ordering):
//   input 0            → video (not referenced here)
//   inputs 1..N        → the N narration tracks, in audioEntries order
//   input N+1          → music bed (only when music is provided)
//
//   [k:a] aresample → aformat → adelay(entry.delayMs) ─┐
//                                                       ├─ amix(N) → [voice]
//   ... per entry ...                                  ┘
//   music? → bed chain (volume, fade-out) → [bed]
//   duck?  → sidechaincompress(bed keyed by voice) → amix(voice,bed) → [aout]
//   else   → amix(voice,bed) → [aout]   (or [voice] alone when no music)

/**
 * @param {object} args
 * @param {Array<{delayMs:number}>} args.audioEntries - narration tracks (ffmpeg inputs 1..N)
 * @param {number} args.totalMs - total timeline length, used to time the music fade-out
 * @param {null|{db:number, duck:boolean}} [args.music] - music bed config (input N+1)
 * @returns {string} the ffmpeg -filter_complex value
 */
export const buildMuxFilterComplex = ({audioEntries, totalMs, music = null}) => {
  const filterParts = audioEntries.map((entry, index) =>
    `[${index + 1}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${entry.delayMs}:all=1[a${index}]`
  );
  const mixInputs = audioEntries.map((_, index) => `[a${index}]`).join('');

  if (music) {
    const bedInputIndex = audioEntries.length + 1;
    const fadeStartSec = Math.max(0, (totalMs - 1500) / 1000).toFixed(3);
    const bedChain = [
      `[${bedInputIndex}:a]aresample=44100`,
      'aformat=sample_fmts=fltp:channel_layouts=stereo',
      `volume=${music.db}dB`,
      `afade=t=out:st=${fadeStartSec}:d=1.5[bed]`
    ].join(',');
    const voiceChain = `${mixInputs}amix=inputs=${audioEntries.length}:normalize=0:dropout_transition=0[voice]`;
    const mixChain = music.duck
      ? `[voice]asplit=2[voiceMix][voiceSc];[bed][voiceSc]sidechaincompress=threshold=0.02:ratio=12:attack=180:release=900[bedduck];[voiceMix][bedduck]amix=inputs=2:normalize=0:dropout_transition=0,apad[aout]`
      : `[voice][bed]amix=inputs=2:normalize=0:dropout_transition=0,apad[aout]`;
    return [...filterParts, voiceChain, bedChain, mixChain].join(';');
  }

  return [
    ...filterParts,
    `${mixInputs}amix=inputs=${audioEntries.length}:normalize=0:dropout_transition=0,apad[aout]`
  ].join(';');
};
