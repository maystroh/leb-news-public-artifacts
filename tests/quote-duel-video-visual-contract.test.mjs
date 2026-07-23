import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'QuoteDuelVideo.jsx'), 'utf8');

test('QuoteDuel short-video hook keeps the approved front-page line', () => {
  assert.match(source, /نفس الحدث غير رواية/);
  assert.doesNotMatch(source, /intro\?\.title \|\| 'ثنائية الاقتباسات'/);
});

test('QuoteDuel short-video outro stays as the old branded ending, without the open question body', () => {
  assert.match(source, /الصحافة اليوم/);
  assert.doesNotMatch(source, /outro\.body/);
});
