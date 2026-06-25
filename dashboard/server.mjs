import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import express from 'express';
import {
  REPO_ROOT,
  PORT,
  HOST,
  briefingContext,
  PHONE_REMOTE_ROOT,
  PHONE_SSH_HOST,
  PHONE_SSH_PORT,
  PHONE_SSH_USER,
  PHONE_CURL_INTERFACE
} from './config.mjs';
import {getSteps, getStep} from './steps.mjs';
import {Runner} from './runner.mjs';
import {loadState, saveState, recordRun} from './lib/state.mjs';
import {
  audioEntries,
  buildRegenerateCommands,
  buildRecordingCommands,
  loadAudioSource,
  saveAudioSource,
  saveTextOverride,
  duelNarrationEntries,
  saveDuelTextOverride
} from './audio.mjs';
import {statInfo} from './lib/checks.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const webDir = path.join(REPO_ROOT, 'dashboard', 'web');
const distDir = path.join(webDir, 'dist');

function ensureFrontendBuilt() {
  if (fs.existsSync(path.join(distDir, 'index.html'))) return;
  console.log('dashboard/web/dist missing — building frontend with Vite (one-time)...');
  const result = spawnSync('npx', ['vite', 'build', '--config', 'dashboard/web/vite.config.mjs'], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    console.error('Frontend build failed. Run: npm run briefing:dashboard:build');
    process.exit(1);
  }
}

