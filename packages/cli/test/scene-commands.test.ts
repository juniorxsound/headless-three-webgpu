import { describe, expect, it } from "vitest";

import { parseSceneDocument } from "@rendergl/headless-three-webgpu-scene";

import { buildSceneRenderPlan, buildSceneVideoPlan } from "../src/scene-commands.js";

describe("scene command helpers", () => {
  const document = parseSceneDocument({
    schemaVersion: "rgl.scene/v1",
    cameras: {
      cam: {
        id: "cam",
        type: "perspective",
      },
    },
    views: {
      main: {
        id: "main",
        cameraId: "cam",
        output: { width: 1920, height: 1080 },
      },
    },
    sequences: {
      beat: {
        id: "beat",
        duration: 6,
        fps: 24,
        tracks: {},
      },
      outro: {
        id: "outro",
        duration: 2,
        fps: 12,
        tracks: {},
      },
    },
  });

  it("builds a scene render plan", () => {
    expect(
      buildSceneRenderPlan("/tmp/scene.rgl.json", {
        view: "main",
        sequence: "beat",
        time: 2.5,
      }),
    ).toEqual({
      format: "png",
      outputPath: "/tmp/scene.rgl.png",
      viewId: "main",
      sequenceId: "beat",
      time: 2.5,
    });
  });

  it("builds a scene render plan with an explicit image format", () => {
    expect(
      buildSceneRenderPlan("/tmp/scene.rgl.json", {
        format: "webp",
      }),
    ).toMatchObject({
      format: "webp",
      outputPath: "/tmp/scene.rgl.webp",
    });
  });

  it("builds a scene video plan from sequence defaults", () => {
    expect(
      buildSceneVideoPlan("/tmp/scene.rgl.json", document, {
        output: "/tmp/ref.mp4",
        sequence: "beat",
      }),
    ).toMatchObject({
      outputPath: "/tmp/ref.mp4",
      sequenceId: "beat",
      fps: 24,
      durationSeconds: 6,
      frames: 144,
      segments: [
        {
          sequenceId: "beat",
          durationSeconds: 6,
          frames: 144,
        },
      ],
      container: "mp4",
    });
  });

  it("builds a scene video plan for every sequence when no sequence is selected", () => {
    expect(
      buildSceneVideoPlan("/tmp/scene.rgl.json", document, {
        output: "/tmp/ref.mp4",
      }),
    ).toMatchObject({
      outputPath: "/tmp/ref.mp4",
      fps: 24,
      durationSeconds: 8,
      frames: 192,
      segments: [
        {
          sequenceId: "beat",
          durationSeconds: 6,
          frames: 144,
        },
        {
          sequenceId: "outro",
          durationSeconds: 2,
          frames: 48,
        },
      ],
      container: "mp4",
    });
  });

  it("rejects odd mp4 dimensions", () => {
    expect(() =>
      buildSceneVideoPlan("/tmp/scene.rgl.json", document, {
        output: "/tmp/ref.mp4",
        width: 641,
        height: 360,
      }),
    ).toThrow("requires even --width and --height");
  });
});
