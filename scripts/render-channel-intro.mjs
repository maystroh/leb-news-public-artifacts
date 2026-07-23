#!/usr/bin/env node
// Renders channel-intro.html (?render=1 deterministic mode) to an MP4.
// Headless Chrome steps the timeline frame by frame via window.__setT(t),
// screenshots the #stage element, pipes PNG frames to ffmpeg, and muxes
// audio/intro_audio.wav at offset 0.
//
// Usage:
//   node ./scripts/render-channel-intro.mjs [--fps 30] [--out channel-intro.mp4]
//                                           [--frames 0-60] [--chrome <path>]
//
// Requires: puppeteer-core (npm i -D puppeteer-core), ffmpeg on PATH,
// and a local Chrome/Edge install (or CHROME_PATH env / --chrome flag).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const FPS = Number(arg('fps', '30'));
const OUT = path.resolve(ROOT, arg('out', 'channel-intro.mp4'));
const FRAMES_RANGE = arg('frames'); // e.g. "0-60" for smoke tests
const HTML = path.join(ROOT, 'channel-intro.html');
const AUDIO = path.join(ROOT, 'audio', 'intro_audio.wav');

function toWslPath(p) {
  // C:\foo\bar → /mnt/c/foo/bar
  return p.replace(/^([A-Za-z]):\\/, (m, d) => `/mnt/${d.toLowerCase()}/`).replaceAll('\\', '/');
}

function findFfmpeg() {
  // prefer native ffmpeg; on Windows fall back to WSL's ffmpeg (paths translated)
  const probe = spawn(process.platform === 'win32' ? 'where.exe' : 'which', ['ffmpeg']);
  return new Promise(res => {
    probe.on('close', code => {
      if (code === 0) return res({ bin: 'ffmpeg', wsl: false });
      if (process.platform === 'win32') return res({ bin: 'wsl', wsl: true });
      res({ bin: 'ffmpeg', wsl: false });
    });
    probe.on('error', () => res(process.platform === 'win32' ? { bin: 'wsl', wsl: true } : { bin: 'ffmpeg', wsl: false }));
  });
}

function findChrome() {
  const flag = arg('chrome') || process.env.CHROME_PATH;
  if (flag) return flag;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser'
  ];
  const hit = candidates.find(p => p && existsSync(p));
  if (!hit) {
    console.error('Chrome not found. Pass --chrome <path> or set CHROME_PATH.');
    process.exit(1);
  }
  return hit;
}

async function main() {
  if (!existsSync(HTML)) throw new Error(`Missing ${HTML}`);
  if (!existsSync(AUDIO)) console.warn(`WARN: ${AUDIO} not found — rendering without audio.`);

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: [
      '--allow-file-access-from-files',
      '--font-render-hinting=none',
      '--hide-scrollbars',
      '--disable-gpu-vsync'
    ]
  });

  try {
    const page = await browser.newPage();
    // 405x720 stage × 8/3 device pixels = 1080x1920 output
    await page.setViewport({ width: 405, height: 720, deviceScaleFactor: 8 / 3 });
    await page.goto(pathToFileURL(HTML).href + '?render=1', { waitUntil: 'networkidle0' });
    await page.evaluate(() => window.__ready());

    const total = await page.evaluate(() => window.__total);
    const totalFrames = Math.ceil(total * FPS);
    let [from, to] = [0, totalFrames - 1];
    if (FRAMES_RANGE) [from, to] = FRAMES_RANGE.split('-').map(Number);

    const stage = await page.$('#stage');

    const { bin: ffBin, wsl } = await findFfmpeg();
    const audioPath = wsl ? toWslPath(AUDIO) : AUDIO;
    const outPath = wsl ? toWslPath(OUT) : OUT;
    const ffArgs = [
      ...(wsl ? ['ffmpeg'] : []),
      '-y',
      '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      ...(existsSync(AUDIO) ? ['-i', audioPath] : []),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      ...(existsSync(AUDIO) ? ['-c:a', 'aac', '-b:a', '192k'] : []),
      '-movflags', '+faststart',
      outPath
    ];
    if (wsl) console.log('ffmpeg not on PATH — using WSL ffmpeg');
    const ff = spawn(ffBin, ffArgs, { stdio: ['pipe', 'ignore', 'inherit'] });
    const ffDone = new Promise((res, rej) => {
      ff.on('close', code => code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)));
      ff.on('error', rej);
    });

    const write = buf => new Promise(res => {
      if (ff.stdin.write(buf)) res();
      else ff.stdin.once('drain', res);
    });

    const t0 = Date.now();
    for (let f = from; f <= to; f += 1) {
      const t = f / FPS;
      await page.evaluate(tt => {
        window.__setT(tt);
        return new Promise(r => requestAnimationFrame(() => r()));
      }, t);
      const png = await stage.screenshot({ type: 'png' });
      await write(png);
      if (f % Math.max(1, Math.round(totalFrames / 20)) === 0) {
        const done = f - from + 1;
        const rate = done / ((Date.now() - t0) / 1000);
        console.log(`frame ${f}/${to} (${(100 * done / (to - from + 1)).toFixed(0)}%) ~${rate.toFixed(1)} fps`);
      }
    }

    ff.stdin.end();
    await ffDone;
    console.log(`\nDone → ${OUT} (${to - from + 1} frames @ ${FPS}fps = ${((to - from + 1) / FPS).toFixed(1)}s)`);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
