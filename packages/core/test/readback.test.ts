import { describe, expect, it } from "vitest";

import {
  alignWidthForWebGpuRgba8,
  cropRgbaCenter,
  deflateRgba8UnormRows,
} from "../src/readback.js";

describe("readback helpers", () => {
  it("aligns widths to 256-byte rows for RGBA8", () => {
    expect(alignWidthForWebGpuRgba8(1)).toBe(64);
    expect(alignWidthForWebGpuRgba8(64)).toBe(64);
    expect(alignWidthForWebGpuRgba8(65)).toBe(128);
  });

  it("deflates padded rows into tightly packed pixels", () => {
    const padded = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8,
      9, 10, 11, 12, 13, 14, 15, 16,
    ]);

    expect(deflateRgba8UnormRows(padded, 1, 2, 8)).toEqual(new Uint8Array([
      1, 2, 3, 4,
      9, 10, 11, 12,
    ]));
  });

  it("crops a source image around the center", () => {
    const pixels = new Uint8Array([
      1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255,
      4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255,
      7, 0, 0, 255, 8, 0, 0, 255, 9, 0, 0, 255,
    ]);

    expect(cropRgbaCenter(pixels, 3, 3, 1, 1)).toEqual(new Uint8Array([5, 0, 0, 255]));
  });
});
