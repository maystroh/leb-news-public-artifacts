import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {spawnSync} from 'node:child_process';

const cwd = process.cwd();
const registryPath = path.join(cwd, 'briefing-formats.json');

if (!fs.existsSync(registryPath)) {
  console.error(`Missing format registry: ${registryPath}`);
  process.exit(1);
}

const formats = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const args = process.argv.slice(2);
const wantsList = args.includes('--list');
const wantsOpen = args.includes('--open');
const selection = args.find((arg) => !arg.startsWith('--')) ?? null;

const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const printFormats = () => {
  console.log('Available briefing formats:\n');

  for (const format of formats) {
    const suffix = format.default ? ' (default)' : '';
    console.log(`- ${format.id}${suffix}`);
    console.log(`  ${format.label}`);
    console.log(`  ${format.description}`);
    console.log(`  HTML: ${format.htmlFile}\n`);
  }

  console.log('Usage:');
  console.log('  npm run briefing:launch -- <format-id>');
  console.log('  npm run briefing:launch -- <format-id> --open');
};

if (wantsList) {
  printFormats();
  process.exit(0);
}

const defaultFormat = formats.find((format) => format.default) ?? formats[0];
const selectedFormat = selection
  ? formats.find((format) => normalize(format.id) === normalize(selection) || normalize(format.label) === normalize(selection))
  : defaultFormat;

if (!selectedFormat) {
  console.error(`Unknown briefing format: ${selection}\n`);
  printFormats();
  process.exit(1);
}

if (selectedFormat.buildCommand) {
  console.log(`Building format: ${selectedFormat.label}`);
  const buildResult = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', selectedFormat.buildCommand],
    {
      cwd,
      stdio: 'inherit'
    }
  );

  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }
}

const htmlPath = path.resolve(cwd, selectedFormat.htmlFile);

if (!fs.existsSync(htmlPath)) {
  console.error(`Configured HTML file does not exist: ${htmlPath}`);
  process.exit(1);
}

console.log(`Selected format: ${selectedFormat.label}`);
console.log(`HTML file: ${htmlPath}`);

if (!wantsOpen) {
  process.exit(0);
}

const child = spawn(
  'powershell',
  ['-NoProfile', '-Command', `Start-Process -FilePath '${htmlPath.replace(/'/g, "''")}'`],
  {
    cwd,
    stdio: 'ignore',
    detached: true
  }
);

child.unref();
