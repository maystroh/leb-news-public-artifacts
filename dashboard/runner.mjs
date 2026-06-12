import {spawn} from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';

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
      shared
    };
    this.activeByDate.set(date, run);
    this.broadcast(date, {type: 'run-started', stepId, actionId, runId: run.id});
    this.#execute(run, commands).catch(() => {});
    return run;
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
      try {
        if (command.fn) {
          emit(`>> ${command.label || 'internal step'}`);
          await command.fn(emit, run.shared);
        } else {
          emit(`$ ${command.cmd} ${command.args.join(' ')}`);
          const exitCode = await this.#spawn(command, emit);
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

    run.status = failed ? 'failed' : 'success';
    if (run.exitCode === null) run.exitCode = failed ? 1 : 0;
    run.finishedAt = new Date().toISOString();
    this.activeByDate.delete(run.date);
    try {
      this.onFinish(run);
    } finally {
      this.broadcast(run.date, {type: 'run-finished', stepId: run.stepId, runId: run.id, status: run.status});
    }
  }

  #spawn(command, emit) {
    return new Promise((resolve, reject) => {
      const child = spawn(command.cmd, command.args, {
        cwd: this.repoRoot,
        env: {...process.env, FORCE_COLOR: '0', NO_COLOR: '1'},
        stdio: [command.stdinFile ? 'pipe' : 'ignore', 'pipe', 'pipe']
      });

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
        if (stdoutRest) emit(stdoutRest);
        if (stderrRest) emit(stderrRest);
        resolve(code ?? 1);
      });
    });
  }
}
