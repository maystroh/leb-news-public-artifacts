import fs from 'node:fs';
import path from 'node:path';

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

export const exists = (p) => fs.existsSync(p);
export const mtimeMs = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);

export function statInfo(p) {
  if (!fs.existsSync(p)) return {exists: false};
  const st = fs.statSync(p);
  return {exists: true, mtimeMs: st.mtimeMs, size: st.size, isDirectory: st.isDirectory()};
}

export function countParagraphs(sourceFile) {
  if (!fs.existsSync(sourceFile)) return 0;
  const text = fs.readFileSync(sourceFile, 'utf8').trim();
  if (!text) return 0;
  return text.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean).length;
}

export function usableImages(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder, {withFileTypes: true})
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => IMAGE_EXT.test(name))
    .filter((name) => !/preview/i.test(name) && !/check/i.test(name) && name !== 'final_summary_generated.png')
    .sort();
}

export function uniqueOutletImageKeys(folder) {
  const keys = new Set();
  for (const name of usableImages(folder)) {
    const parts = name.split('_');
    if (parts.length > 1 && parts[0]) keys.add(parts[0]);
  }
  return [...keys].sort();
}

// How many outlets may lack a screenshot and still count as "ready". Some sources
// (e.g. 180post) are article-only websites we don't always grab a screenshot for.
export const MISSING_OUTLET_TOLERANCE = 1;

// Authoritative expected outlet count. Prefer the meta JSON's sources_found list
// (one entry per outlet/website the pipeline found that day); fall back to the
// paragraph-count heuristic (paragraphs - 3 for opening + summary + outro) only
// when no meta file is present. Avoids the heuristic overcounting on days with an
// extra non-outlet roundup paragraph.
export function expectedOutletCount(ctx, paragraphCount) {
  const meta = readJsonSafe(path.join(ctx.folder, `briefing_meta_${ctx.date}.json`));
  const sources = meta?.sources_found;
  if (Array.isArray(sources) && sources.length) return sources.length;
  return paragraphCount > 3 ? paragraphCount - 3 : 0;
}

export function briefingSourceFile(ctx) {
  const corrected = path.join(ctx.folder, `briefing_${ctx.date}_corrected.txt`);
  const plain = path.join(ctx.folder, `briefing_${ctx.date}.txt`);
  if (fs.existsSync(corrected)) return corrected;
  if (fs.existsSync(plain)) return plain;
  return corrected;
}

export function assetsReport(ctx) {
  const corrected = path.join(ctx.folder, `briefing_${ctx.date}_corrected.txt`);
  const plain = path.join(ctx.folder, `briefing_${ctx.date}.txt`);
  const source = briefingSourceFile(ctx);
  const paragraphCount = countParagraphs(source);
  const images = usableImages(ctx.folder);
  const keys = uniqueOutletImageKeys(ctx.folder);
  const requiredKeys = expectedOutletCount(ctx, paragraphCount);
  const minKeys = Math.max(0, requiredKeys - MISSING_OUTLET_TOLERANCE);
  const problems = [];
  if (!fs.existsSync(plain)) problems.push(`Missing source briefing: ${path.basename(plain)}`);
  if (!fs.existsSync(corrected)) problems.push(`Missing corrected briefing: ${path.basename(corrected)}`);
  if (paragraphCount === 0) {
    problems.push('No readable briefing text found, cannot estimate scenes.');
  } else if (keys.length < minKeys) {
    problems.push(
      `Unique outlet image keys (${keys.length}) below expected ${requiredKeys} ` +
        `(tolerating ${MISSING_OUTLET_TOLERANCE} missing). Add or rename outlet/article screenshots in the date folder.`
    );
  }
  return {paragraphCount, requiredKeys, minKeys, images, keys, problems, ok: problems.length === 0};
}

export function findSummaryImagePrompt(outputFolder) {
  if (!fs.existsSync(outputFolder)) return null;
  const matches = fs
    .readdirSync(outputFolder)
    .filter((name) => name.endsWith('summary-image.md'))
    .sort();
  return matches.length ? path.join(outputFolder, matches[matches.length - 1]) : null;
}

