import fs from 'node:fs';
import path from 'node:path';

export const parseCliArgs = (argv) => {
  const args = {_: []};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.trim();

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = nextToken;
    index += 1;
  }

  return args;
};

export const encodeBase64 = (value) => Buffer.from(value, 'utf8').toString('base64');

export const decodeBase64TemplateSnippet = (scriptId, indent = '  ') => `${indent}const BRIEFING = JSON.parse(
${indent}  new TextDecoder().decode(
${indent}    Uint8Array.from(
${indent}      atob(document.getElementById('${scriptId}').textContent.trim()),
${indent}      (char) => char.charCodeAt(0)
${indent}    )
${indent}  )
${indent});
`;

export const replaceScriptTagContents = (template, scriptId, rawContent) => {
  const pattern = new RegExp(`(<script id="${scriptId}" type="text/plain">)([\\s\\S]*?)(</script>)`);

  if (!pattern.test(template)) {
    throw new Error(`Template is missing script tag #${scriptId}`);
  }

  return template.replace(pattern, `$1\n${rawContent}\n$3`);
};

export const resolveBriefingFolder = (cwd, folderArg) => {
  if (!folderArg) {
    throw new Error('Missing briefing folder. Pass --folder briefings/YYYY-MM-DD or a date folder path.');
  }

  const candidate = path.resolve(cwd, folderArg);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return candidate;
  }

  const dateCandidate = path.resolve(cwd, 'briefings', folderArg);
  if (fs.existsSync(dateCandidate) && fs.statSync(dateCandidate).isDirectory()) {
    return dateCandidate;
  }

  throw new Error(`Briefing folder does not exist: ${folderArg}`);
};

export const findBriefingTextFile = (briefingFolder) => {
  const folderName = path.basename(briefingFolder);
  const corrected = path.join(briefingFolder, `briefing_${folderName}_corrected.txt`);
  const expected = path.join(briefingFolder, `briefing_${folderName}.txt`);

  if (fs.existsSync(corrected)) {
    return corrected;
  }

  if (fs.existsSync(expected)) {
    return expected;
  }

  const candidates = fs
    .readdirSync(briefingFolder)
    .filter((entry) => entry.toLowerCase().endsWith('.txt'))
    .map((entry) => path.join(briefingFolder, entry));

  const correctedCandidates = candidates.filter((entry) => entry.toLowerCase().endsWith('_corrected.txt'));
  if (correctedCandidates.length === 1) {
    return correctedCandidates[0];
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length === 0) {
    throw new Error(`No .txt briefing source found in ${briefingFolder}`);
  }

  throw new Error(`Multiple .txt briefing sources found in ${briefingFolder}; provide one corrected source named briefing_${folderName}_corrected.txt`);
};

export const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};
