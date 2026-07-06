import { describe, expect, it } from "vitest";

import {
  alignWidthForWebGpuRgba8,
  asUint8Bytes,
  convertLinearRgba8ToSrgb,
  cropRgbaCenter,
  deflateRgba8UnormRows,
  toLinearRgba8Buffer,
} from "../src/readback.js";

describe("readback helpers", () => {
  it("aligns widths to 256-byte rows for RGBA8", () => {
    expect(alignWidthForWebGpuRgba8(1)).toBe(64);
    expect(alignWidthForWebGpuRgba8(64)).toBe(64);
    expect(alignWidthForWebGpuRgba8(65)).toBe(128);
  });

  it("deflates padded rows into tightly packed pixels", () => {
    const padded = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    expect(deflateRgba8UnormRows(padded, 1, 2, 8)).toEqual(
      new Uint8Array([1, 2, 3, 4, 9, 10, 11, 12]),
    );
  });

  it("returns a tight view when rows are already packed", () => {
    const packed = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 99, 100]);
    const deflated = deflateRgba8UnormRows(packed, 1, 2, 4);

    expect(deflated).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(deflated.buffer).toBe(packed.buffer);
  });

  it("wraps Uint8Array-compatible readback views without cloning", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(asUint8Bytes(bytes)).toBe(bytes);

    const words = new Uint16Array([0x0201, 0x0403]);
    expect(asUint8Bytes(words).buffer).toBe(words.buffer);
  });

  it("crops a source image around the center", () => {
    const pixels = new Uint8Array([
      1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255, 7, 0, 0,
      255, 8, 0, 0, 255, 9, 0, 0, 255,
    ]);

    expect(cropRgbaCenter(pixels, 3, 3, 1, 1)).toEqual(new Uint8Array([5, 0, 0, 255]));
  });

  it("converts linear RGBA8 pixels into sRGB output bytes", () => {
    expect(convertLinearRgba8ToSrgb(new Uint8Array([128, 128, 128, 255, 64, 32, 16, 128]))).toEqual(
      new Uint8Array([188, 188, 188, 255, 137, 99, 71, 128]),
    );
  });

  it("preserves linear pixel values when converting HDR readback to bytes", () => {
    expect(toLinearRgba8Buffer(new Float32Array([0.25, 0.5, 0.75, 1]), 1, 1)).toEqual(
      new Uint8Array([64, 128, 191, 255]),
    );
  });
});
