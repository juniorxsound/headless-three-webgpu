import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { loadSceneModule } from "../src/render-js.js";

describe("loadSceneModule", () => {
  it("loads a scene module with named setup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rgl-scene-module-"));
    const modulePath = join(dir, "scene.mjs");

    await writeFile(
      modulePath,
      `
import * as THREE from "three/webgpu";

export async function setup({ width, height }) {
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

  it("loads an optional update hook", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rgl-scene-module-update-"));
    const modulePath = join(dir, "scene.mjs");

    await writeFile(
      modulePath,
      `
import * as THREE from "three/webgpu";

let cameraRef;

export function setup({ width, height }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  cameraRef = camera;
  return { scene, camera };
}

export function update(delta) {
  cameraRef.position.z = delta + 5;
}
`,
    );

    const result = await loadSceneModule(modulePath, { width: 800, height: 600 });

    expect(result.update).toBeTypeOf("function");
    await result.update?.(0.25);
    expect(result.camera.position.z).toBe(5.25);
  });

  it("rejects invalid scene module results", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rgl-scene-module-invalid-"));
    const modulePath = join(dir, "scene.mjs");

    await writeFile(
      modulePath,
      `
export function setup() {
  return { hello: "world" };
}
`,
    );

    await expect(loadSceneModule(modulePath, { width: 800, height: 600 })).rejects.toThrow(
      "setup() must resolve to an object with { scene, camera }",
    );
  });

  it("requires a named setup export", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rgl-scene-module-missing-"));
    const modulePath = join(dir, "scene.mjs");

    await writeFile(
      modulePath,
      `
export default function createScene() {
  return null;
}
`,
    );

    await expect(loadSceneModule(modulePath, { width: 800, height: 600 })).rejects.toThrow(
      'must export a named "setup({ width, height })" function',
    );
  });
});
