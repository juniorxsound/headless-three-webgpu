import { DataUtils } from "three";

const LINEAR_U8_TO_SRGB_U8 = buildLinearU8ToSrgbU8Lut();
const SRGB_TRANSFER_LUT_SIZE = 4096;
const HALF_FLOAT_LUT_SIZE = 0x10000;
const SRGB_DITHER_STEP = 0.5 / 255;
const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const BAYER_OFFSETS = buildBayerOffsets();
const HALF_FLOAT_TO_FLOAT = buildHalfFloatToFloatLut();
const SRGB_TRANSFER_LUT = buildSrgbTransferLut();

function buildLinearU8ToSrgbU8Lut(): Uint8Array {
  const lut = new Uint8Array(256);

  for (let index = 0; index < lut.length; index += 1) {
    const linear = index / 255;
    const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    lut[index] = Math.max(0, Math.min(255, Math.round(srgb * 255)));
  }

  return lut;
}

function buildSrgbTransferLut(): Float32Array {
  const lut = new Float32Array(SRGB_TRANSFER_LUT_SIZE);

  for (let index = 0; index < lut.length; index += 1) {
    const linear = index / (SRGB_TRANSFER_LUT_SIZE - 1);
    const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    lut[index] = Math.max(0, Math.min(1, srgb));
  }

  return lut;
}

function buildBayerOffsets(): Float32Array {
  const offsets = new Float32Array(BAYER_4X4.length);

  for (let index = 0; index < BAYER_4X4.length; index += 1) {
    offsets[index] = ((BAYER_4X4[index]! + 0.5) / 16 - 0.5) * 2 * SRGB_DITHER_STEP;
  }

  return offsets;
}

function buildHalfFloatToFloatLut(): Float32Array {
  const lut = new Float32Array(HALF_FLOAT_LUT_SIZE);

  for (let index = 0; index < lut.length; index += 1) {
    lut[index] = DataUtils.fromHalfFloat(index);
  }

  return lut;
}

function linearToSrgb(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  const index = Math.round(clamped * (SRGB_TRANSFER_LUT_SIZE - 1));
  return SRGB_TRANSFER_LUT[Math.max(0, Math.min(SRGB_TRANSFER_LUT_SIZE - 1, index))]!;
}

function quantizeSrgb8(value: number, ditherOffset: number): number {
  return Math.round(Math.max(0, Math.min(1, value + ditherOffset)) * 255);
}

function quantizeAlpha8(alpha: number): number {
  return Math.min(255, Math.max(0, Math.round(alpha * 255)));
}

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
    return source.subarray(0, rowBytes * height);
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
  if (view instanceof Uint8Array) {
    return view;
  }

  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function asHdrPixels(source: ArrayBufferView): Float32Array | Uint16Array {
  if (source instanceof Float32Array || source instanceof Uint16Array) {
    return source;
  }

  throw new Error("Unexpected HDR readback type");
}

export function convertLinearRgba8ToSrgb(source: Uint8Array): Uint8Array {
  const output = new Uint8Array(source.length);

  for (let index = 0; index < source.length; index += 4) {
    output[index] = LINEAR_U8_TO_SRGB_U8[source[index]!]!;
    output[index + 1] = LINEAR_U8_TO_SRGB_U8[source[index + 1]!]!;
    output[index + 2] = LINEAR_U8_TO_SRGB_U8[source[index + 2]!]!;
    output[index + 3] = source[index + 3]!;
  }

  return output;
}

function quantizeLinear8(value: number): number {
  return Math.min(255, Math.max(0, Math.round(Math.max(0, Math.min(1, value)) * 255)));
}

function toLinearRgba8BufferFromFloat32(
  source: Float32Array,
  width: number,
  height: number,
): Uint8Array {
  const floatsPerRow = rgbaReadbackBytesPerRow(width, 16) / source.BYTES_PER_ELEMENT;
  const output = new Uint8Array(width * height * 4);

  let destIndex = 0;
  for (let y = 0; y < height; y += 1) {
    const srcRowStart = y * floatsPerRow;
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = srcRowStart + x * 4;
      output[destIndex++] = quantizeLinear8(source[sourceIndex]!);
      output[destIndex++] = quantizeLinear8(source[sourceIndex + 1]!);
      output[destIndex++] = quantizeLinear8(source[sourceIndex + 2]!);
      output[destIndex++] = quantizeLinear8(source[sourceIndex + 3]!);
    }
  }

  return output;
}

