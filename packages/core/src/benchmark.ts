import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "three";

import { encodeImageToBuffer } from "./image-encoding.js";
import { createHeadlessWebGPURenderer } from "./renderer.js";

import type { RendererBenchmarkOptions, RendererBenchmarkResult } from "./types.js";

function createBenchmarkScene(width: number, height: number): {
  scene: Scene;
  camera: PerspectiveCamera;
  mesh: Mesh;
} {
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 0.55));

  const key = new DirectionalLight(0xffffff, 1.8);
  key.position.set(4, 6, 8);
  scene.add(key);

  const fill = new DirectionalLight(0x88aaff, 0.8);
  fill.position.set(-6, 2, -3);
  scene.add(fill);

  const mesh = new Mesh(
    new BoxGeometry(1.2, 1.2, 1.2),
    new MeshStandardMaterial({
      color: "#6da4ff",
      metalness: 0.12,
      roughness: 0.38,
    }),
  );
  scene.add(mesh);

  const camera = new PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(2.4, 2.2, 3.6);
  camera.lookAt(0, 0, 0);

  return { scene, camera, mesh };
}

export async function runRendererBenchmark(
  options: RendererBenchmarkOptions = {},
): Promise<RendererBenchmarkResult> {
  const width = options.width ?? 1024;
  const height = options.height ?? 1024;
  const iterations = options.iterations ?? 10;
  const format = options.format ?? "png";
  const rendererOptions = {
    width,
    height,
    ...(options.dawnFlags ? { dawnFlags: options.dawnFlags } : {}),
    ...(options.powerPreference ? { powerPreference: options.powerPreference } : {}),
  };
  const renderer = await createHeadlessWebGPURenderer(rendererOptions);

  const { scene, camera, mesh } = createBenchmarkScene(width, height);
  let totalRenderMs = 0;
  let totalReadbackMs = 0;
  let totalEncodeMs = 0;
  let totalMs = 0;

  try {
    for (let index = 0; index < iterations; index += 1) {
      mesh.rotation.x += 0.2;
      mesh.rotation.y += 0.25;

      const startedAt = performance.now();
      const renderStartedAt = performance.now();
      await renderer.render(scene, camera);
      totalRenderMs += performance.now() - renderStartedAt;

      const readbackStartedAt = performance.now();
      const pixels = await renderer.readPixels();
      totalReadbackMs += performance.now() - readbackStartedAt;

      const encodeStartedAt = performance.now();
      await encodeImageToBuffer({ pixels, width, height, format });
      totalEncodeMs += performance.now() - encodeStartedAt;
      totalMs += performance.now() - startedAt;
    }

    return {
      iterations,
      width,
      height,
      format,
      averageRenderMs: totalRenderMs / iterations,
      averageReadbackMs: totalReadbackMs / iterations,
      averageEncodeMs: totalEncodeMs / iterations,
      averageTotalMs: totalMs / iterations,
      diagnostics: renderer.getDiagnostics().runtime,
    };
  } finally {
    scene.traverse((object: unknown) => {
      const meshObject = object as Mesh;
      meshObject.geometry?.dispose?.();
      if (Array.isArray(meshObject.material)) {
        meshObject.material.forEach((material: Material) => material.dispose());
      } else {
        meshObject.material?.dispose?.();
      }
    });

    await renderer.dispose();
  }
}
