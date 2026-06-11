import fs from 'node:fs';
import path from 'node:path';

import {parseCliArgs, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {patchWavHeaderSizes} from './lib/wav-header.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));

const collectWavFiles = (folder) => {
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((entry) => entry.toLowerCase().endsWith('.wav'))
    .map((entry) => path.join(folder, entry));
};

let audioFolders;
if (args.folder || args.date) {
  let briefingFolder;
  try {
    briefingFolder = resolveBriefingFolder(cwd, args.folder ?? `briefings/${args.date}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  audioFolders = [path.join(briefingFolder, 'audio')];
} else {
  const briefingsRoot = path.join(cwd, 'briefings');
  audioFolders = fs.existsSync(briefingsRoot)
    ? fs
        .readdirSync(briefingsRoot)
        .map((entry) => path.join(briefingsRoot, entry, 'audio'))
        .filter((folder) => fs.existsSync(folder) && fs.statSync(folder).isDirectory())
    : [];
  console.log(`No --folder given; scanning all date folders under briefings/ (${audioFolders.length} audio folders).`);
}

let repaired = 0;
let clean = 0;

for (const folder of audioFolders) {
  for (const filePath of collectWavFiles(folder)) {
    const buffer = fs.readFileSync(filePath);
    if (patchWavHeaderSizes(buffer)) {
      fs.writeFileSync(filePath, buffer);
      console.log(`repaired  ${path.relative(cwd, filePath)}`);
      repaired += 1;
    } else {
      clean += 1;
    }
  }
}

console.log(`\nDone. Repaired ${repaired} WAV file(s); ${clean} already had correct headers.`);