function listDates() {
  const briefingsDir = path.join(REPO_ROOT, 'briefings');
  if (!fs.existsSync(briefingsDir)) return [];
  return fs
    .readdirSync(briefingsDir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && DATE_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

function requireDate(req, res) {
  const date = String(req.query.date || req.body?.date || '');
  if (!DATE_RE.test(date)) {
    res.status(400).json({error: 'Missing or invalid date (expected YYYY-MM-DD).'});
    return null;
  }
  if (!fs.existsSync(path.join(REPO_ROOT, 'briefings', date))) {
    res.status(404).json({error: `No briefings/${date} folder.`});
    return null;
  }
  return date;
}

// --- SSE plumbing ---
const sseClients = new Map(); // date -> Set<res>

function broadcast(date, event) {
  const clients = sseClients.get(date);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(payload);
}

const runner = new Runner({
  repoRoot: REPO_ROOT,
  broadcast,
  onFinish: (run) => {
    const ctx = briefingContext(run.date);
    if (run.stepId.startsWith('audio-regen:')) {
      const state = loadState(ctx);
      state.audio[run.shared.sceneId || run.stepId.slice('audio-regen:'.length)] = {
        status: run.status,
        oldDuration: run.shared.oldDuration ?? null,
        newDuration: run.shared.newDuration ?? null,
        verdict: run.status === 'success' ? run.shared.verdict || 'unknown' : 'failed',
        at: run.finishedAt
      };
      saveState(ctx, state);
    } else {
      recordRun(ctx, run.stepId, run);
    }
  }
});

function relUrl(file) {
  const rel = path.relative(REPO_ROOT, file);
  if (rel.startsWith('..')) return null;
  return '/' + rel.split(path.sep).join('/');
}

function pcPath(file) {
  const normalized = path.resolve(file);
  const match = normalized.match(/^\/mnt\/([a-z])\/(.+)$/i);
  if (!match) return normalized;
  return `${match[1].toUpperCase()}:\\${match[2].split('/').join('\\')}`;
}

function readJsonSafe(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const socialVariantLabel = (mid) => {
  if (mid === '') return 'Normal briefing';
  if (mid === '-hook-captions') return 'Hook: captions + focus boxes';
  if (mid === '-hook-stamps') return 'Hook: quote stamps + chips';
  return mid.replace(/^-/, '');
};

function instagramCoverImageFiles(ctx) {
  if (!fs.existsSync(ctx.output)) return [];
  const accepted = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  return fs
    .readdirSync(ctx.output, {withFileTypes: true})
    .filter((entry) => {
      const ext = path.extname(entry.name).toLowerCase();
      return entry.isFile() && /^instagram-reel-cover\./i.test(entry.name) && accepted.has(ext);
    })
    .map((entry) => path.join(ctx.output, entry.name))
    .sort();
}

function finalSocialVariants(ctx) {
  if (!fs.existsSync(ctx.output)) return [];
  return fs
    .readdirSync(ctx.output)
    .filter((name) => /^radar-beirut-briefing.*-final\.mp4$/.test(name))
    .sort()
    .map((fileName) => {
      const mid = fileName.replace(/^radar-beirut-briefing/, '').replace(/-final\.mp4$/, '');
      const sceneDirName = `scene-videos${mid}`;
      const zipName = `radar-beirut-briefing${mid}-${ctx.date}.zip`;
      return {
        mid,
        label: socialVariantLabel(mid),
        fullVideo: path.join(ctx.output, fileName),
        sceneDir: path.join(ctx.output, sceneDirName),
        zip: path.join(ctx.output, zipName)
      };
    });
}

function socialPostingState(ctx, state = {}) {
  const captionsPath = path.join(ctx.output, 'social-captions.json');
  const captions = readJsonSafe(captionsPath);
  const variants = finalSocialVariants(ctx);
  const clipBySceneId = new Map();
  for (const clip of captions?.clips ?? []) {
    if (clip?.sceneId) clipBySceneId.set(String(clip.sceneId), clip);
  }

  const joinHashtags = (tags) => (Array.isArray(tags) ? tags : []).join(' ');
  const clipCopy = (clip) => [clip?.caption || '', joinHashtags(clip?.hashtags)].filter(Boolean).join('\n\n');
  const youtube = captions?.youtube || null;
  const instagram = captions?.instagram || null;
  const coverImage = instagramCoverImageFiles(ctx)[0] || null;

  return {
    ready: Boolean(captions),
    captionsPath: fs.existsSync(captionsPath) ? path.relative(REPO_ROOT, captionsPath).split(path.sep).join('/') : null,
    phone: phoneTransferState(ctx, state),
    youtube: youtube
      ? {
          title: youtube.title || '',
          description: youtube.description || '',
          thumbnailPrompt: youtube.thumbnailPrompt || '',
          hashtags: Array.isArray(youtube.hashtags) ? youtube.hashtags : [],
          copyText: [youtube.title || '', youtube.description || '', joinHashtags(youtube.hashtags)].filter(Boolean).join('\n\n')
        }
      : null,
    instagram: instagram
      ? {
          reelCoverPrompt: instagram.reelCoverPrompt || '',
          coverImage: coverImage
            ? {
                path: path.relative(REPO_ROOT, coverImage).split(path.sep).join('/'),
                copyPath: pcPath(coverImage),
                url: relUrl(coverImage)
              }
            : null
        }
      : null,
    variants: variants.map((variant) => {
      const manifestPath = path.join(variant.sceneDir, 'manifest.json');
      const manifest = readJsonSafe(manifestPath, {segments: []});
      const clips = (manifest.segments || []).map((segment) => {
        const sceneId = String((segment.sceneIds || [])[0] || '');
        const clip = clipBySceneId.get(sceneId) || null;
        const filePath = path.join(variant.sceneDir, segment.fileName || '');
        return {
          sceneId,
          label: segment.label || sceneId || segment.fileName,
          fileName: segment.fileName || '',
          path: path.relative(REPO_ROOT, filePath).split(path.sep).join('/'),
          copyPath: pcPath(filePath),
          url: fs.existsSync(filePath) ? relUrl(filePath) : null,
          caption: clip?.caption || '',
          outlet: clip?.outlet || '',
          hashtags: Array.isArray(clip?.hashtags) ? clip.hashtags : [],
          copyText: clipCopy(clip)
        };
      });
      return {
        mid: variant.mid,
        label: variant.label,
        fullVideo: {
          path: path.relative(REPO_ROOT, variant.fullVideo).split(path.sep).join('/'),
          copyPath: pcPath(variant.fullVideo),
          url: fs.existsSync(variant.fullVideo) ? relUrl(variant.fullVideo) : null
        },
        zip: {
          path: path.relative(REPO_ROOT, variant.zip).split(path.sep).join('/'),
          copyPath: pcPath(variant.zip),
          url: fs.existsSync(variant.zip) ? relUrl(variant.zip) : null
        },
        sceneDir: path.relative(REPO_ROOT, variant.sceneDir).split(path.sep).join('/'),
        clips
      };
    })
  };
}

function phoneRemoteFolder(date) {
  return `${PHONE_REMOTE_ROOT.replace(/\/+$/, '')}/${date}`;
}

function phoneTransferState(ctx, state = {}) {
  return {
    host: PHONE_SSH_HOST,
    port: PHONE_SSH_PORT,
    user: PHONE_SSH_USER,
    curlInterface: PHONE_CURL_INTERFACE || null,
    remoteFolder: phoneRemoteFolder(ctx.date),
    status: state.phoneTransfer?.status || 'not-copied',
    copiedAt: state.phoneTransfer?.copiedAt || null,
    deletedAt: state.phoneTransfer?.deletedAt || null,
    fileCount: state.phoneTransfer?.fileCount ?? null,
    clipCount: state.phoneTransfer?.clipCount ?? null,
    coverCount: state.phoneTransfer?.coverCount ?? null,
    variant: state.phoneTransfer?.variant || null,
    variantMid: state.phoneTransfer?.variantMid ?? null
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runCommand(command, args, {password = null} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: {...process.env, ...(password ? {SSHPASS: password} : {}), FORCE_COLOR: '0', NO_COLOR: '1'},
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => reject(new Error(`Failed to start ${command}: ${error.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve({stdout, stderr});
      else reject(new Error((stderr || stdout || `${command} exited with status ${code}`).trim()));
    });
  });
}

async function withPhoneNetrc(password, fn) {
  const netrcPath = path.join(os.tmpdir(), `radar-phone-${crypto.randomUUID()}.netrc`);
  fs.writeFileSync(netrcPath, `machine ${PHONE_SSH_HOST} login ${PHONE_SSH_USER} password ${password}\n`, {mode: 0o600});
  try {
    return await fn(netrcPath);
  } finally {
    try {
      fs.unlinkSync(netrcPath);
    } catch {
      /* temporary credential file already gone */
    }
  }
}

function requirePhonePassword(req, res) {
  const password = String(req.body?.password || '');
  if (!password) {
    res.status(400).json({error: 'Enter the phone FTP password.'});
    return null;
  }
  return password;
}

function phoneFtpUrl(remotePath = '') {
  const cleanPath = String(remotePath).replace(/^\/+/, '');
  return `ftp://${PHONE_SSH_HOST}:${PHONE_SSH_PORT}/${cleanPath}`;
}

function phoneCurlBaseArgs(netrcPath) {
  const args = [
    '--silent',
    '--show-error',
    '--connect-timeout',
    '10',
    '--max-time',
    '600',
    '--retry',
    '4',
    '--retry-all-errors',
    '--retry-delay',
    '2',
    '--netrc-file',
    netrcPath
  ];
  if (PHONE_CURL_INTERFACE) args.push('--interface', PHONE_CURL_INTERFACE);
  return args;
}

function selectedSocialVariant(ctx, mid) {
  const variants = finalSocialVariants(ctx);
  return variants.find((variant) => variant.mid === mid) || variants[0] || null;
}

function sceneMp4Files(sceneDir) {
  if (!fs.existsSync(sceneDir)) return [];
  return fs
    .readdirSync(sceneDir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
    .map((entry) => path.join(sceneDir, entry.name))
    .sort();
}

function correctedBriefingPath(ctx) {
  return path.join(ctx.folder, `briefing_${ctx.date}_corrected.txt`);
}

// Editable corrected-briefing text shown in step 0 (remote-sync dates). Seeded by
// the sync step; saved back via POST /api/briefing/corrected.
function correctedBriefingState(ctx) {
  const file = correctedBriefingPath(ctx);
  const info = statInfo(file);
  let content = '';
  if (info.exists && !info.isDirectory) {
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      content = '';
    }
  }
  return {
    path: path.relative(REPO_ROOT, file).split(path.sep).join('/'),
    exists: Boolean(info.exists) && !info.isDirectory,
    content,
    mtimeMs: info.mtimeMs ?? null
  };
}

function computeState(date) {
  const ctx = briefingContext(date);
  const state = loadState(ctx);
  const active = runner.activeRun(date);

  const steps = getSteps(ctx, state).map((step) => {
    const stepState = state.steps?.[step.id] || null;
    let status;
    if (active && active.stepId === step.id) {
      status = {status: 'running', detail: `Running ${active.actionId}...`};
    } else {
      status = step.status(stepState, state);
    }
    const artifacts = step.artifacts().map((artifact) => {
      const info = statInfo(artifact.file);
      return {
        label: artifact.label,
        path: path.relative(REPO_ROOT, artifact.file).split(path.sep).join('/'),
        exists: info.exists,
        mtimeMs: info.mtimeMs ?? null,
        size: info.size ?? null,
        optional: artifact.optional || false,
        audio: artifact.audio || false,
        url: info.exists && !info.isDirectory ? relUrl(artifact.file) : null
      };
    });
    return {
      id: step.id,
      title: step.title,
      description: step.description,
      kind: step.kind,
      locked: step.locked || false,
      lockReason: step.lockReason || '',
      actions: step.actions.map(({id, label, options}) => ({id, label, options: options || null})),
      status: status.status,
      statusDetail: status.detail || '',
      artifacts,
      lastRun: stepState
        ? {status: stepState.status, finishedAt: stepState.finishedAt, exitCode: stepState.exitCode, logTail: stepState.logTail || []}
        : null
    };
  });

  return {
    date,
    steps,
    remoteSync: state.remoteSync || null,
    correctedBriefing: correctedBriefingState(ctx),
    audioSource: loadAudioSource(ctx),
    audio: audioEntries(ctx, state),
    duel: {
      narration: duelNarrationEntries(ctx),
      narrationConfirmedAt: (state.duel || {}).narrationConfirmedAt || null
    },
    social: socialPostingState(ctx, state),
    reviews: state.reviews || {},
    activeRun: active
      ? {stepId: active.stepId, actionId: active.actionId, startedAt: active.startedAt, log: active.log.slice(-800)}
      : null
  };
}

ensureFrontendBuilt();

const app = express();
app.use(express.json());

app.get('/api/dates', (req, res) => {
  res.json({dates: listDates()});
});

app.get('/api/state', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  res.json(computeState(date));
});

// Create a new date folder fed by the data server and flag it for the remote-sync
// workflow (steps 0/00 + gating). Refuses to touch existing manually-created dates.
app.post('/api/create-date', (req, res) => {
  const date = String(req.body?.date || '');
  if (!DATE_RE.test(date)) {
    return res.status(400).json({error: 'Missing or invalid date (expected YYYY-MM-DD).'});
  }
  const ctx = briefingContext(date);
  if (fs.existsSync(ctx.folder)) {
    const existing = loadState(ctx);
    if (existing.remoteSync?.source === 'remote-sync') {
      return res.json({ok: true, date, created: false});
    }
    return res.status(409).json({error: `briefings/${date} already exists and was not created from the data server.`});
  }
  fs.mkdirSync(ctx.output, {recursive: true});
  const state = loadState(ctx);
  state.remoteSync = {source: 'remote-sync', createdAt: new Date().toISOString(), ready: false};
  saveState(ctx, state);
  res.json({ok: true, date, created: true});
});

app.post('/api/run', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const {stepId, actionId} = req.body || {};
  const ctx = briefingContext(date);
  const state = loadState(ctx);
  const step = getStep(ctx, String(stepId || ''), state);
  if (!step) return res.status(404).json({error: `Unknown step: ${stepId}`});
  if (step.locked) return res.status(423).json({error: step.lockReason || 'Step is locked.'});
  const action = step.actions.find((item) => item.id === actionId) || step.actions[0];
  if (!action) return res.status(400).json({error: `Step ${stepId} has no runnable actions.`});
  try {
    const options = req.body?.options && typeof req.body.options === 'object' ? req.body.options : {};
    const run = runner.start({date, stepId: step.id, actionId: action.id, commands: action.commands(options)});
    res.json({runId: run.id, stepId: step.id, actionId: action.id});
  } catch (error) {
    res.status(409).json({error: error.message});
  }
});

// Save edits to briefing_<date>_corrected.txt from the step 0 editor.
app.post('/api/briefing/corrected', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  if (typeof req.body?.content !== 'string') {
    return res.status(400).json({error: 'Missing content.'});
  }
  const ctx = briefingContext(date);
  const file = correctedBriefingPath(ctx);
  try {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, req.body.content, 'utf8');
    broadcast(date, {type: 'state-changed'});
    res.json({ok: true});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/review', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const ctx = briefingContext(date);
  const state = loadState(ctx);
  state.reviews['html-review'] = req.body?.done
    ? {done: true, at: new Date().toISOString()}
    : {done: false, at: null};
  saveState(ctx, state);
  broadcast(date, {type: 'state-changed'});
  res.json({ok: true});
});

app.post('/api/audio/regenerate', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const sceneId = String(req.body?.sceneId || req.body?.entryId || '');
  const ctx = briefingContext(date);
  try {
    const commands = buildRegenerateCommands(ctx, sceneId);
    const run = runner.start({date, stepId: `audio-regen:${sceneId}`, actionId: 'regenerate', commands, shared: {}});
    res.json({runId: run.id, stepId: run.stepId});
  } catch (error) {
    const status = /already active/.test(error.message) ? 409 : 400;
    res.status(status).json({error: error.message});
  }
});

app.post('/api/audio/script', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const sceneId = String(req.body?.sceneId || '');
  if (!sceneId) return res.status(400).json({error: 'Missing sceneId.'});
  const ctx = briefingContext(date);
  try {
    saveTextOverride(ctx, sceneId, String(req.body?.text ?? ''));
    broadcast(date, {type: 'state-changed'});
    res.json({ok: true});
  } catch (error) {
    res.status(400).json({error: error.message});
  }
});

// Upload a recorded take (raw audio blob) for one scene. date + sceneId are query
// params because the body is the binary audio. Converts + runs the same pipeline
// tail as a Hamsa regen via the audio-regen:<sceneId> stepId (verdict/badge reuse).
app.post('/api/audio/record', express.raw({type: 'audio/*', limit: '25mb'}), (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const sceneId = String(req.query.sceneId || '');
  if (!sceneId) return res.status(400).json({error: 'Missing sceneId.'});
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({error: 'Empty recording upload.'});
  }
  const ctx = briefingContext(date);
  const tmpBlobPath = path.join(os.tmpdir(), `radar-record-${date}-${sceneId}-${crypto.randomUUID()}.bin`);
  try {
    fs.writeFileSync(tmpBlobPath, req.body);
    const commands = buildRecordingCommands(ctx, sceneId, tmpBlobPath);
    const run = runner.start({date, stepId: `audio-regen:${sceneId}`, actionId: 'record', commands, shared: {}});
    res.json({runId: run.id, stepId: run.stepId});
  } catch (error) {
    try {
      fs.unlinkSync(tmpBlobPath);
    } catch {
      /* nothing to clean up */
    }
    const status = /already active/.test(error.message) ? 409 : 400;
    res.status(status).json({error: error.message});
  }
});

app.get('/api/audio/source', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  res.json({audioSource: loadAudioSource(briefingContext(date))});
});

