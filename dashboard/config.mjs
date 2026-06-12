import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PORT = Number(process.env.BRIEFING_DASHBOARD_PORT || 4600);
export const HOST = '127.0.0.1';

export const SSH_HOST = process.env.RENDER_SERVER_HOST || 'hassan.alhajj@10.0.10.20';
export const SSH_PORT = process.env.RENDER_SERVER_PORT || '2361';
export const REMOTE_ROOT = process.env.RENDER_SERVER_ROOT || '~/projects/simple-app/leb-news-public-artifacts';

export const ANALYSIS_FILES = [
  'visual-script.json',
  'outlet-map.json',
  'quote-duel.json',
  'fault-line-map-script.json',
  'keyword-radar-script.json'
];

export function briefingContext(date) {
  const folderRel = path.posix.join('briefings', date);
  const folder = path.join(REPO_ROOT, 'briefings', date);
  return {
    repoRoot: REPO_ROOT,
    date,
    folder,
    folderRel,
    output: path.join(folder, 'output'),
    outputRel: path.posix.join(folderRel, 'output'),
    audioDir: path.join(folder, 'audio')
  };
}
