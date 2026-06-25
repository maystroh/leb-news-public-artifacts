// Remotion asset plumbing — extracted from render-briefing-video.mjs so the
// quote-duel render reuses the exact copy/resolve helpers. A factory binds the
// folders (output dir, the per-render remotion-assets staging dir, repo cwd,
// logos dir) so each renderer gets its own logo cache. Behaviour preserved
// verbatim from the briefing renderer.

import fs from 'node:fs';
import path from 'node:path';

export const safeFilePart = (value) =>
  String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';

/**
 * @param {object} cfg
 * @param {string} cfg.outputFolder - the briefing/<date>/output dir (audio srcs resolve relative to it)
 * @param {string} cfg.assetsFolder - the per-render remotion-assets staging dir (copy target root)
 * @param {string} cfg.cwd - repo root
 * @param {string} [cfg.logosDir] - defaults to <cwd>/public/outlet-logos
 */
export const createAssetResolver = ({outputFolder, assetsFolder, cwd, logosDir}) => {
  const resolvedLogosDir = logosDir ?? path.join(cwd, 'public', 'outlet-logos');

  const resolveFromOutput = (relativePath) => path.resolve(outputFolder, relativePath);

  const copyAsset = (sourcePath, targetRelativePath) => {
    if (!sourcePath || !fs.existsSync(sourcePath)) return null;
    const normalizedTarget = targetRelativePath.replace(/\\/g, '/');
    const targetPath = path.join(assetsFolder, normalizedTarget);
    fs.mkdirSync(path.dirname(targetPath), {recursive: true});
    fs.copyFileSync(sourcePath, targetPath);
    return normalizedTarget;
  };

  const resolveAudioSrc = (src) => {
    if (!src) return null;
    if (/^(https?|file):/i.test(src)) return src;
    const sourcePath = resolveFromOutput(src);
    return copyAsset(sourcePath, `audio/${path.basename(sourcePath)}`);
  };

  const logoSrcByFile = new Map();
  const getLogoSrc = (logoFile) => {
    if (!logoFile) return null;
    if (logoSrcByFile.has(logoFile)) return logoSrcByFile.get(logoFile);
    const logoPath = path.join(resolvedLogosDir, logoFile);
    const src = copyAsset(logoPath, `outlet-logos/${logoFile}`);
    logoSrcByFile.set(logoFile, src);
    return src;
  };

  return {safeFilePart, resolveFromOutput, copyAsset, resolveAudioSrc, getLogoSrc};
};