app.post('/api/audio/source', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const ctx = briefingContext(date);
  const audioSource = saveAudioSource(ctx, String(req.body?.audioSource || 'ai'));
  broadcast(date, {type: 'state-changed'});
  res.json({audioSource});
});

app.get('/api/duel/script', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  res.json({entries: duelNarrationEntries(briefingContext(date))});
});

app.post('/api/duel/script', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const {duelId, text} = req.body || {};
  if (!duelId) return res.status(400).json({error: 'duelId is required.'});
  const ctx = briefingContext(date);
  try {
    saveDuelTextOverride(ctx, String(duelId), String(text ?? ''));
    const state = loadState(ctx);
    if (state.duel?.narrationConfirmedAt) {
      state.duel.narrationConfirmedAt = null; // any edit re-gates
      saveState(ctx, state);
    }
    broadcast(date, {type: 'state-changed'});
    res.json({ok: true, entries: duelNarrationEntries(ctx)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/duel/confirm', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const ctx = briefingContext(date);
  const state = loadState(ctx);
  state.duel = {...(state.duel || {}), narrationConfirmedAt: new Date().toISOString()};
  saveState(ctx, state);
  broadcast(date, {type: 'state-changed'});
  res.json({ok: true, narrationConfirmedAt: state.duel.narrationConfirmedAt});
});

app.post('/api/phone/upload-scenes', async (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const password = requirePhonePassword(req, res);
  if (!password) return;

  const ctx = briefingContext(date);
  const variant = selectedSocialVariant(ctx, String(req.body?.mid ?? ''));
  if (!variant) return res.status(400).json({error: 'No final video variant found. Run mux/download first.'});

  const sceneFiles = sceneMp4Files(variant.sceneDir);
  if (!sceneFiles.length) {
    return res.status(400).json({error: `No scene MP4s found in ${path.relative(REPO_ROOT, variant.sceneDir)}. Run step 15 first.`});
  }
  const coverFiles = instagramCoverImageFiles(ctx);
  const files = [...sceneFiles, ...coverFiles];

  const remoteFolder = phoneRemoteFolder(date);
  try {
    await withPhoneNetrc(password, async (netrcPath) => {
      for (const file of files) {
        await runCommand('curl', [
          ...phoneCurlBaseArgs(netrcPath),
          '--ftp-create-dirs',
          '-T',
          file,
          phoneFtpUrl(`${remoteFolder}/${path.basename(file)}`)
        ]);
      }
    });
    const state = loadState(ctx);
    state.phoneTransfer = {
      status: 'copied',
      copiedAt: new Date().toISOString(),
      deletedAt: null,
      remoteFolder,
      fileCount: files.length,
      clipCount: sceneFiles.length,
      coverCount: coverFiles.length,
      variant: variant.label,
      variantMid: variant.mid
    };
    saveState(ctx, state);
    broadcast(date, {type: 'state-changed'});
    res.json({ok: true, remoteFolder, fileCount: files.length, clipCount: sceneFiles.length, coverCount: coverFiles.length, variant: variant.label});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/phone/delete-folder', async (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const password = requirePhonePassword(req, res);
  if (!password) return;

  const remoteFolder = phoneRemoteFolder(date);
  try {
    await withPhoneNetrc(password, async (netrcPath) => {
      const listing = await runCommand('curl', [...phoneCurlBaseArgs(netrcPath), '--list-only', phoneFtpUrl(`${remoteFolder}/`)]);
      const names = listing.stdout
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
        .filter((name) => !name.includes('/'));
      for (const name of names) {
        await runCommand('curl', [
          ...phoneCurlBaseArgs(netrcPath),
          '--quote',
          `DELE ${remoteFolder}/${name}`,
          phoneFtpUrl(`${remoteFolder}/`)
        ]);
      }
      await runCommand('curl', [...phoneCurlBaseArgs(netrcPath), '--quote', `RMD ${remoteFolder}`, phoneFtpUrl('/device/My_files/')]);
    });
    const state = loadState(ctx);
    state.phoneTransfer = {
      ...(state.phoneTransfer || {}),
      status: 'not-copied',
      deletedAt: new Date().toISOString(),
      remoteFolder,
      fileCount: null
    };
    saveState(ctx, state);
    broadcast(date, {type: 'state-changed'});
    res.json({ok: true, remoteFolder});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/events', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write(': connected\n\n');
  if (!sseClients.has(date)) sseClients.set(date, new Set());
  sseClients.get(date).add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.get(date)?.delete(res);
  });
});

// Frontend, then repo files (briefings WAVs/HTMLs/MP4s/images, outlet logos...).
// Local-only server: bound to 127.0.0.1, intentionally serves the repo read-only.
app.use(express.static(distDir));
app.use(express.static(REPO_ROOT, {index: false, dotfiles: 'deny'}));

const server = app.listen(PORT, HOST, () => {
  console.log(`Briefing dashboard running at http://${HOST}:${PORT}`);
  const dates = listDates();
  if (dates.length) console.log(`Latest briefing folder: briefings/${dates[0]}`);
});

globalThis.__radarBriefingDashboardServer = server;
globalThis.__radarBriefingDashboardKeepAlive = setInterval(() => {}, 60_000);
