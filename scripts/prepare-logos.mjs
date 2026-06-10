import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const inputDir = path.join(process.cwd(), 'logos');
const outputDir = path.join(inputDir, 'video-ready-png');
const publicDir = path.join(process.cwd(), 'public', 'outlet-logos');
const manifestPath = path.join(outputDir, 'manifest.json');

const targetWidth = 320;
const targetHeight = 160;
const insetWidth = 280;
const insetHeight = 120;
const supportedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const opaqueTrimTolerance = 18;

async function buildTrimmedPipeline(inputPath, metadata) {
  const source = sharp(inputPath, {density: 300});

  if (metadata.hasAlpha) {
    return source.trim();
  }

  const {data, info} = await source
    .raw()
    .toBuffer({resolveWithObject: true});

  const corners = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1]
  ];

  const bg = corners.reduce(
    (acc, [x, y]) => {
      const index = (y * info.width + x) * info.channels;
      acc.r += data[index];
      acc.g += data[index + 1];
      acc.b += data[index + 2];
      return acc;
    },
    {r: 0, g: 0, b: 0}
  );

  bg.r = Math.round(bg.r / corners.length);
  bg.g = Math.round(bg.g / corners.length);
  bg.b = Math.round(bg.b / corners.length);

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels;
      const dr = Math.abs(data[index] - bg.r);
      const dg = Math.abs(data[index + 1] - bg.g);
      const db = Math.abs(data[index + 2] - bg.b);

      if (dr > opaqueTrimTolerance || dg > opaqueTrimTolerance || db > opaqueTrimTolerance) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX === -1 || maxY === -1) {
    return source;
  }

  return source.extract({
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  });
}

const files = fs
  .readdirSync(inputDir, {withFileTypes: true})
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => supportedExtensions.has(path.extname(name).toLowerCase()));

fs.mkdirSync(outputDir, {recursive: true});
fs.mkdirSync(publicDir, {recursive: true});

const manifest = [];

for (const filename of files) {
  const inputPath = path.join(inputDir, filename);
  const baseName = path.basename(filename, path.extname(filename));
  const outputPath = path.join(outputDir, `${baseName}.png`);
  const publicPath = path.join(publicDir, `${baseName}.png`);

  const source = sharp(inputPath, {density: 300});
  const metadata = await source.metadata();
  const pipeline = await buildTrimmedPipeline(inputPath, metadata);

  await pipeline
    .resize({
      width: insetWidth,
      height: insetHeight,
      fit: 'contain',
      background: {r: 0, g: 0, b: 0, alpha: 0}
    })
    .extend({
      top: Math.floor((targetHeight - insetHeight) / 2),
      bottom: Math.ceil((targetHeight - insetHeight) / 2),
      left: Math.floor((targetWidth - insetWidth) / 2),
      right: Math.ceil((targetWidth - insetWidth) / 2),
      background: {r: 0, g: 0, b: 0, alpha: 0}
    })
    .png()
    .toFile(outputPath);

  fs.copyFileSync(outputPath, publicPath);

  const outputMetadata = await sharp(outputPath).metadata();
  manifest.push({
    sourceFile: filename,
    outputFile: `${baseName}.png`,
    publicPath: `/outlet-logos/${baseName}.png`,
    width: outputMetadata.width,
    height: outputMetadata.height
  });
}

fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      targetSize: {width: targetWidth, height: targetHeight},
      innerFitSize: {width: insetWidth, height: insetHeight},
      usageSuggestion: {
        displayWidth: 180,
        displayHeight: 90,
        note: 'Recommended outlet badge size for the current vertical composition.'
      },
      logos: manifest
    },
    null,
    2
  )
);

console.log(`Prepared ${manifest.length} logos in ${outputDir}`);
