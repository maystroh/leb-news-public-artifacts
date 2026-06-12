import fs from 'node:fs';
import path from 'node:path';

const stateFile = (ctx) => path.join(ctx.output, 'dashboard-state.json');

export function loadState(ctx) {
  try {
    const raw = fs.readFileSync(stateFile(ctx), 'utf8');
    const parsed = JSON.parse(raw);
    return {steps: {}, reviews: {}, audio: {}, ...parsed};
  } catch {
    return {steps: {}, reviews: {}, audio: {}};
  }
}

export function saveState(ctx, state) {
  fs.mkdirSync(ctx.output, {recursive: true});
  fs.writeFileSync(stateFile(ctx), JSON.stringify(state, null, 2));
}

export function recordRun(ctx, stepId, run) {
  const state = loadState(ctx);
  state.steps[stepId] = {
    actionId: run.actionId,
    status: run.status,
    exitCode: run.exitCode ?? null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    logTail: run.log.slice(-40)
  };
  saveState(ctx, state);
  return state;
}
