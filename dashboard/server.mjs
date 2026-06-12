import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import express from 'express';
import {REPO_ROOT, PORT, HOST, briefingContext} from './config.mjs';
import {getSteps, getStep} from './steps.mjs';
import {Runner} from './runner.mjs';
import {loadState, saveState, recordRun} from './lib/state.mjs';
import {audioEntries, buildRegenerateCommands, saveTextOverride} from './audio.mjs';
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

function computeState(date) {
  const ctx = briefingContext(date);
  const state = loadState(ctx);
  const active = runner.activeRun(date);

  const steps = getSteps(ctx).map((step) => {
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
        url: info.exists && !info.isDirectory ? relUrl(artifact.file) : null
      };
    });
    return {
      id: step.id,
      title: step.title,
      description: step.description,
      kind: step.kind,
      actions: step.actions.map(({id, label}) => ({id, label})),
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
    audio: audioEntries(ctx, state),
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

app.post('/api/run', (req, res) => {
  const date = requireDate(req, res);
  if (!date) return;
  const {stepId, actionId} = req.body || {};
  const ctx = briefingContext(date);
  const step = getStep(ctx, String(stepId || ''));
  if (!step) return res.status(404).json({error: `Unknown step: ${stepId}`});
  const action = step.actions.find((item) => item.id === actionId) || step.actions[0];
  if (!action) return res.status(400).json({error: `Step ${stepId} has no runnable actions.`});
  try {
    const run = runner.start({date, stepId: step.id, actionId: action.id, commands: action.commands()});
    res.json({runId: run.id, stepId: step.id, actionId: action.id});
  } catch (error) {
    res.status(409).json({error: error.message});
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

app.listen(PORT, HOST, () => {
  console.log(`Briefing dashboard running at http://${HOST}:${PORT}`);
  const dates = listDates();
  if (dates.length) console.log(`Latest briefing folder: briefings/${dates[0]}`);
});
