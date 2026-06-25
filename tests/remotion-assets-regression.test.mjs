import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {createAssetResolver, safeFilePart} from '../scripts/lib/remotion-assets.mjs';

// The asset resolver does real fs copies, so the regression is behavioral:
// it must reproduce the briefing renderer's copy/resolve semantics — return the
// normalized relative target, copy the file into the staging dir, pass through
// http/file URLs untouched, return null for missing sources, and cache logos.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'duel-assets-'));

test('safeFilePart sanitizes and falls back to "asset"', () => {
  assert.equal(safeFilePart('Aa_1.png'), 'Aa_1.png');
  assert.equal(safeFilePart('a b/c?d'), 'a-b-c-d');
  assert.equal(safeFilePart('***'), 'asset');
  assert.equal(safeFilePart('--x--'), 'x');
});

test('copyAsset copies into staging dir and returns normalized relative path', () => {
  const root = tmp();
  const outputFolder = path.join(root, 'output');
  const assetsFolder = path.join(root, 'assets');
  fs.mkdirSync(outputFolder, {recursive: true});
  fs.mkdirSync(assetsFolder, {recursive: true});
  const src = path.join(outputFolder, 'clip.wav');
  fs.writeFileSync(src, 'audio-bytes');

  const {copyAsset} = createAssetResolver({outputFolder, assetsFolder, cwd: root});
  const rel = copyAsset(src, 'audio/clip.wav');
  assert.equal(rel, 'audio/clip.wav');
  assert.equal(fs.readFileSync(path.join(assetsFolder, 'audio/clip.wav'), 'utf8'), 'audio-bytes');
  // missing source → null, no throw
  assert.equal(copyAsset(path.join(outputFolder, 'nope.wav'), 'audio/nope.wav'), null);
  assert.equal(copyAsset(null, 'x'), null);
});

test('resolveAudioSrc: relative copies, http/file pass through, empty → null', () => {
  const root = tmp();
  const outputFolder = path.join(root, 'output');
  const assetsFolder = path.join(root, 'assets');
  fs.mkdirSync(path.join(outputFolder, 'audio'), {recursive: true});
  fs.mkdirSync(assetsFolder, {recursive: true});
  fs.writeFileSync(path.join(outputFolder, 'audio', 'duel-01.wav'), 'a');

  const {resolveAudioSrc} = createAssetResolver({outputFolder, assetsFolder, cwd: root});
  assert.equal(resolveAudioSrc('audio/duel-01.wav'), 'audio/duel-01.wav');
  assert.ok(fs.existsSync(path.join(assetsFolder, 'audio/duel-01.wav')));
  assert.equal(resolveAudioSrc('https://cdn/x.wav'), 'https://cdn/x.wav');
  assert.equal(resolveAudioSrc('file:///tmp/x.wav'), 'file:///tmp/x.wav');
  assert.equal(resolveAudioSrc(''), null);
  assert.equal(resolveAudioSrc(null), null);
});

test('getLogoSrc resolves from logos dir, caches, and null-falls-back on miss', () => {
  const root = tmp();
  const outputFolder = path.join(root, 'output');
  const assetsFolder = path.join(root, 'assets');
  const logosDir = path.join(root, 'logos');
  fs.mkdirSync(outputFolder, {recursive: true});
  fs.mkdirSync(assetsFolder, {recursive: true});
  fs.mkdirSync(logosDir, {recursive: true});
  fs.writeFileSync(path.join(logosDir, 'alakhbar-logo.png'), 'png');

  const {getLogoSrc} = createAssetResolver({outputFolder, assetsFolder, cwd: root, logosDir});
  assert.equal(getLogoSrc('alakhbar-logo.png'), 'outlet-logos/alakhbar-logo.png');
  assert.ok(fs.existsSync(path.join(assetsFolder, 'outlet-logos/alakhbar-logo.png')));
  // cached: second call returns same value even after the source is removed
  fs.rmSync(path.join(logosDir, 'alakhbar-logo.png'));
  assert.equal(getLogoSrc('alakhbar-logo.png'), 'outlet-logos/alakhbar-logo.png');
  // missing logo → null (briefing renderer warns on this), empty → null
  assert.equal(getLogoSrc('missing-logo.png'), null);
  assert.equal(getLogoSrc(null), null);
});

test('default logos dir is <cwd>/public/outlet-logos', () => {
  const root = tmp();
  const assetsFolder = path.join(root, 'assets');
  const logosDir = path.join(root, 'public', 'outlet-logos');
  fs.mkdirSync(assetsFolder, {recursive: true});
  fs.mkdirSync(logosDir, {recursive: true});
  fs.writeFileSync(path.join(logosDir, 'x-logo.png'), 'png');

  const {getLogoSrc} = createAssetResolver({outputFolder: root, assetsFolder, cwd: root});
  assert.equal(getLogoSrc('x-logo.png'), 'outlet-logos/x-logo.png');
});
