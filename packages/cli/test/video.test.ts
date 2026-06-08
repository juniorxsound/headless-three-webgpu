import { describe, expect, it } from "vitest";

import { frameProgress } from "../src/video.js";

describe("frameProgress", () => {
  it("returns 0 for a single frame", () => {
    expect(frameProgress("turntable", 0, 1)).toBe(0);
    expect(frameProgress("dolly-in", 0, 1)).toBe(0);
  });

  it("loops turntable seamlessly without reaching 1", () => {
    expect(frameProgress("turntable", 0, 4)).toBe(0);
    expect(frameProgress("turntable", 2, 4)).toBe(0.5);
    expect(frameProgress("turntable", 3, 4)).toBe(0.75);
  });

  it("travels a dolly fully from 0 to 1", () => {
    expect(frameProgress("dolly-in", 0, 5)).toBe(0);
    expect(frameProgress("dolly-in", 4, 5)).toBe(1);
    expect(frameProgress("dolly-out", 2, 5)).toBe(0.5);
  });
});
