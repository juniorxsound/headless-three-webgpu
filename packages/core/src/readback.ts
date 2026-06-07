export function alignWidthForWebGpuRgba8(width: number): number {
  return Math.max(64, Math.ceil(width / 64) * 64);
}

export function cropRgbaCenter(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8Array {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    const expectedBytes = targetWidth * targetHeight * 4;
    return source.byteLength === expectedBytes ? source : source.slice(0, expectedBytes);
  }

  if (sourceWidth < targetWidth || sourceHeight < targetHeight) {
    throw new Error(
      `Cannot crop ${sourceWidth}x${sourceHeight} into larger ${targetWidth}x${targetHeight}`,
    );
  }

  const offsetX = Math.floor((sourceWidth - targetWidth) / 2);
  const offsetY = Math.floor((sourceHeight - targetHeight) / 2);
  const output = new Uint8Array(targetWidth * targetHeight * 4);
  const sourceRowBytes = sourceWidth * 4;
  const targetRowBytes = targetWidth * 4;
  const sourceOffsetBytes = offsetY * sourceRowBytes + offsetX * 4;

  for (let y = 0; y < targetHeight; y += 1) {
    output.set(
      source.subarray(
        sourceOffsetBytes + y * sourceRowBytes,
        sourceOffsetBytes + y * sourceRowBytes + targetRowBytes,
      ),
      y * targetRowBytes,
    );
  }

  return output;
}

export function deflateRgba8UnormRows(
  source: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
): Uint8Array {
  const rowBytes = width * 4;
  if (bytesPerRow === rowBytes) {
    return source.slice(0, rowBytes * height);
  }

  const output = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * bytesPerRow;
    const targetOffset = y * rowBytes;
    output.set(source.subarray(sourceOffset, sourceOffset + rowBytes), targetOffset);
  }
  return output;
}

export function rgbaReadbackBytesPerRow(width: number, bytesPerTexel = 4): number {
  return Math.ceil((width * bytesPerTexel) / 256) * 256;
}

export function asUint8Bytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}