function toLinearRgba8BufferFromHalfFloat(
  source: Uint16Array,
  width: number,
  height: number,
): Uint8Array {
  const halfFloatsPerRow = rgbaReadbackBytesPerRow(width, 8) / source.BYTES_PER_ELEMENT;
  const output = new Uint8Array(width * height * 4);

  let destIndex = 0;
  for (let y = 0; y < height; y += 1) {
    const srcRowStart = y * halfFloatsPerRow;
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = srcRowStart + x * 4;
      output[destIndex++] = quantizeLinear8(HALF_FLOAT_TO_FLOAT[source[sourceIndex]!]!);
      output[destIndex++] = quantizeLinear8(HALF_FLOAT_TO_FLOAT[source[sourceIndex + 1]!]!);
      output[destIndex++] = quantizeLinear8(HALF_FLOAT_TO_FLOAT[source[sourceIndex + 2]!]!);
      output[destIndex++] = quantizeLinear8(HALF_FLOAT_TO_FLOAT[source[sourceIndex + 3]!]!);
    }
  }

  return output;
}

export function toLinearRgba8Buffer(
  source: Float32Array | Uint16Array,
  width: number,
  height: number,
): Uint8Array {
  if (source instanceof Uint16Array) {
    return toLinearRgba8BufferFromHalfFloat(source, width, height);
  }

  return toLinearRgba8BufferFromFloat32(source, width, height);
}

function toSrgbRgba8BufferFromFloat32(
  source: Float32Array,
  width: number,
  height: number,
): Uint8Array {
  const floatsPerRow = rgbaReadbackBytesPerRow(width, 16) / source.BYTES_PER_ELEMENT;
  const output = new Uint8Array(width * height * 4);

  let destIndex = 0;
  for (let y = 0; y < height; y += 1) {
    const srcRowStart = y * floatsPerRow;
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = srcRowStart + x * 4;
      const baseIndex = ((y & 3) << 2) | (x & 3);
      const rOffset = BAYER_OFFSETS[baseIndex]!;
      const gOffset = BAYER_OFFSETS[(((y + 1) & 3) << 2) | ((x + 1) & 3)]!;
      const bOffset = BAYER_OFFSETS[(((y + 2) & 3) << 2) | ((x + 2) & 3)]!;
      output[destIndex++] = quantizeSrgb8(linearToSrgb(source[sourceIndex]!), rOffset);
      output[destIndex++] = quantizeSrgb8(linearToSrgb(source[sourceIndex + 1]!), gOffset);
      output[destIndex++] = quantizeSrgb8(linearToSrgb(source[sourceIndex + 2]!), bOffset);
      output[destIndex++] = quantizeAlpha8(source[sourceIndex + 3]!);
    }
  }

  return output;
}

function toSrgbRgba8BufferFromHalfFloat(
  source: Uint16Array,
  width: number,
  height: number,
): Uint8Array {
  const halfFloatsPerRow = rgbaReadbackBytesPerRow(width, 8) / source.BYTES_PER_ELEMENT;
  const output = new Uint8Array(width * height * 4);

  let destIndex = 0;
  for (let y = 0; y < height; y += 1) {
    const srcRowStart = y * halfFloatsPerRow;
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = srcRowStart + x * 4;
      const baseIndex = ((y & 3) << 2) | (x & 3);
      const rOffset = BAYER_OFFSETS[baseIndex]!;
      const gOffset = BAYER_OFFSETS[(((y + 1) & 3) << 2) | ((x + 1) & 3)]!;
      const bOffset = BAYER_OFFSETS[(((y + 2) & 3) << 2) | ((x + 2) & 3)]!;
      output[destIndex++] = quantizeSrgb8(
        linearToSrgb(HALF_FLOAT_TO_FLOAT[source[sourceIndex]!]!),
        rOffset,
      );
      output[destIndex++] = quantizeSrgb8(
        linearToSrgb(HALF_FLOAT_TO_FLOAT[source[sourceIndex + 1]!]!),
        gOffset,
      );
      output[destIndex++] = quantizeSrgb8(
        linearToSrgb(HALF_FLOAT_TO_FLOAT[source[sourceIndex + 2]!]!),
        bOffset,
      );
      output[destIndex++] = quantizeAlpha8(HALF_FLOAT_TO_FLOAT[source[sourceIndex + 3]!]!);
    }
  }

  return output;
}

export function toSrgbRgba8Buffer(
  source: Float32Array | Uint16Array,
  width: number,
  height: number,
): Uint8Array {
  if (source instanceof Uint16Array) {
    return toSrgbRgba8BufferFromHalfFloat(source, width, height);
  }

  return toSrgbRgba8BufferFromFloat32(source, width, height);
}
