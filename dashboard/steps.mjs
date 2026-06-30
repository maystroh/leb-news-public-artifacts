import fs from 'node:fs';
import path from 'node:path';
import {
  ANALYSIS_FILES,
  REPO_ROOT,
  SSH_HOST,
  SSH_PORT,
  REMOTE_ROOT,
  DATA_SERVER_HOST,
  DATA_SERVER_ROOT,
  DATA_SSH_E,
  remoteBriefingsDir
} from './config.mjs';
import {
  assetsReport,
  countParagraphs,
  exists,
  expectedOutletCount,
  MISSING_OUTLET_TOLERANCE,
  mtimeMs,
  findSummaryImagePrompt,
  moveStaleClosingAudioIfNeeded,
  outputDurationSummaryLines,
  readJsonSafe,
  uniqueOutletImageKeys
} from './lib/checks.mjs';
import {loadState, saveState} from './lib/state.mjs';
import {audioEntries, loadAudioSource} from './audio.mjs';
import {DEFAULT_DUEL_HOOKS, DEFAULT_HOOK_ID, DEFAULT_DUEL_OUTRO_AUDIO} from '../scripts/lib/duel-hooks.mjs';

const npmRun = (script, ...extra) => ({cmd: 'npm', args: ['run', script, '--', ...extra]});
const sshArgs = (remoteCommand) => ['-p', SSH_PORT, '-o', 'ConnectTimeout=8', SSH_HOST, remoteCommand];

const fromLastRun = (stepState, pendingDetail = '') => {
  if (!stepState) return {status: 'pending', detail: pendingDetail};
  if (stepState.status === 'success') return {status: 'done', detail: `Last run ${stepState.finishedAt || ''}`.trim()};
  return {status: 'failed', detail: `Last run failed (exit ${stepState.exitCode ?? '?'})`};
};

const staleIfBriefingNewer = (ctx, base, finishedAtMs) => {
  const briefingMtime = mtimeMs(path.join(ctx.output, 'briefing.json'));
  if (briefingMtime && finishedAtMs && briefingMtime > finishedAtMs + 5000) {
    return {status: 'stale', detail: 'output/briefing.json changed after this step last ran.'};
  }
  return base;
};

const staleIfDuelInputsNewer = (ctx, base, finishedAtMs) => {
  const inputs = [
    path.join(ctx.output, 'quote-duel.json'),
    path.join(ctx.audioDir, 'quote-duel-manifest.json'),
    path.join(REPO_ROOT, 'audio', 'hooks', 'manifest.json')
  ];
  const audioMtimes = exists(ctx.audioDir)
    ? fs
        .readdirSync(ctx.audioDir)
        .filter((name) => /^duel-\d+\.wav$/.test(name))
        .map((name) => mtimeMs(path.join(ctx.audioDir, name)))
    : [];
  const newest = Math.max(0, ...inputs.map(mtimeMs), ...audioMtimes);
  if (newest && finishedAtMs && newest > finishedAtMs + 5000) {
    return {status: 'stale', detail: 'Quote Duel JSON, narration audio, or hook manifest changed after this step last ran.'};
  }
  return base;
};

const finishedAtMsOf = (stepState) => (stepState?.finishedAt ? Date.parse(stepState.finishedAt) : 0);
const POST180_PARAGRAPH_PATTERN = /(?:180\s*(?:post|بوست)|١٨٠\s*بوست)/iu;

function removePost180ParagraphFromCorrectedBriefing(correctedPath) {
  const raw = fs.readFileSync(correctedPath, 'utf8');
  const hadTrailingNewline = /\r?\n$/.test(raw);
  const paragraphs = raw
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const kept = paragraphs.filter((paragraph) => !POST180_PARAGRAPH_PATTERN.test(paragraph));
  const removedCount = paragraphs.length - kept.length;

  if (removedCount > 0) {
    fs.writeFileSync(correctedPath, `${kept.join('\n\n')}${hadTrailingNewline ? '\n' : ''}`);
  }

  return {removedCount, paragraphCountBefore: paragraphs.length, paragraphCountAfter: kept.length};
}

function post180CleanupStatus(correctedPath, state) {
  if (!exists(correctedPath)) return null;
  const currentHasParagraph = POST180_PARAGRAPH_PATTERN.test(fs.readFileSync(correctedPath, 'utf8'));
  if (currentHasParagraph) return '180post paragraph found in corrected briefing; resync will remove it before pushing.';

  const cleanup = state?.remoteSync?.post180Cleanup;
  if (cleanup?.result === 'removed') {
    return `180post paragraph was found and removed during the last resync (${cleanup.removedCount} paragraph${cleanup.removedCount === 1 ? '' : 's'}).`;
  }
  if (cleanup?.result === 'not-found') {
    return '180post paragraph was not found during the last resync.';
  }
  return '180post paragraph not found in corrected briefing.';
}

// Final (audio-muxed) MP4 variants currently sitting in the output folder, for the
// split step. Every `radar-beirut-briefing*-final.mp4` maps to its own
// `scene-videos[-suffix]/` dir so variants never overwrite each other's clips.
const splitVariantLabel = (mid) => {
  if (mid === '') return 'Normal briefing';
  if (mid === '-hook-captions') return 'Hook: captions + focus boxes';
  if (mid === '-hook-stamps') return 'Hook: quote stamps + chips';
  return mid.replace(/^-/, '');
};

function finalVideoVariants(ctx) {
  if (!exists(ctx.output)) return [];
  return fs
    .readdirSync(ctx.output)
    .filter((name) => /^radar-beirut-briefing.*-final\.mp4$/.test(name))
    .sort()
    .map((fileName) => {
      const mid = fileName.replace(/^radar-beirut-briefing/, '').replace(/-final\.mp4$/, '');
      const outputDirName = `scene-videos${mid}`;
      return {
        value: fileName,
        label: splitVariantLabel(mid),
        fileName,
        mid,
        input: path.join(ctx.output, fileName),
        inputRel: path.posix.join(ctx.outputRel, fileName),
        outputDir: path.join(ctx.output, outputDirName),
        outputDirRel: path.posix.join(ctx.outputRel, outputDirName)
      };
    });
}

function quoteDuelHtmlArtifacts(ctx) {
  const manifestPath = path.join(ctx.output, 'quote-duel-html-manifest.json');
  const manifest = readJsonSafe(manifestPath);
  if (!manifest) {
    return [
      {
        label: 'radar-beirut-quote-duel.html (combined duels + hook intro)',
        file: path.join(ctx.output, 'radar-beirut-quote-duel.html'),
        open: true
      }
    ];
  }

  const selectedHookLabel = manifest.selectedHook?.id
    ? `radar-beirut-quote-duel.html (combined duels + ${manifest.selectedHook.id} intro)`
    : 'radar-beirut-quote-duel.html (combined duels + hook intro)';
  return [
    {label: selectedHookLabel, file: path.join(ctx.output, 'radar-beirut-quote-duel.html'), open: true},
    ...(manifest.duels ?? []).map((duel, index) => ({
      label: `${duel.fileName ?? `radar-beirut-quote-duel-${String(index + 1).padStart(2, '0')}.html`} (${duel.duelId ?? `duel-${index + 1}`})`,
      file: path.join(ctx.output, duel.fileName ?? `radar-beirut-quote-duel-${String(index + 1).padStart(2, '0')}.html`),
      open: true
    }))
  ];
}

function quoteDuelRenderChoices(ctx) {
  const duel = readJsonSafe(path.join(ctx.output, 'quote-duel.json'));
  const manifest = readJsonSafe(path.join(ctx.folder, 'audio', 'quote-duel-manifest.json'));
  const audioByDuel = manifest?.audioByDuel ?? {};
  return (duel?.scenes ?? []).map((scene, index) => {
    const duelId = scene.id ?? `duel-${index + 1}`;
    const audio = audioByDuel[duelId] ?? {};
    const bits = [
      `Duel ${String(index + 1).padStart(2, '0')}`,
      scene.eventLabel,
      scene.left?.outlet && scene.right?.outlet ? `${scene.left.outlet} / ${scene.right.outlet}` : ''
    ].filter(Boolean);
    return {
      value: duelId,
      label: bits.join(' - '),
      index: index + 1,
      audioFile: audio.file || `duel-${String(index + 1).padStart(2, '0')}.wav`
    };
  });
}

