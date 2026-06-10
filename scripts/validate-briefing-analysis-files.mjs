import {parseCliArgs, resolveBriefingFolder} from './lib/briefing-helpers.mjs';
import {validateBriefingAnalysisFolder} from './lib/validate-briefing-analysis.mjs';

const cwd = process.cwd();
const args = parseCliArgs(process.argv.slice(2));
const briefingFolder = resolveBriefingFolder(cwd, args.folder);
const errors = validateBriefingAnalysisFolder(briefingFolder);

if (errors.length > 0) {
  console.error(`Analysis files are not ready in ${briefingFolder}.`);
  console.error('Fill the generated JSON files before building:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Analysis files are ready in ${briefingFolder}`);
