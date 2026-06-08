import { describe, expect, it } from "vitest";

import {
  buildBenchOptions,
  buildRenderOptions,
  buildRenderPlan,
  buildVideoPlan,
  parseLight,
  parseVector3,
  resolveFormat,
  resolveOutputPath,
  resolveVideoContainer,
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
      envMap: "/tmp/studio.hdr",
      envBackground: true,
      envBlur: 0.25,
      envIntensity: 1.4,
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
      environment: {
        path: "/tmp/studio.hdr",
        background: true,
        blur: 0.25,
        intensity: 1.4,
      },
    });
    expect(outputPath).toBe("/tmp/model.png");
  });

  it("rejects environment controls without an environment map", () => {
    expect(() =>
      buildRenderOptions("/tmp/model.glb", {
        width: 800,
        height: 600,
        envIntensity: 1.2,
      }),
    ).toThrow("Use --env-map when setting --env-intensity");
  });

  it("rejects blur without using the environment as background", () => {
    expect(() =>
      buildRenderOptions("/tmp/model.glb", {
        width: 800,
        height: 600,
        envMap: "/tmp/studio.hdr",
        envBlur: 0.5,
      }),
    ).toThrow("Use --env-background when setting --env-blur");
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

  it("builds a JS render plan", () => {
    expect(
      buildRenderPlan(undefined, {
        js: "/tmp/scene.mjs",
        width: 640,
        height: 480,
      }),
    ).toEqual({
      kind: "js",
      modulePath: "/tmp/scene.mjs",
      outputPath: "/tmp/scene.png",
      width: 640,
      height: 480,
      format: "png",
    });
  });

  it("rejects mixing a file argument with --js", () => {
    expect(() =>
      buildRenderPlan("/tmp/model.glb", {
        js: "/tmp/scene.mjs",
        width: 640,
        height: 480,
      }),
    ).toThrow("Use either a GLTF/GLB <file> argument or --js <path>, not both");
  });

  it("rejects environment maps for JS renders", () => {
    expect(() =>
      buildRenderPlan(undefined, {
        js: "/tmp/scene.mjs",
        width: 640,
        height: 480,
        envMap: "/tmp/studio.hdr",
      }),
    ).toThrow("Environment map options are currently only supported for GLTF/GLB renders");
  });

  it("infers the video container from the output extension", () => {
    expect(resolveVideoContainer("/tmp/out.mp4")).toBe("mp4");
    expect(resolveVideoContainer("/tmp/out.WEBM")).toBe("webm");
    expect(resolveVideoContainer("/tmp/out.gif")).toBe("gif");
  });

  it("rejects unsupported video output extensions", () => {
    expect(() => resolveVideoContainer("/tmp/out.avi")).toThrow("Unsupported video output");
  });

  it("builds a GLTF turntable video plan and derives the frame count", () => {
    const plan = buildVideoPlan("/tmp/model.glb", {
      output: "/tmp/out.mp4",
      width: 1280,
      height: 720,
      camera: "turntable",
      fps: 30,
      duration: 4,
      degrees: 360,
      lighting: "studio",
    });

    expect(plan).toMatchObject({
      kind: "gltf",
      container: "mp4",
      outputPath: "/tmp/out.mp4",
      fps: 30,
      durationSeconds: 4,
      frames: 120,
      width: 1280,
      height: 720,
      camera: "turntable",
      degrees: 360,
      ease: false,
    });
    if (plan.kind === "gltf") {
      expect(plan.render).toMatchObject({ path: "/tmp/model.glb", width: 1280, height: 720 });
    }
  });

  it("builds a JS video plan and carries dawn flags", () => {
    const plan = buildVideoPlan(undefined, {
      js: "/tmp/scene.mjs",
      output: "/tmp/out.webm",
      width: 640,
      height: 480,
      fps: 24,
      duration: 2,
      dawnFlag: ["backend=vulkan"],
    });

    expect(plan).toMatchObject({
      kind: "js",
      container: "webm",
      modulePath: "/tmp/scene.mjs",
      frames: 48,
      dawnFlags: ["backend=vulkan"],
    });
  });

  it("rejects odd dimensions for yuv420p video containers", () => {
    expect(() =>
      buildVideoPlan("/tmp/model.glb", {
        output: "/tmp/out.mp4",
        width: 1281,
        height: 720,
      }),
    ).toThrow("requires even --width and --height");
  });

  it("allows odd dimensions for gif output", () => {
    const plan = buildVideoPlan("/tmp/model.glb", {
      output: "/tmp/out.gif",
      width: 641,
      height: 361,
    });
    expect(plan.container).toBe("gif");
  });

  it("rejects environment maps for JS video renders", () => {
    expect(() =>
      buildVideoPlan(undefined, {
        js: "/tmp/scene.mjs",
        output: "/tmp/out.mp4",
        width: 640,
        height: 480,
        envMap: "/tmp/studio.hdr",
      }),
    ).toThrow("Environment map options are currently only supported for GLTF/GLB renders");
  });
});
