import { describe, expect, it } from "vitest";

import {
  evaluateSceneDocument,
  parseSceneDocument,
  sceneDocumentSchema,
  summarizeSceneDocument,
} from "../src/index.js";

describe("scene document", () => {
  const document = parseSceneDocument({
    schemaVersion: "rgl.scene/v1",
    assets: {
      actor: {
        id: "actor",
        kind: "primitive",
        primitive: { type: "box" },
      },
    },
    objects: {
      actorA: {
        id: "actorA",
        source: { type: "asset", assetId: "actor" },
        transform: { position: [0, 0, 0] },
      },
    },
    cameras: {
      "camera-main": {
        id: "camera-main",
        type: "perspective",
        transform: { position: [0, 1.5, 5] },
        target: [0, 1, 0],
      },
    },
    lights: {
      key: {
        id: "key",
        type: "directional",
        transform: { position: [2, 4, 3] },
        target: [0, 1, 0],
        intensity: 1.2,
      },
    },
    views: {
      "view-main": {
        id: "view-main",
        cameraId: "camera-main",
        output: { width: 1280, height: 720 },
      },
    },
    sequences: {
      "sequence-main": {
        id: "sequence-main",
        fps: 24,
        tracks: {
          "camera-push": {
            id: "camera-push",
            target: { type: "camera", id: "camera-main", path: "transform.position" },
            valueType: "vec3",
            keyframes: {
              start: {
                id: "start",
                time: 0,
                value: [0, 1.5, 5],
              },
              end: {
                id: "end",
                time: 4,
                value: [0, 1.5, 3.5],
                interpolation: "linear",
              },
            },
          },
        },
      },
    },
    activeViewId: "view-main",
    activeSequenceId: "sequence-main",
  });

  it("summarizes the scene document", () => {
    expect(summarizeSceneDocument(document)).toEqual({
      assets: 1,
      objects: 1,
      cameras: 1,
      lights: 1,
      views: 1,
      sequences: 1,
      tracks: 1,
      keyframes: 2,
    });
  });

  it("evaluates keyed values at a point in time", () => {
    const evaluated = evaluateSceneDocument(document, { time: 2 });
    expect(evaluated.sequenceId).toBe("sequence-main");
    expect(evaluated.cameras["camera-main"]?.transform?.position).toEqual([0, 1.5, 4.25]);
  });

  it("rejects invalid references", () => {
    expect(() =>
      parseSceneDocument({
        schemaVersion: "rgl.scene/v1",
        objects: {
          orphan: {
            id: "orphan",
            source: { type: "asset", assetId: "missing" },
          },
        },
        cameras: {},
        lights: {},
        views: {},
        sequences: {},
      }),
    ).toThrow("Object assetId must reference an existing asset.");
  });

  it("rejects mismatched record keys", () => {
    const result = sceneDocumentSchema.safeParse({
      schemaVersion: "rgl.scene/v1",
      assets: {
        box: {
          id: "other-box",
          kind: "primitive",
          primitive: { type: "box" },
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'assets map key "box" must match embedded id "other-box".',
    );
  });

  it("rejects cyclic parent relationships", () => {
    expect(() =>
      parseSceneDocument({
        schemaVersion: "rgl.scene/v1",
        objects: {
          root: {
            id: "root",
            parentId: "child",
          },
          child: {
            id: "child",
            parentId: "root",
          },
        },
      }),
    ).toThrow("cyclic parent relationship");
  });

  it("rejects unsupported animation target paths", () => {
    const result = sceneDocumentSchema.safeParse({
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
        },
      },
      sequences: {
        main: {
          id: "main",
          tracks: {
            rename: {
              id: "rename",
              target: { type: "camera", id: "cam", path: "id" },
              valueType: "string",
              keyframes: {
                start: {
                  id: "start",
                  time: 0,
                  value: "other",
                },
              },
            },
          },
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'Unsupported track target path "id".',
    );
  });

  it("rejects animation value types that do not match their target path", () => {
    const result = sceneDocumentSchema.safeParse({
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
        },
      },
      sequences: {
        main: {
          id: "main",
          tracks: {
            "bad-fov": {
              id: "bad-fov",
              target: { type: "camera", id: "cam", path: "fov" },
              valueType: "vec3",
              keyframes: {
                start: {
                  id: "start",
                  time: 0,
                  value: [0, 0, 0],
                },
              },
            },
          },
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'Track path "fov" expects valueType "number".',
    );
  });
});
