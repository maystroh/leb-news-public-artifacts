import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PORT = Number(process.env.BRIEFING_DASHBOARD_PORT || 4600);
export const HOST = '127.0.0.1';

export const SSH_HOST = process.env.RENDER_SERVER_HOST || 'hassan.alhajj@10.0.10.20';
export const SSH_PORT = process.env.RENDER_SERVER_PORT || '2361';
export const REMOTE_ROOT = process.env.RENDER_SERVER_ROOT || '~/projects/simple-app/leb-news-public-artifacts';

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Data server: source of the daily Codex briefing runs, pulled into briefings/<date>/
// when a date is created from the dashboard. Separate from the render server above.
export const DATA_SERVER_HOST = process.env.DATA_SERVER_HOST || 'ubuntu@ec2-54-82-171-205.compute-1.amazonaws.com';
export const DATA_SERVER_KEY = expandHome(process.env.DATA_SERVER_KEY || '~/connectionKey.pem');
export const DATA_SERVER_ROOT = process.env.DATA_SERVER_ROOT || '/home/ubuntu/lebanon-media-data/radar-codex-runs';

export const PHONE_SSH_HOST = process.env.PHONE_SSH_HOST || '192.168.1.23';
export const PHONE_SSH_PORT = process.env.PHONE_SSH_PORT || '5938';
export const PHONE_SSH_USER = process.env.PHONE_SSH_USER || 'pc';
export const PHONE_REMOTE_ROOT = process.env.PHONE_REMOTE_ROOT || '/device/My_files';
export const PHONE_CURL_INTERFACE = process.env.PHONE_CURL_INTERFACE || '';

// rsync -e transport string and the remote briefings dir for a given date.
export const DATA_SSH_E = `ssh -i ${DATA_SERVER_KEY} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8`;
export const remoteBriefingsDir = (date) => `${DATA_SERVER_ROOT}/${date}/briefings`;

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