function safeDuelChoices(ctx, requested) {
  const choices = quoteDuelRenderChoices(ctx);
  const allowed = new Set(choices.map((choice) => choice.value));
  const selected = Array.isArray(requested)
    ? choices.filter((choice) => requested.includes(choice.value) && allowed.has(choice.value))
    : choices;
  return selected.length ? selected : choices;
}

function quoteDuelVideoArtifacts(ctx, hookId) {
  const videoDir = path.join(ctx.output, `duel-videos-${hookId}`);
  const manifestPath = path.join(videoDir, 'manifest.json');
  const manifest = readJsonSafe(manifestPath);
  const manifestFiles = (manifest?.duels ?? [])
    .map((duel) => duel?.fileName)
    .filter((fileName) => typeof fileName === 'string' && /^duel-\d+\.mp4$/.test(fileName));
  const directoryFiles = exists(videoDir)
    ? fs
        .readdirSync(videoDir, {withFileTypes: true})
        .filter((entry) => entry.isFile() && /^duel-\d+\.mp4$/.test(entry.name))
        .map((entry) => entry.name)
    : [];
  const fileNames = [...new Set([...manifestFiles, ...directoryFiles])].sort();
  return [
    {label: `duel-videos-${hookId}/manifest.json`, file: manifestPath, optional: true},
    ...fileNames.map((fileName) => ({
      label: `duel-videos-${hookId}/${fileName}`,
      file: path.join(videoDir, fileName),
      open: true
    }))
  ];
}

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const quoteDuelServerCodeSync = () => ({
  cmd: 'rsync',
  args: [
    '-avR',
    '-e',
    `ssh -p ${SSH_PORT}`,
    'src/QuoteDuelVideo.jsx',
    'scripts/render-quote-duel-video.mjs',
    'scripts/mux-quote-duel-audio.mjs',
    'scripts/lib/audio-mux.mjs',
    'scripts/lib/briefing-helpers.mjs',
    'scripts/lib/duel-hooks.mjs',
    'scripts/lib/duel-timeline.mjs',
    'scripts/lib/remotion-assets.mjs',
    `${SSH_HOST}:${REMOTE_ROOT}/`
  ]
});

// A date is "remote-sync" (created from the dashboard, fed by the data server)
// only when its state was stamped by POST /api/create-date.
export const isRemoteSyncDate = (state) => state?.remoteSync?.source === 'remote-sync';

const correctedBriefingPath = (ctx) => path.join(ctx.folder, `briefing_${ctx.date}_corrected.txt`);

// The source briefing pulled from the data server. The canonical name is
// briefing_<date>.txt (dashes), but tolerate the underscore-date and .md variants
// the data pipeline has used so the corrected copy can always be seeded.
function findSourceBriefing(ctx) {
  const underscore = ctx.date.replace(/-/g, '_');
  const candidates = [
    `briefing_${ctx.date}.txt`,
    `briefing_${ctx.date}.md`,
    `briefing_${underscore}.txt`,
    `briefing_${underscore}.md`
  ];
  for (const name of candidates) {
    const file = path.join(ctx.folder, name);
    if (exists(file)) return file;
  }
  return null;
}

// Readiness for unlocking later steps: the source briefing text plus at least one
// image per outlet (unique outlet image keys >= paragraphs - 3). Mirrors the asset
// math in assetsReport but does not require the corrected file (that is step 00).
function remotePullReady(ctx) {
  const source = path.join(ctx.folder, `briefing_${ctx.date}.txt`);
  if (!exists(source)) {
    return {ready: false, detail: `Missing ${path.basename(source)} — remote folder not filled yet.`};
  }
  const paragraphs = countParagraphs(source);
  if (paragraphs === 0) return {ready: false, detail: 'Briefing text is empty — remote folder not filled yet.'};
  const required = expectedOutletCount(ctx, paragraphs);
  const minKeys = Math.max(0, required - MISSING_OUTLET_TOLERANCE);
  const keys = uniqueOutletImageKeys(ctx.folder);
  if (keys.length < minKeys) {
    return {ready: false, detail: `Only ${keys.length}/${required} outlet image keys present — waiting for more screenshots.`};
  }
  return {ready: true, detail: `${paragraphs} paragraphs, ${keys.length}/${required} outlet image keys.`};
}

function buildRemoteSyncSteps(ctx) {
  const folder = ctx.folderRel;
  const remoteDir = remoteBriefingsDir(ctx.date);
  return [
    {
      id: 'remote-pull',
      title: '0. Sync briefing from data server',
      description:
        `rsync of ${DATA_SERVER_HOST}:${remoteDir}/ → ${folder}/. ` +
        `Fails if the server has not produced ${DATA_SERVER_ROOT}/${ctx.date}/briefings yet — re-run the sync once it exists.`,
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Sync from server',
          commands: () => [
            {
              cmd: 'rsync',
              args: ['-av', '-e', DATA_SSH_E, `${DATA_SERVER_HOST}:${remoteDir}/`, `${ctx.folder}/`]
            },
            {
              label: 'Seed corrected briefing copy',
              fn: async (emit) => {
                const corrected = correctedBriefingPath(ctx);
                if (exists(corrected)) {
                  emit(`${path.basename(corrected)} already exists — leaving your edits untouched.`);
                  return;
                }
                const source = findSourceBriefing(ctx);
                if (!source) {
                  emit('No source briefing file found yet — corrected copy not created. Re-sync once the server fills it.');
                  return;
                }
                fs.copyFileSync(source, corrected);
                emit(`Created ${path.basename(corrected)} from ${path.basename(source)} — edit it below, then resync in step 00.`);
              }
            },
            {
              label: 'Readiness check',
              fn: async (emit) => {
                const report = remotePullReady(ctx);
                const state = loadState(ctx);
                state.remoteSync = {
                  ...(state.remoteSync || {}),
                  lastPullAt: new Date().toISOString(),
                  ready: report.ready,
                  readyDetail: report.detail
                };
                saveState(ctx, state);
                if (report.ready) {
                  emit(`Remote folder is ready: ${report.detail}`);
                } else {
                  emit(`Remote folder not fully filled: ${report.detail}`);
                  emit('Later steps stay locked. Re-sync once the briefing text and one image per outlet are present.');
                }
              }
            }
          ]
        }
      ],
      artifacts: () => [
        {label: 'Source briefing', file: path.join(ctx.folder, `briefing_${ctx.date}.txt`)},
        {label: 'Corrected briefing', file: correctedBriefingPath(ctx)}
      ],
      status: (stepState, state) => {
        const rs = state?.remoteSync;
        if (stepState?.status === 'failed') {
          return {
            status: 'failed',
            detail: `Last sync failed (exit ${stepState.exitCode ?? '?'}) — the server folder may not exist yet. Re-run when it does.`
          };
        }
        if (!rs?.lastPullAt) return {status: 'pending', detail: 'Not synced yet.'};
        if (rs.ready) return {status: 'done', detail: `Synced ${rs.lastPullAt} — ${rs.readyDetail}`};
        return {status: 'attention', detail: `Synced ${rs.lastPullAt} — not filled yet: ${rs.readyDetail}`};
      }
    },

    {
      id: 'remote-correct',
      title: '00. Correct briefing & resync',
      description:
        `Create/edit ${folder}/briefing_${ctx.date}_corrected.txt locally, then click resync to push it back to ` +
        `${DATA_SERVER_HOST}:${remoteDir}/.`,
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Correct / resync',
          commands: () => {
            const corrected = correctedBriefingPath(ctx);
            return [
              {
                label: 'Check and clean corrected file',
                fn: async (emit) => {
                  if (!exists(corrected)) {
                    throw new Error(`Missing ${path.basename(corrected)} — create it locally before resyncing.`);
                  }
                  emit(`Found ${path.basename(corrected)}.`);
                  const cleanup = removePost180ParagraphFromCorrectedBriefing(corrected);
                  const state = loadState(ctx);
                  state.remoteSync = {
                    ...(state.remoteSync || {}),
                    post180Cleanup: {
                      checkedAt: new Date().toISOString(),
                      result: cleanup.removedCount > 0 ? 'removed' : 'not-found',
                      removedCount: cleanup.removedCount,
                      paragraphCountBefore: cleanup.paragraphCountBefore,
                      paragraphCountAfter: cleanup.paragraphCountAfter
                    }
                  };
                  saveState(ctx, state);
                  if (cleanup.removedCount > 0) {
                    emit(
                      `Found and removed ${cleanup.removedCount} 180post paragraph` +
                      `${cleanup.removedCount === 1 ? '' : 's'} from ${path.basename(corrected)} before resync.`
                    );
                  } else {
                    emit(`Could not find an 180post paragraph in ${path.basename(corrected)}; file left unchanged.`);
                  }
                }
              },
              {cmd: 'rsync', args: ['-av', '-e', DATA_SSH_E, corrected, `${DATA_SERVER_HOST}:${remoteDir}/`]},
              {
                label: 'Record resync',
                fn: async (emit) => {
                  const state = loadState(ctx);
                  state.remoteSync = {...(state.remoteSync || {}), lastPushAt: new Date().toISOString()};
                  saveState(ctx, state);
                  emit('Corrected briefing pushed to the server.');
                }
              }
            ];
          }
        }
      ],
      artifacts: () => [{label: 'Corrected briefing', file: correctedBriefingPath(ctx)}],
      status: (stepState, state) => {
        const corrected = correctedBriefingPath(ctx);
        if (!exists(corrected)) {
          return {status: 'pending', detail: `Create briefing_${ctx.date}_corrected.txt, then resync.`};
        }
        if (stepState?.status === 'failed') return {status: 'failed', detail: 'Last resync failed — review the log.'};
        const lastPushAt = state?.remoteSync?.lastPushAt;
        const cleanupDetail = post180CleanupStatus(corrected, state);
        if (!lastPushAt) {
          return {
            status: 'pending',
            detail: `Corrected file present — resync it to the server.${cleanupDetail ? ` ${cleanupDetail}` : ''}`
          };
        }
        if (mtimeMs(corrected) > Date.parse(lastPushAt)) {
          return {
            status: 'stale',
            detail: `Corrected file changed since the last resync — resync again.${cleanupDetail ? ` ${cleanupDetail}` : ''}`
          };
        }
        return {status: 'done', detail: `Resynced ${lastPushAt}.${cleanupDetail ? ` ${cleanupDetail}` : ''}`};
      }
    }
  ];
}