export function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function wavDurationSeconds(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const fileSize = fs.fstatSync(fd).size;
    const riff = Buffer.alloc(12);
    fs.readSync(fd, riff, 0, 12, 0);
    if (riff.toString('ascii', 0, 4) !== 'RIFF' || riff.toString('ascii', 8, 12) !== 'WAVE') return null;
    let offset = 12;
    let byteRate = null;
    let dataSize = null;
    const head = Buffer.alloc(8);
    while (offset + 8 <= fileSize) {
      fs.readSync(fd, head, 0, 8, offset);
      const id = head.toString('ascii', 0, 4);
      const size = head.readUInt32LE(4);
      if (id === 'fmt ') {
        const fmt = Buffer.alloc(16);
        fs.readSync(fd, fmt, 0, 16, offset + 8);
        byteRate = fmt.readUInt32LE(8);
      } else if (id === 'data') {
        const available = fileSize - offset - 8;
        dataSize = size === 0 || size === 0xffffffff ? available : Math.min(size, available);
      }
      if (byteRate && dataSize !== null) break;
      offset += 8 + size + (size % 2);
    }
    if (!byteRate || dataSize === null) return null;
    return dataSize / byteRate;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

const duration = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const sumDurations = (items) => (items || []).reduce((sum, item) => sum + duration(item.durationSeconds), 0);
const formatClock = (seconds) => {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};

export function outputDurationSummaryLines(outputFolder) {
  const rows = [];
  const briefing = readJsonSafe(path.join(outputFolder, 'briefing.json'));
  if (briefing) {
    rows.push({
      label: 'full editorial content',
      fileName: 'radar-beirut-briefing.html',
      seconds:
        duration(briefing.intro?.durationSeconds) + sumDurations(briefing.scenes) + duration(briefing.outro?.durationSeconds)
    });
  }
  const quoteDuel = readJsonSafe(path.join(outputFolder, 'quote-duel.json'));
  if (quoteDuel) {
    rows.push({
      label: 'The Quote Duel',
      fileName: 'radar-beirut-quote-duel.html',
      seconds:
        duration(quoteDuel.intro?.durationSeconds) + sumDurations(quoteDuel.scenes) + duration(quoteDuel.outro?.durationSeconds)
    });
  }
  const faultLineMap = readJsonSafe(path.join(outputFolder, 'fault-line-map.json'));
  if (faultLineMap) {
    rows.push({
      label: 'Fault Line Map',
      fileName: 'radar-beirut-fault-line-map.html',
      seconds:
        duration(faultLineMap.intro?.durationSeconds) +
        sumDurations(faultLineMap.entries) +
        duration(faultLineMap.synthesis?.durationSeconds) +
        duration(faultLineMap.outro?.durationSeconds)
    });
  }
  const keywordRadar = readJsonSafe(path.join(outputFolder, 'keyword-radar.json'));
  if (keywordRadar) {
    rows.push({
      label: 'The Keyword Radar',
      fileName: 'radar-beirut-keyword-radar.html',
      seconds:
        duration(keywordRadar.intro?.durationSeconds) +
        sumDurations(keywordRadar.entries) +
        duration(keywordRadar.synthesis?.durationSeconds)
    });
  }
  if (!rows.length) return ['No generated output JSON files found for duration summary.'];
  const lines = ['HTML output durations:'];
  for (const row of rows) {
    lines.push(`  ${row.fileName}`);
    lines.push(`    ${row.label}: ${row.seconds.toFixed(3)}s (${formatClock(row.seconds)})`);
  }
  return lines;
}

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();

// Port of move_stale_closing_audio_if_needed from guided-briefing-workflow.sh:
// if briefing.json's scene-11 audio text drifted from what the manifest WAV was
// generated with, move the old WAV aside so the next audio run regenerates it.
export function moveStaleClosingAudioIfNeeded(ctx, emit) {
  const briefing = readJsonSafe(path.join(ctx.output, 'briefing.json'));
  const manifest = readJsonSafe(path.join(ctx.audioDir, 'manifest.json'));
  if (!briefing || !manifest) return false;
  const closingScene = (briefing.scenes || []).find((scene) => scene.id === 'scene-11');
  const closingEntry = (manifest.entries || []).find((entry) => entry.sceneId === 'scene-11');
  if (!closingScene || !closingEntry || !closingEntry.audioPath) return false;
  const overrides = readJsonSafe(path.join(ctx.audioDir, 'text-overrides.json')) || {};
  const expected = normalize(overrides['scene-11']) || normalize(closingScene.audioText || closingScene.body);
  const manifestText = normalize(closingEntry.text);
  if (expected === manifestText) return false;
  const audioPath = path.resolve(ctx.repoRoot, closingEntry.audioPath);
  if (!fs.existsSync(audioPath)) return false;
  const ext = path.extname(audioPath);
  const backupPath = path.join(
    path.dirname(audioPath),
    `${path.basename(audioPath, ext)}.stale-before-regeneration${ext}`
  );
  emit('Detected stale closing-scene audio after the latest briefing build.');
  emit('Moving old WAV aside so Hamsa regenerates scene-11 from the summary-only audio text:');
  emit(`  ${audioPath}`);
  emit(`  -> ${backupPath}`);
  fs.renameSync(audioPath, backupPath);
  return true;
}
