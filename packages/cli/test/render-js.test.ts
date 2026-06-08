import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { loadSceneModule } from "../src/render-js.js";

describe("loadSceneModule", () => {
  it("loads a default scene factory module", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rgl-scene-module-"));
    const modulePath = join(dir, "scene.mjs");

    await writeFile(
      modulePath,
      `
import * as THREE from "three/webgpu";

export default async function createScene({ width, height }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  return { scene, camera };
}
`,
    );

    const result = await loadSceneModule(modulePath, { width: 800, height: 600 });

    expect(result.scene.isScene).toBe(true);
    expect(result.camera.isCamera).toBe(true);
  });

  it("rejects invalid scene module results", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rgl-scene-module-invalid-"));
    const modulePath = join(dir, "scene.mjs");

    await writeFile(
      modulePath,
      `
export default function createScene() {
  return { hello: "world" };
}
`,
    );

    await expect(loadSceneModule(modulePath, { width: 800, height: 600 })).rejects.toThrow(
      "must resolve to an object with { scene, camera }",
    );
  });
});
