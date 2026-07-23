import fs from 'node:fs';
import path from 'node:path';
import {REPO_ROOT} from '../config.mjs';

// Cross-date post-performance tracker. Unlike dashboard-state.json (one file per
// briefing date), metrics arrive days after posting and only make sense compared
// ACROSS dates — so they live in a single repo-wide store.
const METRICS_DIR = path.join(REPO_ROOT, 'briefings', 'metrics');
const METRICS_FILE = path.join(METRICS_DIR, 'post-metrics.json');

export const PLATFORMS = ['instagram', 'youtube', 'tiktok'];

// The numbers you punch in 24–48h after posting, read off each platform's native
// analytics. avgPctViewed + reach are the two that drive the keep/kill decision;
// the rest are secondary signal.
export const METRIC_FIELDS = [
  'impressions',
  'reach',
  'avgPctViewed',
  'hookRetentionPct',
  'saves',
  'shares',
  'follows'
];

function emptyMetrics() {
  return Object.fromEntries(METRIC_FIELDS.map((field) => [field, null]));
}

export function recordId(date, duelId, platform) {
  return `${date}__${duelId}__${platform}`;
}

export function loadMetrics() {
  try {
    const raw = fs.readFileSync(METRICS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

export function saveMetrics(records) {
  fs.mkdirSync(METRICS_DIR, {recursive: true});
  fs.writeFileSync(METRICS_FILE, JSON.stringify({records}, null, 2));
}

// A record counts as "filled in" once any of the headline numbers is present.
export function hasMetrics(record) {
  const m = record?.metrics || {};
  return m.avgPctViewed != null || m.reach != null || m.impressions != null;
}

function sanitizeMetricPatch(patch = {}) {
  const out = {};
  for (const field of METRIC_FIELDS) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === '' || value === null || value === undefined) {
      out[field] = null;
    } else {
      const num = Number(value);
      out[field] = Number.isFinite(num) ? num : null;
    }
  }
  return out;
}

// Append a pending row per (clip × platform). Existing rows are left untouched so
// re-seeding a day never wipes numbers you already entered.
export function seedRecords({date, clips = [], platforms = PLATFORMS}) {
  const records = loadMetrics();
  const byId = new Map(records.map((rec) => [rec.id, rec]));
  const now = new Date().toISOString();
  let added = 0;

  for (const clip of clips) {
    const duelId = String(clip.duelId || '').trim();
    if (!duelId) continue;
    for (const platform of platforms) {
      if (!PLATFORMS.includes(platform)) continue;
      const id = recordId(date, duelId, platform);
      if (byId.has(id)) continue;
      const record = {
        id,
        date,
        duelId,
        outlet: clip.outlet || '',
        hook: clip.hook || '',
        platform,
        postUrl: '',
        postedAt: now,
        seededAt: now,
        metrics: emptyMetrics(),
        note: '',
        metricsUpdatedAt: null
      };
      records.push(record);
      byId.set(id, record);
      added += 1;
    }
  }

  saveMetrics(records);
  return {added, total: records.length};
}

export function updateRecord(id, patch = {}) {
  const records = loadMetrics();
  const record = records.find((rec) => rec.id === id);
  if (!record) throw new Error(`Unknown metrics record: ${id}`);

  if (typeof patch.postUrl === 'string') record.postUrl = patch.postUrl;
  if (typeof patch.note === 'string') record.note = patch.note;
  if (typeof patch.postedAt === 'string' && patch.postedAt) record.postedAt = patch.postedAt;

  if (patch.metrics && typeof patch.metrics === 'object') {
    const before = JSON.stringify(record.metrics);
    record.metrics = {...record.metrics, ...sanitizeMetricPatch(patch.metrics)};
    if (JSON.stringify(record.metrics) !== before) {
      record.metricsUpdatedAt = new Date().toISOString();
    }
  }

  saveMetrics(records);
  return record;
}

export function deleteRecord(id) {
  const records = loadMetrics();
  const next = records.filter((rec) => rec.id !== id);
  saveMetrics(next);
  return {removed: records.length - next.length};
}

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function round(value, places = 1) {
  if (value == null) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// A "breakout" is a clip whose reach is >= 10x the median reach across all filled
// clips — the existence-of-ceiling signal that says "keep going" on its own.
const BREAKOUT_FACTOR = 10;

function summarizeGroup(group, breakoutThreshold) {
  const filled = group.filter(hasMetrics);
  const reaches = filled.map((rec) => rec.metrics.reach).filter((v) => Number.isFinite(v));
  const breakouts = breakoutThreshold
    ? filled.filter((rec) => Number.isFinite(rec.metrics.reach) && rec.metrics.reach >= breakoutThreshold).length
    : 0;
  return {
    posts: group.length,
    filled: filled.length,
    avgPctViewed: round(mean(filled.map((rec) => rec.metrics.avgPctViewed))),
    avgHookRetentionPct: round(mean(filled.map((rec) => rec.metrics.hookRetentionPct))),
    medianReach: round(median(reaches), 0),
    totalSaves: filled.reduce((sum, rec) => sum + (Number(rec.metrics.saves) || 0), 0),
    totalShares: filled.reduce((sum, rec) => sum + (Number(rec.metrics.shares) || 0), 0),
    totalFollows: filled.reduce((sum, rec) => sum + (Number(rec.metrics.follows) || 0), 0),
    breakouts
  };
}

function groupBy(records, keyFn) {
  const map = new Map();
  for (const rec of records) {
    const key = keyFn(rec) || '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(rec);
  }
  return map;
}

// The two aggregates that feed the week-3 decision: which HOOK variant travels,
// and which OUTLET duel travels. Plus a flat platform breakdown.
export function computeAggregates(records) {
  const filled = records.filter(hasMetrics);
  const overallMedianReach = median(filled.map((rec) => rec.metrics.reach));
  const breakoutThreshold = overallMedianReach ? overallMedianReach * BREAKOUT_FACTOR : null;

  const toRows = (map) =>
    [...map.entries()]
      .map(([key, group]) => ({key, ...summarizeGroup(group, breakoutThreshold)}))
      .sort((a, b) => (b.avgPctViewed ?? -1) - (a.avgPctViewed ?? -1));

  return {
    totals: {
      posts: records.length,
      filled: filled.length,
      overallMedianReach: round(overallMedianReach, 0),
      breakoutThreshold: round(breakoutThreshold, 0),
      breakouts: breakoutThreshold
        ? filled.filter((rec) => Number.isFinite(rec.metrics.reach) && rec.metrics.reach >= breakoutThreshold).length
        : 0
    },
    byHook: toRows(groupBy(records, (rec) => rec.hook || 'no-hook')),
    byOutlet: toRows(groupBy(records, (rec) => rec.outlet || rec.duelId)),
    byPlatform: toRows(groupBy(records, (rec) => rec.platform))
  };
}

export function metricsState() {
  const records = loadMetrics().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.duelId.localeCompare(b.duelId)));
  return {
    records: records.map((rec) => ({...rec, hasMetrics: hasMetrics(rec)})),
    aggregates: computeAggregates(records),
    fields: METRIC_FIELDS,
    platforms: PLATFORMS
  };
}