export function getSteps(ctx, state = null, options = {}) {
  const out = ctx.outputRel;
  const folder = ctx.folderRel;
  const mode = options?.mode === 'duel' ? 'duel' : 'main';
  const duelMode = mode === 'duel';
  const finalMp4 = path.join(ctx.output, 'radar-beirut-briefing-final.mp4');
  const mutedMp4 = path.join(ctx.output, 'radar-beirut-briefing.mp4');
  const splitVariants = finalVideoVariants(ctx);
  const socialCaptions = path.join(ctx.output, 'social-captions.json');
  const youtubeThumbnailPrompt = path.join(ctx.output, 'youtube-thumbnail-prompt.md');
  const htmlFiles = [
    'radar-beirut-briefing.html',
    'radar-beirut-briefing-hook-captions.html',
    'radar-beirut-briefing-hook-stamps.html',
    'radar-beirut-quote-duel.html',
    'radar-beirut-fault-line-map.html',
    'radar-beirut-keyword-radar.html'
  ];
  // Quote Duel video path. Using hook-2 only for now; the hook
  // strategy is still open, so the variant is fixed here rather than exposed.
  const DUEL_HOOK = 'hook-2';
  const duelManifest = path.join(ctx.folder, 'audio', 'quote-duel-manifest.json');
  const duelVideosDir = path.join(ctx.output, `duel-videos-${DUEL_HOOK}`);
  const duelClipManifest = path.join(duelVideosDir, 'manifest.json');
  const duelRenderChoices = quoteDuelRenderChoices(ctx);
  const quoteDuelJson = path.join(ctx.output, 'quote-duel.json');
  const duelSocialCaptions = path.join(ctx.output, 'quote-duel-social-captions.json');
  const duelSocialPrompts = path.join(ctx.output, 'quote-duel-social-prompts.json');
  const duelSocialReady = exists(quoteDuelJson) && exists(duelManifest);

  const baseSteps = [
    {
      id: 'assets-check',
      title: '1. Verify briefing text and image assets',
      description:
        'Checks the corrected briefing source and that unique outlet image keys equal paragraph count minus 3 (intro, summary, final question).',
      kind: 'verify',
      actions: [
        {
          id: 'check',
          label: 'Run check',
          commands: () => [
            {
              label: 'Asset verification',
              fn: async (emit) => {
                const report = assetsReport(ctx);
                emit(`Detected briefing paragraphs: ${report.paragraphCount}`);
                emit(`Required unique outlet image keys: ${report.requiredKeys}`);
                emit(`Detected unique outlet image keys: ${report.keys.length} (${report.keys.join(', ') || 'none'})`);
                if (report.images.length) {
                  emit('Usable image assets:');
                  for (const image of report.images) emit(`  ${image}`);
                }
                for (const problem of report.problems) emit(`PROBLEM: ${problem}`);
                if (!report.ok) throw new Error('Asset check failed.');
                emit('Initial asset check passed.');
              }
            }
          ]
        }
      ],
      artifacts: () => [
        {label: 'Corrected briefing', file: path.join(ctx.folder, `briefing_${ctx.date}_corrected.txt`)},
        {label: 'Source briefing', file: path.join(ctx.folder, `briefing_${ctx.date}.txt`)}
      ],
      status: () => {
        const report = assetsReport(ctx);
        if (report.ok) return {status: 'done', detail: `${report.paragraphCount} paragraphs, ${report.keys.length} outlet image keys.`};
        return {status: 'attention', detail: report.problems[0]};
      }
    },

    {
      id: 'generate-handoff',
      title: '2. Generate Codex handoff pack',
      description: 'Creates output/codex-briefing-prompt.md and the five editable analysis JSON stubs.',
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Generate',
          commands: () => [npmRun('briefing:generate:all', '--folder', folder, '--briefing-folder-terminal-path', folder)]
        }
      ],
      artifacts: () => [
        {label: 'Codex prompt', file: path.join(ctx.output, 'codex-briefing-prompt.md')},
        ...ANALYSIS_FILES.map((name) => ({label: `Stub: ${name}`, file: path.join(ctx.folder, name)}))
      ],
      status: (stepState) => {
        const prompt = path.join(ctx.output, 'codex-briefing-prompt.md');
        if (!exists(prompt)) return fromLastRun(stepState, 'Prompt not generated yet.');
        const source = path.join(ctx.folder, `briefing_${ctx.date}_corrected.txt`);
        if (exists(source) && mtimeMs(source) > mtimeMs(prompt)) {
          return {status: 'stale', detail: 'Corrected briefing text changed after the prompt was generated.'};
        }
        return {status: 'done', detail: 'codex-briefing-prompt.md is ready.'};
      }
    },

    {
      id: 'codex-afk',
      title: '3. Fill analysis JSONs with Codex AFK',
      description:
        'Runs codex exec with the generated prompt to fill the five analysis JSONs, then validates them. Long-running and blocking.',
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Run Codex AFK + validate',
          commands: () => [
            {
              cmd: 'codex',
              args: [
                'exec',
                '--cd',
                ctx.repoRoot,
                '--sandbox',
                'workspace-write',
                '--skip-git-repo-check',
                '--output-last-message',
                path.join(ctx.output, 'codex-afk-final-message.md'),
                '-'
              ],
              stdinFile: path.join(ctx.output, 'codex-briefing-prompt.md')
            },
            {cmd: 'node', args: ['./scripts/validate-briefing-analysis-files.mjs', '--folder', folder]}
          ]
        },
        {
          id: 'validate',
          label: 'Validate only',
          commands: () => [{cmd: 'node', args: ['./scripts/validate-briefing-analysis-files.mjs', '--folder', folder]}]
        }
      ],
      artifacts: () => [
        ...ANALYSIS_FILES.map((name) => ({label: name, file: path.join(ctx.folder, name)})),
        {label: 'Codex final message', file: path.join(ctx.output, 'codex-afk-final-message.md')}
      ],
      status: (stepState) => {
        const missing = ANALYSIS_FILES.filter((name) => !exists(path.join(ctx.folder, name)));
        if (missing.length) return fromLastRun(stepState, `Missing: ${missing.join(', ')}`);
        if (stepState?.status === 'failed') return {status: 'failed', detail: 'Last Codex/validation run failed — review the log.'};
        if (stepState?.status === 'success') return {status: 'done', detail: 'Analysis files present and validated.'};
        return {status: 'done', detail: 'Analysis files present (use "Validate only" to re-check them).'};
      }
    },

    {
      id: 'image-prompt',
      title: '4. Generate closing summary image prompt',
      description: 'Writes the *summary-image.md prompt used for manual image generation in Codex/ChatGPT.',
      kind: 'run',
      actions: [{id: 'run', label: 'Generate prompt', commands: () => [npmRun('briefing:image:prompt', '--folder', folder)]}],
      artifacts: () => {
        const prompt = findSummaryImagePrompt(ctx.output);
        return [{label: 'Summary image prompt', file: prompt || path.join(ctx.output, '<date>-summary-image.md')}];
      },
      status: (stepState) => {
        const prompt = findSummaryImagePrompt(ctx.output);
        if (!prompt) return fromLastRun(stepState, 'Prompt not generated yet.');
        const visualScript = path.join(ctx.folder, 'visual-script.json');
        if (exists(visualScript) && mtimeMs(visualScript) > mtimeMs(prompt)) {
          return {status: 'stale', detail: 'visual-script.json changed after the image prompt was generated.'};
        }
        return {status: 'done', detail: path.basename(prompt)};
      }
    },

    {
      id: 'image-save',
      title: '5. Save the generated closing image (manual)',
      description:
        'Run the summary image prompt manually in Codex/ChatGPT and save the result exactly as output/final_summary_generated.png. The build wires it into scene-11.',
      kind: 'verify',
      actions: [
        {
          id: 'check',
          label: 'Verify image',
          commands: () => [
            {
              label: 'Closing image verification',
              fn: async (emit) => {
                const image = path.join(ctx.output, 'final_summary_generated.png');
                if (!exists(image)) throw new Error('output/final_summary_generated.png is missing.');
                emit(`Found: ${image}`);
                const prompt = findSummaryImagePrompt(ctx.output);
                if (prompt && mtimeMs(image) < mtimeMs(prompt)) {
                  emit('WARNING: the image is older than the latest summary-image prompt. Regenerate it if the prompt changed.');
                }
                emit('Closing image is in place.');
              }
            }
          ]
        }
      ],
      artifacts: () => [{label: 'final_summary_generated.png', file: path.join(ctx.output, 'final_summary_generated.png')}],
      status: () => {
        const image = path.join(ctx.output, 'final_summary_generated.png');
        if (!exists(image)) return {status: 'pending', detail: 'Save the generated image into output/.'};
        const prompt = findSummaryImagePrompt(ctx.output);
        if (prompt && mtimeMs(image) < mtimeMs(prompt)) {
          return {status: 'stale', detail: 'Image is older than the latest summary-image prompt.'};
        }
        return {status: 'done', detail: 'Closing image present.'};
      }
    },

    {
      id: 'first-build',
      title: '6. Build first draft outputs',
      description:
        'Merges daily sources into output/ (briefing.json, timing-config.json, the four format HTMLs plus the captions/stamps hook variants) and moves stale closing audio aside if the scene-11 text changed.',
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Build folder',
          commands: () => [
            npmRun('briefing:build:folder', '--folder', folder),
            {
              label: 'Stale closing-audio check',
              fn: async (emit) => {
                const moved = moveStaleClosingAudioIfNeeded(ctx, emit);
                if (!moved) emit('Closing-scene audio matches the current briefing text (or no audio yet).');
              }
            }
          ]
        }
      ],
      artifacts: () => [
        {label: 'briefing.json', file: path.join(ctx.output, 'briefing.json')},
        {label: 'timing-config.json', file: path.join(ctx.output, 'timing-config.json')},
        ...htmlFiles.map((name) => ({label: name, file: path.join(ctx.output, name)}))
      ],
      status: (stepState) => {
        const briefing = path.join(ctx.output, 'briefing.json');
        if (!exists(briefing)) return fromLastRun(stepState, 'Not built yet.');
        const newerSource = ANALYSIS_FILES.map((name) => path.join(ctx.folder, name)).find(
          (file) => exists(file) && mtimeMs(file) > mtimeMs(briefing)
        );
        if (newerSource) {
          return {status: 'stale', detail: `${path.basename(newerSource)} changed after the last build.`};
        }
        return {status: 'done', detail: 'Outputs built.'};
      }
    },

    {
      id: 'audio-generate',
      title: '7. Generate briefing narration audio',
      description:
        'In AI mode, generates Hamsa WAVs for every scene plus closing and outro (existing WAVs are reused; only missing ones ' +
        'are generated). In Human mode, only refreshes the manifest from existing WAVs (no Hamsa calls) — record each scene in ' +
        'the "Scene narration audio" panel below. Set the AI/Human default and edit the exact narration text in that panel BEFORE generating.',
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Generate audio',
          commands: () => {
            const human = loadAudioSource(ctx) === 'human';
            return [npmRun('audio:outlets', '--folder', folder, ...(human ? ['--existing-only'] : []))];
          }
        },
        {
          id: 'existing-only',
          label: 'Refresh manifest from existing WAVs',
          commands: () => [npmRun('audio:outlets', '--folder', folder, '--existing-only')]
        }
      ],
      artifacts: () => [
        {label: 'audio/manifest.json', file: path.join(ctx.audioDir, 'manifest.json')},
        {label: 'audio/text-overrides.json (optional script edits)', file: path.join(ctx.audioDir, 'text-overrides.json'), optional: true}
      ],
      status: (stepState) => {
        const manifest = readJsonSafe(path.join(ctx.audioDir, 'manifest.json'));
        if (!manifest) return fromLastRun(stepState, 'No audio manifest yet. Review the narration script below first.');
        const entries = manifest.entries || [];
        const missing = entries.filter(
          (entry) => entry.text && (!entry.audioPath || !exists(path.resolve(ctx.repoRoot, entry.audioPath)))
        );
        if (missing.length) {
          return {status: 'attention', detail: `${missing.length} manifest entr${missing.length === 1 ? 'y' : 'ies'} missing WAV files.`};
        }
        const mismatched = audioEntries(ctx, {audio: {}}).filter((entry) => entry.textMismatch);
        if (mismatched.length) {
          return {
            status: 'stale',
            detail: `${mismatched.length} scene WAV${mismatched.length === 1 ? '' : 's'} differ from the current script text (${mismatched
              .map((entry) => entry.sceneId)
              .join(', ')}) — regenerate them below.`
          };
        }
        return {status: 'done', detail: `${entries.length} narration tracks ready.`};
      }
    },

    {
      id: 'timing-sync',
      title: '8. Sync audio timings and rebuild',
      description:
        'Copies WAV durations (+0.5s buffer) into timing-config.json, then rebuilds all outputs with audio-informed timing.',
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Sync + rebuild',
          commands: () => [
            {cmd: 'node', args: ['./scripts/sync-outlet-audio-timing.mjs', '--folder', folder]},
            npmRun('briefing:build:folder', '--folder', folder)
          ]
        }
      ],
      artifacts: () => [
        {label: 'timing-config.json', file: path.join(ctx.output, 'timing-config.json')},
        {label: 'briefing.json', file: path.join(ctx.output, 'briefing.json')}
      ],
      status: (stepState) => {
        const timing = path.join(ctx.output, 'timing-config.json');
        const manifest = path.join(ctx.audioDir, 'manifest.json');
        if (!exists(timing) || !exists(manifest)) return fromLastRun(stepState, 'Needs audio manifest and a first build.');
        if (mtimeMs(manifest) > mtimeMs(path.join(ctx.output, 'briefing.json'))) {
          return {status: 'stale', detail: 'Audio manifest is newer than the last build — re-sync timings.'};
        }
        if (stepState?.status === 'failed') return {status: 'failed', detail: 'Last sync failed.'};
        return {status: 'done', detail: 'Build is newer than the audio manifest — timings are in.'};
      }
    },

    {
      id: 'html-review',
      title: '9. Review HTML outputs (manual)',
      description:
        'Open the generated HTMLs (four formats + captions/stamps hook variants) and check intro timing, tickers, date pill, overflow, screenshots, audio coverage. Mark reviewed when satisfied.',
      kind: 'manual',
      actions: [],
      artifacts: () => htmlFiles.map((name) => ({label: name, file: path.join(ctx.output, name), open: true})),
      status: (stepState, state) => {
        const review = state.reviews?.['html-review'];
        if (!review?.done) return {status: 'pending', detail: 'Not reviewed yet.'};
        const briefingMtime = mtimeMs(path.join(ctx.output, 'briefing.json'));
        if (review.at && briefingMtime > Date.parse(review.at)) {
          return {status: 'stale', detail: 'Outputs were rebuilt after the last review.'};
        }
        return {status: 'done', detail: `Reviewed ${review.at}`};
      }
    },

    {
      id: 'final-rebuild',
      title: '10. Final rebuild before render',
      description: 'Final briefing:build:folder pass, then prints the duration summary for every format.',
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Final rebuild',
          commands: () => [
            npmRun('briefing:build:folder', '--folder', folder),
            {
              label: 'Duration summary',
              fn: async (emit) => {
                for (const line of outputDurationSummaryLines(ctx.output)) emit(line);
              }
            }
          ]
        }
      ],
      artifacts: () => [{label: 'briefing.json', file: path.join(ctx.output, 'briefing.json')}],
      status: (stepState) => {
        if (!stepState) return {status: 'pending'};
        const base = fromLastRun(stepState);
        if (base.status !== 'done') return base;
        return staleIfBriefingNewer(ctx, base, finishedAtMsOf(stepState));
      }
    },

    {
      id: 'server-sync',
      title: '11. Sync briefing folder to render server',
      description: `rsync of ${folder}/ to ${SSH_HOST}:${REMOTE_ROOT}/briefings/${ctx.date}/ over ssh port ${SSH_PORT}.`,
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Sync to server',
          commands: () => [
            {cmd: 'ssh', args: sshArgs(`mkdir -p ${REMOTE_ROOT}/briefings/${ctx.date}`)},
            {
              cmd: 'rsync',
              args: ['-av', '-e', `ssh -p ${SSH_PORT}`, `${folder}/`, `${SSH_HOST}:${REMOTE_ROOT}/briefings/${ctx.date}/`]
            }
          ]
        }
      ],
      artifacts: () => [],
      status: (stepState) => {
        if (!stepState) return {status: 'pending', detail: 'Not synced yet.'};
        const base = fromLastRun(stepState);
        if (base.status !== 'done') return base;
        return staleIfBriefingNewer(ctx, base, finishedAtMsOf(stepState));
      }
    },

    {
      id: 'server-render',
      title: '12. Render muted MP4 on server',
      description:
        'Pulls the latest repo on the render server, then runs the muted Remotion render over ssh once per selected variant (normal, hook-captions, hook-stamps). Long-running (~minutes per variant); frames are ~99% of the time.',
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Render on server (muted)',
          options: {
            id: 'variants',
            label: 'Variants to render',
            type: 'multi',
            choices: [
              {value: 'default', label: 'Normal briefing'},
              {value: 'captions', label: 'Hook: captions + focus boxes'},
              {value: 'stamps', label: 'Hook: quote stamps + chips'}
            ],
            defaultSelected: ['default']
          },
          commands: (options) => {
            const allowed = ['default', 'captions', 'stamps'];
            const requested = Array.isArray(options?.variants) ? options.variants : [];
            const variants = allowed.filter((variant) => requested.includes(variant));
            if (!variants.length) variants.push('default');
            return [
              {cmd: 'ssh', args: sshArgs(`cd ${REMOTE_ROOT} && git pull origin main`)},
              ...variants.map((variant) => ({
                cmd: 'ssh',
                args: sshArgs(
                  `cd ${REMOTE_ROOT} && npm run briefing:render:mp4 -- --folder briefings/${ctx.date} --muted` +
                    (variant === 'default' ? '' : ` --variant ${variant}`) +
                    ' --log warn'
                )
              }))
            ];
          }
        }
      ],
      artifacts: () => [],
      status: (stepState) => {
        if (!stepState) return {status: 'pending', detail: 'Not rendered yet (or rendered outside the dashboard).'};
        const base = fromLastRun(stepState);
        if (base.status !== 'done') return base;
        return staleIfBriefingNewer(ctx, base, finishedAtMsOf(stepState));
      }
    },

    {
      id: 'server-mux',
      title: '13. Mux narration audio on server',
      description:
        'Attaches narration WAVs to the muted render(s) on the server (video stream copied, finishes in seconds). Hook-variant renders found on the server are muxed too.',
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Mux on server',
          commands: () => {
            const outputBase = `briefings/${ctx.date}/output/radar-beirut-briefing`;
            const muxScript =
              `cd ${REMOTE_ROOT} && status=0; found=0; ` +
              `if [ -f "${outputBase}.mp4" ]; then found=1; npm run briefing:mux:audio -- --folder briefings/${ctx.date} || status=1; fi; ` +
              'for variant in hook-captions hook-stamps; do ' +
              `file="${outputBase}-$variant.mp4"; ` +
              `if [ -f "$file" ]; then found=1; npm run briefing:mux:audio -- --folder briefings/${ctx.date} --input "$file" || status=1; fi; ` +
              'done; ' +
              'if [ "$found" = 0 ]; then echo "No muted renders found on the server — run step 12 first."; status=1; fi; ' +
              'exit $status';
            return [{cmd: 'ssh', args: sshArgs(muxScript)}];
          }
        },
        {
          id: 'local',
          label: 'Mux locally (needs local muted MP4)',
          commands: () => [npmRun('briefing:mux:audio', '--folder', folder)]
        }
      ],
      artifacts: () => [{label: 'Local muted MP4 (only for local mux)', file: mutedMp4, optional: true}],
      status: (stepState) => {
        if (exists(finalMp4)) return {status: 'done', detail: 'Final MP4 with audio exists locally.'};
        return fromLastRun(stepState, 'Not muxed yet.');
      }
    },

    {
      id: 'download-final',
      title: '14. Download final MP4 from server',
      description: 'rsync of the muxed *-final.mp4 files (normal + any hook variants) back into the local output folder.',
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Download final MP4s',
          commands: () => [
            {
              cmd: 'rsync',
              args: [
                '-av',
                '-e',
                `ssh -p ${SSH_PORT}`,
                `${SSH_HOST}:${REMOTE_ROOT}/briefings/${ctx.date}/output/radar-beirut-briefing*-final.mp4`,
                `${out}/`
              ]
            }
          ]
        }
      ],
      artifacts: () => [
        {label: 'radar-beirut-briefing-final.mp4', file: finalMp4, open: true},
        {
          label: 'radar-beirut-briefing-hook-captions-final.mp4',
          file: path.join(ctx.output, 'radar-beirut-briefing-hook-captions-final.mp4'),
          open: true,
          optional: true
        },
        {
          label: 'radar-beirut-briefing-hook-stamps-final.mp4',
          file: path.join(ctx.output, 'radar-beirut-briefing-hook-stamps-final.mp4'),
          open: true,
          optional: true
        }
      ],
      status: () => {
        if (!exists(finalMp4)) return {status: 'pending', detail: 'Final MP4 not downloaded yet.'};
        if (mtimeMs(path.join(ctx.output, 'briefing.json')) > mtimeMs(finalMp4)) {
          return {status: 'stale', detail: 'briefing.json is newer than the final video — it may be from an earlier build.'};
        }
        return {status: 'done', detail: 'Final MP4 with narration is here.'};
      }
    },

    {
      id: 'split-scenes',
      title: '15. Split final MP4 into scene videos (optional)',
      description:
        'Optional — run only if you need per-scene clips. No other step depends on it (step 16 runs without it). ' +
        'Cuts each downloaded final MP4 into per-scene clips (intro+scene-1, middles, penultimate+outro). ' +
        'Pick which variants to split — each lands in its own scene-videos[-hook-*]/ folder.',
      kind: 'run',
      locked: splitVariants.length === 0,
      lockReason: 'Locked — download at least one final MP4 first (step 14).',
      actions: [
        {
          id: 'run',
          label: 'Split scenes',
          options:
            splitVariants.length > 1
              ? {
                  id: 'variants',
                  label: 'Final MP4s to split',
                  type: 'multi',
                  choices: splitVariants.map((variant) => ({value: variant.value, label: variant.label})),
                  defaultSelected: splitVariants.map((variant) => variant.value)
                }
              : undefined,
          commands: (options) => {
            if (!splitVariants.length) {
              // Nothing downloaded yet — fall back to the normal final MP4 path so the
              // command still fails loudly with the script's "missing MP4" message.
              return [
                npmRun(
                  'briefing:split:mp4',
                  '--folder',
                  folder,
                  '--input',
                  `${out}/radar-beirut-briefing-final.mp4`,
                  '--output-dir',
                  `${out}/scene-videos`
                )
              ];
            }
            const requested = Array.isArray(options?.variants) ? options.variants : [];
            const selected = requested.length
              ? splitVariants.filter((variant) => requested.includes(variant.value))
              : splitVariants;
            return (selected.length ? selected : splitVariants).map((variant) =>
              npmRun(
                'briefing:split:mp4',
                '--folder',
                folder,
                '--input',
                variant.inputRel,
                '--output-dir',
                variant.outputDirRel
              )
            );
          }
        }
      ],
      artifacts: () =>
        splitVariants.length
          ? splitVariants.map((variant) => ({
              label: `${path.basename(variant.outputDir)}/ (${variant.label})`,
              file: variant.outputDir
            }))
          : [{label: 'scene-videos/', file: path.join(ctx.output, 'scene-videos')}],
      status: (stepState) => {
        const dirs = (splitVariants.length
          ? splitVariants.map((variant) => variant.outputDir)
          : [path.join(ctx.output, 'scene-videos')]
        ).filter(exists);
        if (!dirs.length) {
          if (splitVariants.length) {
            return {status: 'attention', detail: 'Final MP4 downloaded — choose which variant(s) to split.'};
          }
          return fromLastRun(stepState, 'Download a final MP4 first.');
        }
        let totalClips = 0;
        let newestClip = 0;
        for (const dir of dirs) {
          const clips = fs.readdirSync(dir).filter((name) => name.endsWith('.mp4'));
          totalClips += clips.length;
          for (const name of clips) newestClip = Math.max(newestClip, mtimeMs(path.join(dir, name)));
        }
        if (!totalClips) return fromLastRun(stepState, 'scene-videos/ is empty.');
        const newestFinal = Math.max(0, ...splitVariants.map((variant) => mtimeMs(variant.input)));
        if (newestFinal > newestClip) {
          return {status: 'stale', detail: 'A final MP4 is newer than its split clips — re-split.'};
        }
        const variantNote = dirs.length > 1 ? ` across ${dirs.length} variants` : '';
        return {status: 'done', detail: `${totalClips} scene clips${variantNote}.`};
      }
    },

    {
      id: 'social-package',
      title: duelMode ? '16. Generate Quote Duel social captions' : '16. Generate social captions',
      description: duelMode
        ? 'Writes and validates output/quote-duel-social-captions.json for the Quote Duel full/per-clash videos. This is independent from the main briefing full-video render.'
        : 'Generates the main full-video publishing text: YouTube title, description, hashtags, and thumbnail prompt. This can run as soon as a final MP4 is downloaded.',
      kind: 'run',
      locked: duelMode ? !duelSocialReady : splitVariants.length === 0,
      lockReason: duelMode
        ? 'Locked — build Quote Duel content and narration first (steps 18-19).'
        : 'Locked — download at least one final MP4 first (step 14).',
      actions: duelMode ? [
        {
          id: 'generate',
          label: 'Generate duel social captions (Codex)',
          commands: () => [
            npmRun('briefing:duel:captions', '--folder', folder),
            {
              cmd: 'codex',
              args: [
                'exec',
                '--cd',
                ctx.repoRoot,
                '--sandbox',
                'workspace-write',
                '--skip-git-repo-check',
                '--output-last-message',
                path.join(ctx.output, 'quote-duel-social-captions-codex-message.md'),
                '-'
              ],
              stdinFile: path.join(ctx.output, 'quote-duel-social-captions-prompt.md')
            },
            npmRun('briefing:duel:social:validate', '--folder', folder)
          ]
        },
        {
          id: 'validate',
          label: 'Validate duel captions only',
          commands: () => [npmRun('briefing:duel:social:validate', '--folder', folder)]
        }
      ] : [
        {
          id: 'generate',
          label: 'Generate social captions (Codex)',
          commands: () => [
            npmRun('briefing:social:prompt', '--folder', folder),
            {
              cmd: 'codex',
              args: [
                'exec',
                '--cd',
                ctx.repoRoot,
                '--sandbox',
                'workspace-write',
                '--skip-git-repo-check',
                '--output-last-message',
                path.join(ctx.output, 'social-captions-codex-message.md'),
                '-'
              ],
              stdinFile: path.join(ctx.output, 'social-captions-prompt.md')
            },
            npmRun('briefing:social:validate', '--folder', folder),
            npmRun('briefing:social:thumbnail-prompt', '--folder', folder)
          ]
        },
        {
          id: 'validate',
          label: 'Validate captions only',
          commands: () => [
            npmRun('briefing:social:validate', '--folder', folder),
            npmRun('briefing:social:thumbnail-prompt', '--folder', folder)
          ]
        }
      ],
      artifacts: () => {
        if (duelMode) {
          return [
            {label: 'output/quote-duel-social-captions.json', file: duelSocialCaptions, optional: true},
            {label: 'output/quote-duel-social-captions-prompt.md', file: path.join(ctx.output, 'quote-duel-social-captions-prompt.md'), optional: true},
            {label: 'output/quote-duel-social-captions-codex-message.md', file: path.join(ctx.output, 'quote-duel-social-captions-codex-message.md'), optional: true}
          ];
        }
        return [
          {label: 'social-captions.json (editable)', file: socialCaptions, optional: true},
          {label: 'social-captions-prompt.md', file: path.join(ctx.output, 'social-captions-prompt.md'), optional: true},
          {label: 'youtube-thumbnail-prompt.md', file: youtubeThumbnailPrompt, optional: true}
        ];
      },
      status: (stepState) => {
        if (duelMode) {
          if (!exists(duelSocialCaptions)) {
            if (duelSocialReady) {
              return {status: 'attention', detail: 'Quote Duel narration is ready — generate duel social captions when ready.'};
            }
            return fromLastRun(stepState, 'Build Quote Duel content and narration first.');
          }
          const captionsMtime = mtimeMs(duelSocialCaptions);
          const newestDuelInput = Math.max(
            mtimeMs(quoteDuelJson),
            mtimeMs(duelManifest),
            mtimeMs(path.join(REPO_ROOT, 'audio', 'hooks', 'manifest.json'))
          );
          if (newestDuelInput > captionsMtime + 5000) {
            return {status: 'stale', detail: 'Quote Duel JSON, narration audio, or hook manifest changed after captions were generated.'};
          }
          return {status: 'done', detail: 'Quote Duel social captions are ready.'};
        }
        if (!exists(socialCaptions)) {
          if (splitVariants.length) {
            return {status: 'attention', detail: 'Final MP4 downloaded — generate social captions when ready.'};
          }
          return fromLastRun(stepState, 'Download a final MP4 first.');
        }
        if (!exists(youtubeThumbnailPrompt)) {
          return {status: 'attention', detail: 'Captions ready — run Validate captions only to write the YouTube thumbnail prompt.'};
        }
        if (mtimeMs(socialCaptions) > mtimeMs(youtubeThumbnailPrompt)) {
          return {status: 'stale', detail: 'social-captions.json changed after the YouTube thumbnail prompt — validate to refresh it.'};
        }
        return staleIfBriefingNewer(ctx, {status: 'done', detail: 'Social captions, YouTube description, and thumbnail prompt are ready.'}, mtimeMs(socialCaptions));
      }
    },

    {
      id: 'duel-hooks',
      title: '17. Quote Duel: generate hooks (shared — all dates)',
      description:
        `Static, all-dates step (run once, or when a hook or ending line is added/changed): synthesizes the shared attention-hook WAVs and the shared ending WAV into audio/hooks/ via Hamsa (reused after the first run) and records the speaker in audio/hooks/manifest.json. Defaults to Marwan unless HAMSA_TTS_SPEAKER or HAMSA_TTS_SPEAKERS specifies a different speaker. Step 19 uses that same speaker for every duel narration. Listen to each below. The hooks and ending are the same across every date and duel; edit DEFAULT_DUEL_HOOKS or DEFAULT_DUEL_OUTRO_AUDIO in scripts/lib/duel-hooks.mjs to change them. Pushing them to the server is the separate step 18. In use for render: ${DUEL_HOOK}.`,
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Generate missing hooks (local)',
          commands: () => [npmRun('briefing:duel:hooks')]
        },
        {
          id: 'force',
          label: 'Regenerate all hooks (--force, local)',
          commands: () => [npmRun('briefing:duel:hooks', '--force')]
        }
      ],
      artifacts: () => [
        // One playable artifact per hook so you can listen to all existing hooks here.
        ...DEFAULT_DUEL_HOOKS.map((h) => ({
          label: `${h.id}${h.id === DEFAULT_HOOK_ID ? ' • selected' : ''} — ${h.text}`,
          file: path.join(REPO_ROOT, 'audio', 'hooks', `${h.id}.wav`),
          audio: true,
          optional: true
        })),
        {
          label: `ending — ${DEFAULT_DUEL_OUTRO_AUDIO.text}`,
          file: path.join(REPO_ROOT, 'audio', 'hooks', DEFAULT_DUEL_OUTRO_AUDIO.file),
          audio: true,
          optional: true
        },
        {label: 'audio/hooks/manifest.json', file: path.join(REPO_ROOT, 'audio', 'hooks', 'manifest.json'), optional: true}
      ],
      status: (stepState) => {
        const sharedManifest = path.join(REPO_ROOT, 'audio', 'hooks', 'manifest.json');
        if (!exists(sharedManifest)) return {status: 'pending', detail: 'Shared hooks not generated yet.'};
        return fromLastRun(stepState, 'Shared hooks exist; regenerate only when a hook changes.');
      }
    },

    {
      id: 'duel-text',
      title: '18. Quote Duel: build duel content',
      description:
        'Local only. Builds output/quote-duel.json and loads each clash\'s spoken narration. When this succeeds, the narration review section appears inside step 19.',
      kind: 'run',
      actions: [
        {id: 'run', label: 'Build duel content + load narration (local)', commands: () => [npmRun('briefing:duel:build', '--folder', folder)]}
      ],
      artifacts: () => [
        ...quoteDuelHtmlArtifacts(ctx),
        {label: 'output/quote-duel.json', file: path.join(ctx.output, 'quote-duel.json'), optional: true},
        {label: 'audio/quote-duel-text-overrides.json (per-clash script edits)', file: path.join(ctx.folder, 'audio', 'quote-duel-text-overrides.json'), optional: true}
      ],
      status: (stepState) => {
        if (!exists(path.join(ctx.output, 'quote-duel.json'))) return fromLastRun(stepState, 'Duel content not built yet.');
        const confirmedAt = (loadState(ctx).duel || {}).narrationConfirmedAt;
        if (!confirmedAt) return {status: 'attention', detail: 'Duel content loaded — review and confirm narration in step 19.'};
        return {status: 'done', detail: 'Narration confirmed — generate audio (step 19).'};
      }
    },

    {
      id: 'duel-audio',
      title: '19. Quote Duel: generate narration audio',
      description:
        'Local only. Review and confirm the loaded duel narration here, then synthesize per-duel WAVs via Hamsa from the confirmed text. Defaults to Marwan unless HAMSA_TTS_SPEAKER or HAMSA_TTS_SPEAKERS specifies a different speaker. Rebuild/check the HTML separately in step 20.',
      kind: 'run',
      actions: [
        {id: 'run', label: 'Generate missing/stale duel narration (local)', commands: () => [npmRun('briefing:duel:audio', '--folder', folder)]},
        {id: 'force', label: 'Regenerate all duel narration (--force)', commands: () => [npmRun('briefing:duel:audio', '--folder', folder, '--force')]},
        {id: 'existing-only', label: 'Refresh durations from existing WAVs (no Hamsa)', commands: () => [npmRun('briefing:duel:audio', '--folder', folder, '--existing-only')]}
      ],
      artifacts: () => [
        {label: 'audio/quote-duel-manifest.json', file: duelManifest},
        {label: 'output/quote-duel-audio-script.json', file: path.join(ctx.output, 'quote-duel-audio-script.json'), optional: true}
      ],
      status: (stepState) => {
        const confirmedAt = (loadState(ctx).duel || {}).narrationConfirmedAt;
        if (!confirmedAt) return {status: 'pending', detail: 'Confirm narration first in this step.'};
        if (!exists(duelManifest)) return fromLastRun(stepState, 'Duel narration not generated yet.');
        return fromLastRun(stepState, 'Duel narration ready — check the HTML (step 20).');
      }
    },

    {
      id: 'duel-html',
      title: '20. Quote Duel: build & check HTML',
      description:
        'Local only. Rebuilds the Quote Duel review HTML from the current durations and opens it so you can verify audio + visual + hook together before any server contact.',
      kind: 'run',
      actions: [
        {id: 'run', label: 'Rebuild + open review HTML (local)', commands: () => [npmRun('briefing:duel:build', '--folder', folder)]}
      ],
      artifacts: () => quoteDuelHtmlArtifacts(ctx),
      status: (stepState) => {
        if (!exists(path.join(ctx.output, 'radar-beirut-quote-duel.html'))) return fromLastRun(stepState, 'HTML not built yet.');
        if (exists(duelManifest) && mtimeMs(duelManifest) > mtimeMs(path.join(ctx.output, 'radar-beirut-quote-duel.html'))) {
          return {status: 'stale', detail: 'Audio changed after the HTML — rebuild.'};
        }
        return fromLastRun(stepState, 'HTML ready — verify, then sync hooks (step 21).');
      }
    },

    {
      id: 'duel-hooks-sync',
      title: '21. Quote Duel: sync hooks to server (once)',
      description:
        `One-time push of the shared audio/hooks/ to ${SSH_HOST}. rsync only transfers changes, so it is safe to re-run, but you only need it once (or after regenerating a hook in step 17). Shows "done" until the hooks change.`,
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Sync hooks to server',
          commands: () => [
            {cmd: 'ssh', args: sshArgs(`mkdir -p ${REMOTE_ROOT}/audio/hooks`)},
            {
              cmd: 'rsync',
              args: ['-av', '-e', `ssh -p ${SSH_PORT}`, 'audio/hooks/', `${SSH_HOST}:${REMOTE_ROOT}/audio/hooks/`]
            }
          ]
        }
      ],
      artifacts: () => [],
      status: (stepState) => {
        const sharedManifest = path.join(REPO_ROOT, 'audio', 'hooks', 'manifest.json');
        if (!exists(sharedManifest)) return {status: 'pending', detail: 'Generate the hooks first (step 17).'};
        if (!stepState || stepState.status !== 'success') return {status: 'pending', detail: 'Hooks not synced to the server yet.'};
        const syncedAt = finishedAtMsOf(stepState);
        if (mtimeMs(sharedManifest) > syncedAt + 5000) {
          return {status: 'stale', detail: 'Hooks changed after the last sync — re-sync.'};
        }
        return {status: 'done', detail: `Synced ${stepState.finishedAt || ''}`.trim()};
      }
    },

    {
      id: 'duel-server-render',
      title: '22. Quote Duel: sync + render on server (muted)',
      description:
        `Syncs only the selected Quote Duel render inputs for briefings/${ctx.date}/ to ${SSH_HOST}, then renders one muted Remotion MP4 per selected clash with --hook ${DUEL_HOOK}. Shared hook WAVs must be synced once via step 21.`,
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Sync selected duels + render on server (muted)',
          options:
            duelRenderChoices.length > 0
              ? {
                  id: 'duels',
                  label: 'Duels to render',
                  type: 'multi',
                  choices: duelRenderChoices.map((choice) => ({value: choice.value, label: choice.label})),
                  defaultSelected: duelRenderChoices.map((choice) => choice.value)
                }
              : undefined,
          commands: (options) => {
            const selected = safeDuelChoices(ctx, options?.duels);
            const includeAudioFiles = selected.flatMap((choice) => ['--include', `/audio/${choice.audioFile}`]);
            return [
              {cmd: 'ssh', args: sshArgs(`mkdir -p ${REMOTE_ROOT}/briefings/${ctx.date}`)},
              {
                cmd: 'rsync',
                args: [
                  '-av',
                  '-e',
                  `ssh -p ${SSH_PORT}`,
                  '--include=/audio/',
                  ...includeAudioFiles,
                  '--include=/audio/quote-duel-manifest.json',
                  '--include=/output/',
                  '--include=/output/quote-duel.json',
                  '--exclude=*',
                  `${folder}/`,
                  `${SSH_HOST}:${REMOTE_ROOT}/briefings/${ctx.date}/`
                ]
              },
              {cmd: 'ssh', args: sshArgs(`cd ${REMOTE_ROOT} && git pull origin main`)},
              quoteDuelServerCodeSync(),
              ...selected.map((choice) => ({
                cmd: 'ssh',
                args: sshArgs(
                  `cd ${REMOTE_ROOT} && npm run briefing:duel:render -- --folder briefings/${ctx.date} --muted --hook ${DUEL_HOOK} --duel ${choice.value} --log warn`
                )
              }))
            ];
          }
        }
      ],
      artifacts: () => [],
      status: (stepState) => {
        if (!stepState) return {status: 'pending', detail: 'Not rendered yet (or rendered outside the dashboard).'};
        const base = fromLastRun(stepState);
        if (base.status !== 'done') return base;
        return staleIfDuelInputsNewer(ctx, base, finishedAtMsOf(stepState));
      }
    },

    {
      id: 'duel-server-mux',
      title: '23. Quote Duel: mux audio on server',
      description:
        `Attaches narration, the ${DUEL_HOOK} hook WAV, and the shared ending to every muted per-duel render found on the server → output/duel-videos-${DUEL_HOOK}/duel-NN.mp4.`,
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Mux rendered duel videos on server',
          commands: () => {
            const mutedDir = `briefings/${ctx.date}/output/duel-videos-${DUEL_HOOK}/muted`;
            const finalDir = `briefings/${ctx.date}/output/duel-videos-${DUEL_HOOK}`;
            const script = [
              `cd ${REMOTE_ROOT}`,
              `mkdir -p ${shellQuote(finalDir)}`,
              'found=0',
              `for f in ${shellQuote(mutedDir)}/duel-*.mp4; do`,
              '  [ -e "$f" ] || continue',
              '  found=1',
              '  base=$(basename "$f" .mp4)',
              '  n=${base#duel-}',
              '  id="duel-${n#0}"',
              `  npm run briefing:duel:mux:audio -- --folder ${shellQuote(`briefings/${ctx.date}`)} --hook ${shellQuote(DUEL_HOOK)} --duel "$id" --input "$f" --output "${finalDir}/$base.mp4"`,
              'done',
              'if [ "$found" = 0 ]; then echo "No muted per-duel renders found on the server - run step 22 first."; exit 1; fi'
            ].join('\n');
            return [
              quoteDuelServerCodeSync(),
              {cmd: 'ssh', args: sshArgs(script)}
            ];
          }
        }
      ],
      artifacts: () => [],
      status: (stepState) => {
        return fromLastRun(stepState, 'Not muxed yet.');
      }
    },

    {
      id: 'duel-download',
      title: '24. Quote Duel: download videos from server',
      description: `Downloads only the final server-rendered per-duel MP4s and manifest from ${SSH_HOST}: output/duel-videos-${DUEL_HOOK}/. Muted render intermediates are left on the server.`,
      kind: 'run',
      actions: [
        {
          id: 'run',
          label: 'Download rendered duel videos',
          commands: () => [
            {
              cmd: 'rsync',
              args: [
                '-av',
                '-e',
                `ssh -p ${SSH_PORT}`,
                '--exclude=muted/',
                `${SSH_HOST}:${REMOTE_ROOT}/briefings/${ctx.date}/output/duel-videos-${DUEL_HOOK}/`,
                `${out}/duel-videos-${DUEL_HOOK}/`
              ]
            }
          ]
        }
      ],
      artifacts: () => quoteDuelVideoArtifacts(ctx, DUEL_HOOK),
      status: () => {
        if (!exists(duelClipManifest)) return {status: 'pending', detail: 'Rendered duel videos not downloaded yet.'};
        return {status: 'done', detail: 'Server-rendered per-duel videos are here.'};
      }
    },

    {
      id: 'duel-social-prompts',
      title: '25. Quote Duel: social text + reel cover prompts',
      description:
        'Generates one platform-neutral publishing text block and one full 9:16 social media reel/short cover prompt for each duel. These prompts are for Reels, Shorts, TikTok, and similar vertical social video feeds.',
      kind: 'run',
      locked: !exists(quoteDuelJson),
      lockReason: 'Locked - build Quote Duel content first (step 18).',
      actions: [
        {
          id: 'generate',
          label: 'Generate per-duel text + cover prompts (Codex)',
          commands: () => [
            npmRun('briefing:duel:social-prompts', '--folder', folder),
            {
              cmd: 'codex',
              args: [
                'exec',
                '--cd',
                ctx.repoRoot,
                '--sandbox',
                'workspace-write',
                '--skip-git-repo-check',
                '--output-last-message',
                path.join(ctx.output, 'quote-duel-social-prompts-codex-message.md'),
                '-'
              ],
              stdinFile: path.join(ctx.output, 'quote-duel-social-prompts-prompt.md')
            },
            npmRun('briefing:duel:social-prompts:validate', '--folder', folder)
          ]
        },
        {
          id: 'validate',
          label: 'Validate prompts only',
          commands: () => [npmRun('briefing:duel:social-prompts:validate', '--folder', folder)]
        }
      ],
      artifacts: () => [
        {label: 'output/quote-duel-social-prompts.json', file: duelSocialPrompts, optional: true},
        {label: 'output/quote-duel-social-prompts-prompt.md', file: path.join(ctx.output, 'quote-duel-social-prompts-prompt.md'), optional: true},
        {label: 'output/quote-duel-social-prompts-codex-message.md', file: path.join(ctx.output, 'quote-duel-social-prompts-codex-message.md'), optional: true}
      ],
      status: (stepState) => {
        if (!exists(duelSocialPrompts)) {
          if (exists(quoteDuelJson)) return {status: 'attention', detail: 'Quote Duel content is ready - generate per-duel social prompts when ready.'};
          return fromLastRun(stepState, 'Build Quote Duel content first.');
        }
        const prompts = readJsonSafe(duelSocialPrompts);
        if (prompts?.draft === true) {
          return {status: 'attention', detail: 'Draft prompt file exists - run Codex generation to fill it.'};
        }
        if (stepState?.status === 'failed') return {status: 'failed', detail: 'Last prompt generation/validation failed - review the log.'};
        if (mtimeMs(quoteDuelJson) > mtimeMs(duelSocialPrompts) + 5000) {
          return {status: 'stale', detail: 'quote-duel.json changed after the social prompts were generated.'};
        }
        return {status: 'done', detail: 'Per-duel social text and reel cover prompts are ready.'};
      }
    }
  ];

  // Manually-created / pre-existing dates behave exactly as before.
  if (!isRemoteSyncDate(state)) return baseSteps;

  // Remote-sync dates: prepend steps 0/00 and lock the rest until the pull is
  // ready AND the corrected briefing exists.
  const correctedExists = exists(correctedBriefingPath(ctx));
  const ready = state?.remoteSync?.ready === true;
  const gateOpen = ready && correctedExists;
  const lockReason = !ready
    ? 'Locked — sync the briefing from the data server first (step 0).'
    : 'Locked — create briefing_<date>_corrected.txt and resync it (step 00).';
  const gatedBase = baseSteps.map((step) => (gateOpen ? step : {...step, locked: true, lockReason}));
  return [...buildRemoteSyncSteps(ctx), ...gatedBase];
}

export function getStep(ctx, stepId, state = null, options = {}) {
  return getSteps(ctx, state, options).find((step) => step.id === stepId) || null;
}
