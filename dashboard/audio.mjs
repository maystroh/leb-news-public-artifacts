import fs from 'node:fs';
import path from 'node:path';
import {readJsonSafe, wavDurationSeconds, exists, mtimeMs} from './lib/checks.mjs';

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const overridesPath = (ctx) => path.join(ctx.audioDir, 'text-overrides.json');

export function loadTextOverrides(ctx) {
  return readJsonSafe(overridesPath(ctx)) || {};
}

export function saveTextOverride(ctx, sceneId, text) {
  const overrides = loadTextOverrides(ctx);
  const normalized = normalize(text);
  const scenes = narrationScenes(ctx);
  const scene = scenes.find((item) => item.id === sceneId);
  if (!normalized || (scene && normalized === scene.defaultText)) {
    delete overrides[sceneId];
  } else {
    overrides[sceneId] = normalized;
  }
  fs.mkdirSync(ctx.audioDir, {recursive: true});
  if (Object.keys(overrides).length === 0) {
    if (fs.existsSync(overridesPath(ctx))) fs.unlinkSync(overridesPath(ctx));
  } else {
    fs.writeFileSync(overridesPath(ctx), JSON.stringify(overrides, null, 2));
  }
  return overrides;
}

// Same scene list and text selection as audio/generate-outlet-audio.mjs
// (scenes use audioText || body; the outro question is appended as "outro").
function narrationScenes(ctx) {
  const briefing = readJsonSafe(path.join(ctx.output, 'briefing.json'));
  if (!briefing) return [];
  const scenes = [
    ...(briefing.scenes || []).map((scene) => ({...scene, segmentType: 'scene'})),
    briefing.outro
      ? {
          id: 'outro',
          title: briefing.outro.title,
          body: briefing.outro.body,
          durationSeconds: briefing.outro.durationSeconds,
          outlet: null,
          audioKey: 'open-question',
          segmentType: 'outro'
        }
      : null
  ].filter(Boolean);

  return scenes.map((scene) => ({
    id: scene.id,
    title: scene.title || '',
    segmentType: scene.segmentType,
    outletName: scene.outlet?.name || '',
    audioKey: scene.outlet?.key || scene.audioKey || scene.id,
    durationSeconds: scene.durationSeconds ?? null,
    defaultText: normalize(scene.audioText || scene.body)
  }));
}

// One entry per narration scene, merging the briefing script (pre-generation)
// with manifest/WAV info (post-generation). Silent scenes (no text) are skipped.
export function audioEntries(ctx, state) {
  const scenes = narrationScenes(ctx);
  const manifest = readJsonSafe(path.join(ctx.audioDir, 'manifest.json'));
  const manifestEntries = manifest?.entries || [];
  const overrides = loadTextOverrides(ctx);

  if (!scenes.length) {
    // No briefing.json yet — fall back to manifest-only listing.
    return manifestEntries.map((entry) => buildEntry(ctx, state, overrides, null, entry));
  }

  return scenes
    .filter((scene) => scene.defaultText || normalize(overrides[scene.id]))
    .map((scene) => {
      const manifestEntry = manifestEntries.find((entry) => entry.sceneId === scene.id) || null;
      return buildEntry(ctx, state, overrides, scene, manifestEntry);
    });
}

function buildEntry(ctx, state, overrides, scene, manifestEntry) {
  const sceneId = scene?.id || manifestEntry.sceneId;
  const overrideText = normalize(overrides[sceneId]);
  const defaultText = scene ? scene.defaultText : normalize(manifestEntry?.text);
  const effectiveText = overrideText || defaultText;

  const audioPathRel =
    manifestEntry?.audioPath ||
    (scene ? path.posix.join(ctx.folderRel, 'audio', `${sceneId}-${scene.audioKey}.wav`) : null);
  const absPath = audioPathRel ? path.resolve(ctx.repoRoot, audioPathRel) : null;
  const wavExists = absPath ? exists(absPath) : false;
  const manifestText = normalize(manifestEntry?.text);

  return {
    sceneId,
    sceneTitle: scene?.title || manifestEntry?.sceneTitle || '',
    segmentType: scene?.segmentType || manifestEntry?.segmentType || 'scene',
    outletName: scene?.outletName || manifestEntry?.outletName || manifestEntry?.outlet?.name || '',
    defaultText,
    overrideText: overrideText || null,
    effectiveText,
    isOverridden: Boolean(overrideText),
    // WAV exists but was generated from different text than the current script
    textMismatch: wavExists && Boolean(manifestText) && manifestText !== effectiveText,
    wavExists,
    wavDurationSeconds: wavExists ? wavDurationSeconds(absPath) : null,
    wavMtimeMs: wavExists ? mtimeMs(absPath) : null,
    url: wavExists && audioPathRel ? `/${audioPathRel.replace(/\\/g, '/')}` : null,
    fileName: audioPathRel ? path.basename(audioPathRel) : null,
    regen: state.audio?.[sceneId] || null
  };
}

// Per-scene regeneration: move the WAV aside so audio:outlets (reuse-by-default)
// regenerates only this scene, then resync timings and rebuild outputs.
// Also used to generate a single missing scene after a script edit.
export function buildRegenerateCommands(ctx, sceneId) {
  const entries = audioEntries(ctx, {audio: {}});
  const entry = entries.find((item) => item.sceneId === sceneId);
  if (!entry || !entry.fileName) {
    throw new Error(`No narration scene found for id: ${sceneId}`);
  }
  const absPath = path.join(ctx.audioDir, entry.fileName);

  return [
    {
      label: `Back up current WAV for ${sceneId}`,
      fn: async (emit, shared) => {
        shared.sceneId = sceneId;
        shared.oldDuration = exists(absPath) ? wavDurationSeconds(absPath) : null;
        if (exists(absPath)) {
          const ext = path.extname(absPath);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = path.join(path.dirname(absPath), `${path.basename(absPath, ext)}.stale-${stamp}${ext}`);
          fs.renameSync(absPath, backupPath);
          emit(`Moved old WAV aside (duration ${shared.oldDuration?.toFixed(3) ?? '?'}s):`);
          emit(`  ${absPath}`);
          emit(`  -> ${backupPath}`);
        } else {
          emit('No existing WAV found — generating fresh.');
        }
      }
    },
    {cmd: 'npm', args: ['run', 'audio:outlets', '--', '--folder', ctx.folderRel]},
    {
      label: 'Compare durations',
      fn: async (emit, shared) => {
        if (!exists(absPath)) throw new Error(`Regeneration did not produce ${absPath}`);
        shared.newDuration = wavDurationSeconds(absPath);
        const oldDur = shared.oldDuration;
        const newDur = shared.newDuration;
        emit(`New WAV duration: ${newDur?.toFixed(3) ?? '?'}s (was ${oldDur?.toFixed(3) ?? 'n/a'}s)`);
        if (oldDur != null && newDur != null) {
          if (newDur > oldDur + 0.01) {
            shared.verdict = 'longer';
            emit('WARNING: the new narration is LONGER than the old one.');
            emit('Scene timings shift — the muted video is invalidated and must be RE-RENDERED before muxing.');
          } else {
            shared.verdict = 'ok';
            emit('New narration is the same length or shorter — re-running the mux is enough (no re-render needed).');
          }
        } else {
          shared.verdict = oldDur == null ? 'new' : 'unknown';
        }
      }
    },
    {cmd: 'node', args: ['./scripts/sync-outlet-audio-timing.mjs', '--folder', ctx.folderRel]},
    {cmd: 'npm', args: ['run', 'briefing:build:folder', '--', '--folder', ctx.folderRel]}
  ];
}
