// Hamsa streams TTS, so the WAV header arrives with 0xFFFFFFFF placeholder
// sizes that are never patched once the stream ends. ffmpeg then reports
// "Packet corrupt" at EOF for every file. Fix the RIFF and chunk sizes in
// place; returns true when the buffer was modified.
export const patchWavHeaderSizes = (buffer) => {
  if (buffer.length < 44
    || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    return false;
  }

  let modified = false;

  const actualRiffSize = buffer.length - 8;
  if (buffer.readUInt32LE(4) !== actualRiffSize) {
    buffer.writeUInt32LE(actualRiffSize, 4);
    modified = true;
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const maxSize = buffer.length - chunkStart;
    const effectiveSize = chunkSize > maxSize ? maxSize : chunkSize;
    if (chunkSize > maxSize) {
      buffer.writeUInt32LE(maxSize, offset + 4);
      modified = true;
    }
    offset = chunkStart + effectiveSize + (effectiveSize % 2);
  }

  return modified;
};
