import {spawn} from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';

const terminateChild = (child) => {
  if (!child?.pid || child.killed) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {stdio: 'ignore'});
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  setTimeout(() => {
    if (child.killed) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }, 5000).unref();
};

// One active run per date. Commands run sequentially; a non-zero exit stops the run.
export class Runner {
  constructor({repoRoot, broadcast, onFinish}) {
    this.repoRoot = repoRoot;
    this.broadcast = broadcast;
    this.onFinish = onFinish;
    this.activeByDate = new Map();
  }

  activeRun(date) {
    return this.activeByDate.get(date) || null;
  }

  start({date, stepId, actionId, commands, shared = {}}) {
    if (this.activeByDate.has(date)) {
      throw new Error(`A run is already active for ${date}: ${this.activeByDate.get(date).stepId}`);
    }
    const run = {
      id: crypto.randomUUID(),
      date,
      stepId,
      actionId,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      log: [],
      cancelRequested: false,
      currentChild: null,
      shared
    };
    this.activeByDate.set(date, run);
    this.broadcast(date, {type: 'run-started', stepId, actionId, runId: run.id});
    this.#execute(run, commands).catch(() => {});
    return run;
  }

  cancel(date, reason = 'Cancelled by user') {
    const run = this.activeByDate.get(date);
    if (!run) return null;
    run.cancelRequested = true;
    run.log.push(reason);
    this.broadcast(date, {type: 'log', stepId: run.stepId, runId: run.id, line: reason});
    terminateChild(run.currentChild);
    return run;
  }

  cancelAll(reason = 'Cancelled all active runs by user') {
    const runs = [];
    for (const date of this.activeByDate.keys()) {
      const run = this.cancel(date, reason);
      if (run) runs.push(run);
    }
    return runs;
  }

  async #execute(run, commands) {
    const emit = (line) => {
      for (const piece of String(line).split(/\r?\n/)) {
        run.log.push(piece);
        this.broadcast(run.date, {type: 'log', stepId: run.stepId, runId: run.id, line: piece});
      }
    };

    let failed = false;
    for (const command of commands) {
      if (run.cancelRequested) break;
      try {
        if (command.fn) {
          emit(`>> ${command.label || 'internal step'}`);
          await command.fn(emit, run.shared);
        } else {
          emit(`$ ${command.cmd} ${command.args.join(' ')}`);
          const exitCode = await this.#spawn(command, emit, run);
          if (run.cancelRequested) break;
          if (exitCode !== 0) {
            run.exitCode = exitCode;
            emit(`Command exited with status ${exitCode}.`);
            failed = true;
            break;
          }
        }
      } catch (error) {
        emit(`ERROR: ${error.message}`);
        failed = true;
        break;
      }
    }

    run.status = run.cancelRequested ? 'cancelled' : failed ? 'failed' : 'success';
    if (run.exitCode === null) run.exitCode = run.cancelRequested ? 130 : failed ? 1 : 0;
    run.finishedAt = new Date().toISOString();
    this.activeByDate.delete(run.date);
    try {
      this.onFinish(run);
    } finally {
      this.broadcast(run.date, {type: 'run-finished', stepId: run.stepId, runId: run.id, status: run.status});
    }
  }

  #spawn(command, emit, run) {
    return new Promise((resolve, reject) => {
      const child = spawn(command.cmd, command.args, {
        cwd: this.repoRoot,
        env: {...process.env, FORCE_COLOR: '0', NO_COLOR: '1'},
        stdio: [command.stdinFile ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32'
      });
      run.currentChild = child;

      if (command.stdinFile) {
        const stream = fs.createReadStream(command.stdinFile);
        stream.on('error', (error) => {
          emit(`ERROR reading stdin file: ${error.message}`);
          child.kill();
        });
        stream.pipe(child.stdin);
      }

      let stdoutRest = '';
      let stderrRest = '';
      const onChunk = (restKey) => (chunk) => {
        const text = (restKey === 'out' ? stdoutRest : stderrRest) + chunk.toString('utf8');
        const lines = text.split(/\r?\n/);
        const rest = lines.pop();
        if (restKey === 'out') stdoutRest = rest;
        else stderrRest = rest;
        for (const line of lines) emit(line);
      };
      child.stdout.on('data', onChunk('out'));
      child.stderr.on('data', onChunk('err'));

      child.on('error', (error) => reject(new Error(`Failed to start ${command.cmd}: ${error.message}`)));
      child.on('close', (code) => {
        if (run.currentChild === child) run.currentChild = null;
        if (stdoutRest) emit(stdoutRest);
        if (stderrRest) emit(stderrRest);
        resolve(code ?? 1);
      });
    });
  }
}
