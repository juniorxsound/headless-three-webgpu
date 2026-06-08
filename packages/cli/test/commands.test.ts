import { describe, expect, it } from "vitest";

import {
  buildBenchOptions,
  buildRenderOptions,
  parseLight,
  parseVector3,
  resolveFormat,
  resolveOutputPath,
} from "../src/commands.js";

describe("cli helpers", () => {
  it("parses comma-separated vectors", () => {
    expect(parseVector3("1, 2, 3")).toEqual([1, 2, 3]);
  });

  it("rejects invalid vectors", () => {
    expect(() => parseVector3("1,2")).toThrow("Expected a comma-separated vector");
  });

  it("parses custom light JSON", () => {
    expect(
      parseLight('{"type":"point","position":[2,3,4],"intensity":1.1,"color":"#ffffff"}'),
    ).toEqual({
      type: "point",
      position: [2, 3, 4],
      intensity: 1.1,
      color: "#ffffff",
    });
  });

  it("defaults output format from file extension", () => {
    expect(resolveFormat(undefined, "/tmp/frame.webp")).toBe("webp");
    expect(resolveFormat(undefined, "/tmp/frame.png")).toBe("png");
  });

  it("derives an output path when one is not provided", () => {
    expect(resolveOutputPath("/tmp/model.glb", undefined, "png")).toBe("/tmp/model.png");
  });

  it("builds render options for the helpers package", () => {
    const { render, outputPath } = buildRenderOptions("/tmp/model.glb", {
      width: 800,
      height: 600,
      lighting: "studio",
      ambientIntensity: 0.5,
      keyIntensity: 1.25,
      keyPosition: "4,5,6",
      light: ['{"type":"point","position":[2,3,4],"intensity":0.75}'],
      cameraPosition: "1,2,3",
      cameraTarget: "0,0,0",
    });

    expect(render).toMatchObject({
      path: "/tmp/model.glb",
      width: 800,
      height: 600,
      format: "png",
      lighting: {
        preset: "studio",
        ambientIntensity: 0.5,
        keyIntensity: 1.25,
        keyPosition: [4, 5, 6],
        lights: [
          {
            type: "point",
            position: [2, 3, 4],
            intensity: 0.75,
          },
        ],
      },
      camera: {
        position: [1, 2, 3],
        target: [0, 0, 0],
      },
    });
    expect(outputPath).toBe("/tmp/model.png");
  });

  it("builds benchmark options for the core package", () => {
    expect(
      buildBenchOptions({
        width: 512,
        height: 512,
        iterations: 3,
        format: "webp",
      }),
    ).toMatchObject({
      width: 512,
      height: 512,
      iterations: 3,
      format: "webp",
    });
  });
});
