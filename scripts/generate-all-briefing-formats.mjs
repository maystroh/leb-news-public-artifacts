import fs from 'node:fs';
import path from 'node:path';

import {
  findBriefingTextFile,
  parseCliArgs,
  resolveBriefingFolder,
  writeJson
} from './lib/briefing-helpers.mjs';
import {buildCodexPrompt, createEmptyAnalysisFiles} from './lib/briefing-analysis-pack.mjs';

const slashNormalize = (value) => value.replace(/\\/g, '/');

const posixPathToWindowsPath = (value) => {
  const normalized = slashNormalize(value);
  const match = normalized.match(/^\/mnt\/([a-z])\/(.*)$/i);
  if (!match) {
    return value;
  }

  const [, drive, rest] = match;
  return `${drive.toUpperCase()}:\\${rest.replace(/\//g, '\\')}`;
};

const windowsPathToWslPath = (value) => {
  const match = value.match(/^([a-z]):[\\/](.*)$/i);
  if (!match) {
    return slashNormalize(value);
  }

  const [, drive, rest] = match;
  return `/mnt/${drive.toLowerCase()}/${slashNormalize(rest)}`;
};

const deriveBriefingPaths = ({projectRoot, briefingFolder}) => {
  const briefingFolderRelative = slashNormalize(path.relative(projectRoot, briefingFolder));
  const briefingFolderTerminalPath = windowsPathToWslPath(briefingFolder);
  const briefingFolderWindowsPath = posixPathToWindowsPath(briefingFolder);

  return {
    briefingFolderRelative,
    briefingFolderTerminalPath,
    briefingFolderWindowsPath
  };
};

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const outputFolder = path.join(briefingFolder, 'output');
fs.mkdirSync(outputFolder, {recursive: true});
const briefingPath = findBriefingTextFile(briefingFolder);
const briefingText = fs.readFileSync(briefingPath, 'utf8').trim();
const dateLabel = path.basename(briefingFolder);
const briefingFileName = path.basename(briefingPath);
const paragraphBlocks = briefingText
  .split(/\r?\n\s*\r?\n/)
  .map((paragraph) => paragraph.trim())
  .filter(Boolean);
const briefingPaths = deriveBriefingPaths({
  projectRoot: cwd,
  briefingFolder
});
if (args['briefing-folder-relative']) {
  briefingPaths.briefingFolderRelative = slashNormalize(args['briefing-folder-relative']);
}
if (args['briefing-folder-terminal-path']) {
  briefingPaths.briefingFolderTerminalPath = windowsPathToWslPath(args['briefing-folder-terminal-path']);
}
if (args['briefing-folder-windows-path']) {
  briefingPaths.briefingFolderWindowsPath = args['briefing-folder-windows-path'];
}

const promptText = buildCodexPrompt({
  dateLabel,
  briefingFolder,
  ...briefingPaths,
  briefingText,
  paragraphBlocks,
  briefingFileName
});

const promptPath = path.join(outputFolder, 'codex-briefing-prompt.md');
fs.writeFileSync(promptPath, promptText);

const emptyFiles = createEmptyAnalysisFiles({dateLabel});
for (const [fileName, value] of Object.entries(emptyFiles)) {
  const filePath = path.join(briefingFolder, fileName);
  if (!fs.existsSync(filePath) || args.force) {
    writeJson(filePath, value);
  }
}

console.log(`Prepared Codex briefing pack in ${outputFolder}`);
console.log(`Prompt file: ${promptPath}`);
console.log(`Build command after Codex fills the JSON files: npm run briefing:build:folder -- --folder briefings/${dateLabel}`);
