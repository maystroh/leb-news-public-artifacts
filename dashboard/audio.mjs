import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJsonSafe, wavDurationSeconds, exists, mtimeMs} from './lib/checks.mjs';
import {defaultDuelText, duelTextSource, resolveDuelId} from '../scripts/lib/duel-narration-text.mjs';
import {loadState, saveState} from './lib/state.mjs';

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const SCENE_2_GREETING_PREFIX = 'صباح الخير من رادار بيروت';
const SCENE_2_AUDIO_PREFIX = 'صباح الخير من رادار بيروت؛ بملخص الصحافة اليوم منبلش من';

const overridesPath = (ctx) => path.join(ctx.audioDir, 'text-overrides.json');

const getStableHash = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
};

const textFingerprint = (value) => getStableHash(normalize(value));

const normalizeOverrideStore = (raw) => {
  if (!raw || typeof raw !== 'object') return {};
  return raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : raw;
};

const overrideTextForScene = (overrides, sceneId, defaultText) => {
  const entry = overrides?.[sceneId];
  if (typeof entry === 'string') return normalize(entry);
  if (!entry || typeof entry !== 'object') return '';
  if (entry.defaultTextHash && entry.defaultTextHash !== textFingerprint(defaultText)) return '';
  return normalize(entry.text);
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const removeScene2OutletHandoff = (text, outletName) => {
  let cleaned = normalize(text);
  if (!outletName) return cleaned;
  const outletPattern = escapeRegExp(outletName);
  const patterns = [
    new RegExp(`^نبدأ\\s+من\\s+${outletPattern}\\s*[،,]\\s*`),
    new RegExp(`^منبلش\\s+من\\s+${outletPattern}\\s*[،,]\\s*`),
    new RegExp(`^${outletPattern}\\s*[،,]\\s*`)
  ];

  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  return cleaned;
};

const ensureScene2AudioPrefix = (scene, text) => {
  const normalized = normalize(text);
  if (
    scene.id !== 'scene-2' ||
    !normalized ||
    normalized.startsWith(SCENE_2_AUDIO_PREFIX) ||
    normalized.startsWith(SCENE_2_GREETING_PREFIX)
  ) {
    return normalized;
  }

  const outletName = normalize(scene.outlet?.name || scene.outletName || '');
  const withoutHandoff = removeScene2OutletHandoff(normalized, outletName);
  if (!outletName) return `${SCENE_2_AUDIO_PREFIX} ${withoutHandoff}`.trim();
  return `${SCENE_2_AUDIO_PREFIX} ${outletName}${withoutHandoff ? `، ${withoutHandoff}` : ''}`;
};

const materializeSceneAudioText = (scene, text) => ensureScene2AudioPrefix(scene, text);

export function loadTextOverrides(ctx) {
  const raw = normalizeOverrideStore(readJsonSafe(overridesPath(ctx)));
  const scenes = narrationScenes(ctx);
  if (!scenes.length) {
    return Object.fromEntries(
      Object.entries(raw).map(([sceneId, entry]) => [
        sceneId,
        typeof entry === 'string' ? normalize(entry) : normalize(entry?.text)
      ]).filter(([, text]) => text)
    );
  }

  return Object.fromEntries(
    scenes.map((scene) => [scene.id, overrideTextForScene(raw, scene.id, scene.defaultText)])
      .filter(([, text]) => text)
  );
}

export function saveTextOverride(ctx, sceneId, text) {
  const rawOverrides = normalizeOverrideStore(readJsonSafe(overridesPath(ctx)));
  const normalized = normalize(text);
  const scenes = narrationScenes(ctx);
  const scene = scenes.find((item) => item.id === sceneId);
  if (!normalized || (scene && normalized === scene.defaultText)) {
    delete rawOverrides[sceneId];
  } else {
    rawOverrides[sceneId] = {
      text: normalized,
      defaultTextHash: textFingerprint(scene?.defaultText || ''),
      savedAt: new Date().toISOString()
    };
  }
  fs.mkdirSync(ctx.audioDir, {recursive: true});
  if (Object.keys(rawOverrides).length === 0) {
    if (fs.existsSync(overridesPath(ctx))) fs.unlinkSync(overridesPath(ctx));
  } else {
    fs.writeFileSync(overridesPath(ctx), JSON.stringify({
      meta: {
        dateLabel: ctx.date,
        savedAt: new Date().toISOString(),
        schema: 'text-overrides/v2'
      },
      overrides: rawOverrides
    }, null, 2));
  }
  return loadTextOverrides(ctx);
}

const duelOverridesPath = (ctx) => path.join(ctx.audioDir, 'quote-duel-text-overrides.json');

export function loadDuelTextOverrides(ctx) {
  return readJsonSafe(duelOverridesPath(ctx)) || {};
}

// One entry per duel, merging output/quote-duel.json with the override file.
// Uses the shared text precedence so the panel default == the synthesized default.
export function duelNarrationEntries(ctx) {
  const duel = readJsonSafe(path.join(ctx.output, 'quote-duel.json'));
  const scenes = Array.isArray(duel?.scenes) ? duel.scenes : [];
  const overrides = loadDuelTextOverrides(ctx);

  return scenes.map((scene, index) => {
    const duelId = resolveDuelId(scene, index);
    const overrideText = normalize(overrides[duelId]);
    const defaultText = defaultDuelText(scene);
    const effectiveText = overrideText || defaultText;
    return {
      duelId,
      outlets: [normalize(scene.left?.outlet), normalize(scene.right?.outlet)],
      quotes: [normalize(scene.left?.quote), normalize(scene.right?.quote)],
      defaultText,
      overrideText: overrideText || null,
      effectiveText,
      isOverridden: Boolean(overrideText),
      source: duelTextSource(scene, overrideText)
    };
  });
}

export function saveDuelTextOverride(ctx, duelId, text) {
  const overrides = loadDuelTextOverrides(ctx);
  const normalized = normalize(text);
  const entry = duelNarrationEntries(ctx).find((item) => item.duelId === duelId);
  if (!normalized || (entry && normalized === entry.defaultText)) {
    delete overrides[duelId];
  } else {
    overrides[duelId] = normalized;
  }
  fs.mkdirSync(ctx.audioDir, {recursive: true});
  if (Object.keys(overrides).length === 0) {
    if (fs.existsSync(duelOverridesPath(ctx))) fs.unlinkSync(duelOverridesPath(ctx));
  } else {
    fs.writeFileSync(duelOverridesPath(ctx), JSON.stringify(overrides, null, 2));
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
    defaultText: materializeSceneAudioText(scene, scene.audioText || scene.body)
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
  const wavMtime = wavExists ? mtimeMs(absPath) : null;
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
    // How the WAV was produced: "ai" (Hamsa) or "recorded". Absent/legacy → "ai".
    source: manifestEntry?.source === 'recorded' ? 'recorded' : 'ai',
    // WAV exists but was generated from different text than the current script
    textMismatch: wavExists && Boolean(manifestText) && manifestText !== effectiveText,
    wavExists,
    wavDurationSeconds: wavExists ? wavDurationSeconds(absPath) : null,
    wavMtimeMs: wavMtime,
    url: wavExists && audioPathRel ? `/${audioPathRel.replace(/\\/g, '/')}?v=${Math.round(wavMtime)}` : null,
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

// Per-date narration source default: "ai" (Hamsa) or "human" (record-your-own).
// Stored in output/dashboard-state.json; gates the bulk Step 7 only. Per-scene
// overrides (Hamsa or Record) always work regardless of this toggle.
export function loadAudioSource(ctx) {
  return loadState(ctx).audioSource === 'human' ? 'human' : 'ai';
}

export function saveAudioSource(ctx, audioSource) {
  const value = audioSource === 'human' ? 'human' : 'ai';
  const state = loadState(ctx);
  state.audioSource = value;
  saveState(ctx, state);
  return value;
}

// Mark a scene's manifest entry as a recorded take so the "recorded" source
// survives every later rebuild (the generator carries it forward). Creates the
// manifest if the user recorded before ever running Step 7.
export function stampRecordedSource(ctx, sceneId, recordedText, durationSeconds) {
  const manifestPath = path.join(ctx.audioDir, 'manifest.json');
  let manifest = readJsonSafe(manifestPath);
  if (!manifest) manifest = {meta: {generatedAt: new Date().toISOString(), provider: 'recorded'}, entries: []};
  if (!Array.isArray(manifest.entries)) manifest.entries = [];

  const scene = narrationScenes(ctx).find((item) => item.id === sceneId) || null;
  const audioKey = scene?.audioKey || sceneId;
  const audioPathRel = path.posix.join(ctx.folderRel, 'audio', `${sceneId}-${audioKey}.wav`);
  const text = normalize(recordedText);

  let entry = manifest.entries.find((item) => item.sceneId === sceneId);
  if (!entry) {
    entry = {
      id: `${sceneId}-${audioKey}`,
      sceneId,
      sceneTitle: scene?.title || '',
      segmentType: scene?.segmentType || 'scene',
      outletKey: null,
      outletName: scene?.outletName || null,
      audioPath: audioPathRel
    };
    manifest.entries.push(entry);
  }
  entry.source = 'recorded';
  entry.text = text;
  entry.chars = text.length;
  entry.audioDurationSeconds = durationSeconds ?? null;
  entry.status = 'recorded';
  if (!entry.audioPath) entry.audioPath = audioPathRel;

  if (manifest.audioByScene?.[sceneId]) {
    manifest.audioByScene[sceneId] = {
      ...manifest.audioByScene[sceneId],
      audioPath: entry.audioPath,
      durationSeconds: durationSeconds ?? null,
      status: 'recorded'
    };
  }

  fs.mkdirSync(ctx.audioDir, {recursive: true});
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// Per-scene recording: mirrors buildRegenerateCommands but converts the uploaded
// take to a scene-path WAV (ffmpeg) instead of calling Hamsa, then stamps the
// manifest and runs the unchanged duration-compare → timing-sync → rebuild tail.
// Reuses the audio-regen:<sceneId> stepId so the verdict badge + row log fire as-is.
export function buildRecordingCommands(ctx, sceneId, tmpBlobPath) {
  const entry = audioEntries(ctx, {audio: {}}).find((item) => item.sceneId === sceneId);
  if (!entry || !entry.fileName) {
    throw new Error(`No narration scene found for id: ${sceneId}`);
  }
  const absPath = path.join(ctx.audioDir, entry.fileName);
  const recordedText = entry.effectiveText;

  return [
    {
      label: `Convert recorded take for ${sceneId} to WAV`,
      fn: async (emit, shared) => {
        shared.sceneId = sceneId;
        shared.oldDuration = exists(absPath) ? wavDurationSeconds(absPath) : null;
        let backupPath = null;
        if (exists(absPath)) {
          const ext = path.extname(absPath);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          backupPath = path.join(path.dirname(absPath), `${path.basename(absPath, ext)}.stale-${stamp}${ext}`);
          fs.renameSync(absPath, backupPath);
          emit(`Backed up old WAV (duration ${shared.oldDuration?.toFixed(3) ?? '?'}s):`);
          emit(`  ${absPath} -> ${backupPath}`);
        }
        try {
          fs.mkdirSync(path.dirname(absPath), {recursive: true});
          // Match existing Hamsa WAVs: mono 16-bit PCM @ 16 kHz.
          const result = spawnSync(
            'ffmpeg',
            ['-y', '-i', tmpBlobPath, '-ac', '1', '-c:a', 'pcm_s16le', '-ar', '16000', absPath],
            {encoding: 'utf8'}
          );
          if (result.error?.code === 'ENOENT') {
            throw new Error('ffmpeg not found — install ffmpeg to save recordings.');
          }
          if (result.status !== 0) {
            const tail = (result.stderr || '').split(/\r?\n/).filter(Boolean).slice(-5).join('\n');
            throw new Error(`ffmpeg failed to convert the recording (exit ${result.status}).\n${tail}`);
          }
          if (!exists(absPath) || !(wavDurationSeconds(absPath) > 0)) {
            throw new Error('Converted WAV is empty or zero-length — recording rejected.');
          }
          emit(`Wrote recorded WAV: ${absPath}`);
        } catch (error) {
          // Restore the prior take so a bad recording never loses existing audio.
          if (backupPath && exists(backupPath) && !exists(absPath)) {
            fs.renameSync(backupPath, absPath);
            emit('Restored the previous WAV after the failed conversion.');
          }
          throw error;
        } finally {
          if (exists(tmpBlobPath)) {
            try {
              fs.unlinkSync(tmpBlobPath);
            } catch {
              /* best-effort temp cleanup */
            }
          }
        }
      }
    },
    {
      label: 'Stamp manifest entry as recorded',
      fn: async (emit) => {
        stampRecordedSource(ctx, sceneId, recordedText, wavDurationSeconds(absPath));
        emit(`Marked ${sceneId} as a recorded take in the manifest.`);
      }
    },
    {
      label: 'Compare durations',
      fn: async (emit, shared) => {
        shared.newDuration = wavDurationSeconds(absPath);
        const oldDur = shared.oldDuration;
        const newDur = shared.newDuration;
        emit(`New WAV duration: ${newDur?.toFixed(3) ?? '?'}s (was ${oldDur?.toFixed(3) ?? 'n/a'}s)`);
        if (oldDur != null && newDur != null) {
          if (newDur > oldDur + 0.01) {
            shared.verdict = 'longer';
            emit('WARNING: the recorded take is LONGER than the old one.');
            emit('Scene timings shift — the muted video is invalidated and must be RE-RENDERED before muxing.');
          } else {
            shared.verdict = 'ok';
            emit('Recorded take is the same length or shorter — re-running the mux is enough (no re-render needed).');
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
