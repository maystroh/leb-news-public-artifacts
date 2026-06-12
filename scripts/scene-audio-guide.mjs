import {parseCliArgs, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {buildSceneAudioMap, findLatestBriefingFolder, normalizeSpacing} from './lib/scene-audio-map.mjs';

const USAGE = `Usage: node ./scripts/scene-audio-guide.mjs <scene 1-12> [--folder briefings/YYYY-MM-DD]

Points to the exact file + section that feeds the TTS audio for one scene,
and prints the commands to regenerate only that scene's WAV.`;

const preview = (value, max = 160) => {
  const text = normalizeSpacing(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const sceneArg = args.scene ?? args._[0];
const sceneNumber = Number(sceneArg);

if (!Number.isInteger(sceneNumber)) {
  console.error(USAGE);
  process.exit(1);
}

const briefingFolder = args.folder
  ? resolveBriefingFolder(cwd, args.folder)
  : findLatestBriefingFolder(cwd);

const map = buildSceneAudioMap({cwd, briefingFolder});
const {folderRel, txtRel, totalParagraphs} = map;

if (sceneNumber < 1 || sceneNumber > totalParagraphs) {
  console.error(`Scene ${sceneNumber} is out of range: ${txtRel} has ${totalParagraphs} paragraphs (scenes 1-${totalParagraphs}).`);
  process.exit(1);
}

const entry = map.entries.find((item) => item.sceneNumber === sceneNumber);

const lines = [];
const log = (line = '') => lines.push(line);

log(`Folder:    ${folderRel}`);
log(`Text file: ${txtRel} (${totalParagraphs} paragraphs)`);
log('');

if (entry.role === 'opening') {
  log(`Scene ${sceneNumber} — opening paragraph: NO audio is generated for it.`);
  log('');
  log(`It is paragraph 1 of ${txtRel}.`);
  log(`It only feeds the closing scene's displayed body (scene-${totalParagraphs - 1} body = paragraph 1 + paragraph ${totalParagraphs - 1}).`);
  log('');
  log('To change it:');
  log(`  1. Edit paragraph 1 in ${txtRel}`);
  log(`  2. npm run briefing:build:folder -- --folder ${folderRel}`);
  log('No audio regeneration is needed — the opening paragraph is never spoken.');
  console.log(lines.join('\n'));
  process.exit(0);
}

if (entry.role === 'outlet' && !entry.outletKey) {
  log(`Warning: no outlet mapping found for ${entry.sceneId} in ${folderRel}/outlet-map.json — WAV name below uses <outletKey> placeholder.`);
  log('');
}

const roleLabel = {
  outlet: 'outlet scene',
  closing: 'closing scene (خلاصة المشهد)',
  outro: 'outro (السؤال المفتوح)'
}[entry.role];

log(`Scene ${sceneNumber} — ${roleLabel}`);
log('');
log(`WAV file:  ${entry.wavFile}${entry.wavExists ? '' : '  (missing)'}${entry.wavDurationSeconds ? `  [${entry.wavDurationSeconds}s in manifest]` : ''}`);
log(`EDIT THIS: ${entry.source}${entry.sourceNote ? ` (${entry.sourceNote})` : ''}`);
log(`Current text: "${preview(entry.ttsText)}"`);

if (entry.matchesGeneratedAudio === false) {
  log('');
  log('Note: the existing WAV was generated from DIFFERENT text — it is stale.');
  log(`      WAV was generated from: "${preview(entry.generatedFromText)}"`);
}

const builtText = entry.role === 'outro'
  ? map.briefing?.outro?.body
  : entry.builtScene ? (entry.builtScene.audioText || entry.builtScene.body) : null;
if (map.briefing && builtText !== null && normalizeSpacing(builtText) !== normalizeSpacing(entry.ttsText)) {
  log('');
  log('Note: output/briefing.json currently carries DIFFERENT text for this scene — it is stale or was hand-edited.');
  log(`      briefing.json text: "${preview(builtText)}"`);
}

log('');
log('To regenerate ONLY this scene\'s audio:');
log('  1. Edit the source shown above');
log(`  2. npm run briefing:build:folder -- --folder ${folderRel}`);
log('     (refreshes output/briefing.json from the sources — skip this and edit');
log('      output/briefing.json directly ONLY if you know it has manual edits to keep)');
log(`  3. rm "${entry.wavFile}"`);
log(`  4. npm run audio:outlets -- --folder ${folderRel}`);
log('     (existing WAVs are reused; only the deleted one is regenerated)');
log(`  5. node ./scripts/sync-outlet-audio-timing.mjs --folder ${folderRel}`);
log(`  6. npm run briefing:build:folder -- --folder ${folderRel}   # apply new timing to HTML`);
log('');
log('MP4 note: if the new WAV is NOT longer than the old one, re-mux without re-rendering:');
log(`  npm run briefing:mux:audio -- --folder ${folderRel}`);
log('If it IS longer, scene durations shift and the muted render must be redone.');

console.log(lines.join('\n'));
