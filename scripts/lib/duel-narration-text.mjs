// scripts/lib/duel-narration-text.mjs
// Single source of truth for per-duel spoken-text selection, shared by the TTS
// generator (scripts/generate-quote-duel-audio.mjs) and the dashboard narration
// editor (dashboard/audio.mjs) so the shown default always matches what is synthesized.

export const normalizeSpacing = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function formatDuelAudioText(scene) {
  const event = normalizeSpacing(scene.eventLabel || scene.contrastLabel);
  const leftOutlet = normalizeSpacing(scene.left?.outlet);
  const leftSays = normalizeSpacing(scene.left?.audioLine || scene.left?.stance || scene.left?.quote);
  const rightOutlet = normalizeSpacing(scene.right?.outlet);
  const rightSays = normalizeSpacing(scene.right?.audioLine || scene.right?.stance || scene.right?.quote);
  const lines = [];
  if (event) lines.push(`الحدث هو "${event}"`);
  if (leftOutlet && leftSays) lines.push(`"${leftOutlet}" قالت عنو "${leftSays}"`);
  if (rightOutlet && rightSays) lines.push(`"${rightOutlet}" قالت عنو "${rightSays}"`);
  return normalizeSpacing(lines.join(' '));
}

export function defaultDuelText(scene) {
  return normalizeSpacing(scene.audioText || scene.narration || formatDuelAudioText(scene) || scene.summary);
}

export function duelTextSource(scene, overrideText) {
  if (overrideText) return 'override';
  if (scene.audioText) return 'audioText';
  if (scene.narration) return 'narration';
  if (formatDuelAudioText(scene)) return 'generated-format';
  if (scene.summary) return 'summary';
  return null;
}

export function resolveDuelId(scene, index) {
  // UNPADDED on purpose — matches the override/manifest/timeline keys (duel-1, duel-2…).
  return scene.id ?? `duel-${index + 1}`;
}
