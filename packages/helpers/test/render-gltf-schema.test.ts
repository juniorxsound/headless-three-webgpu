import { describe, expect, it } from "vitest";

import { renderGltfOptionsSchema } from "../src/render-gltf-schema.js";

describe("renderGltfOptionsSchema", () => {
  it("accepts a valid render request", () => {
    expect(
      renderGltfOptionsSchema.parse({
        path: "/tmp/model.glb",
        width: 1024,
        height: 1024,
        lighting: {
          preset: "studio",
          keyIntensity: 1.25,
        },
      }),
    ).toMatchObject({
      path: "/tmp/model.glb",
      width: 1024,
      height: 1024,
    });
  });

  it("rejects invalid dimensions", () => {
    expect(() =>
      renderGltfOptionsSchema.parse({
        path: "/tmp/model.glb",
        width: 0,
        height: 1024,
      }),
    ).toThrow();
  });
});
