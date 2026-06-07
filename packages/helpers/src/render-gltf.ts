import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Camera,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import { createHeadlessWebGPURenderer } from "headless-three-webgpu";

import { inspectGltfAsset } from "./inspect-gltf.js";
import { loadGltfFromFile } from "./gltf-loader.js";

import type { GltfLightingPreset, RenderGltfCameraOptions, RenderGltfOptions, RenderGltfResult } from "./types.js";

function addLighting(scene: Scene, lighting: GltfLightingPreset): void {
  if (lighting === "none") {
    return;
  }

  if (lighting === "flat") {
    scene.add(new AmbientLight(0xffffff, 1.1));
    const key = new DirectionalLight(0xffffff, 0.75);
    key.position.set(3, 5, 4);
    scene.add(key);
    return;
  }

  scene.add(new AmbientLight(0xffffff, 0.45));

  const key = new DirectionalLight(0xffffff, 1.35);
  key.position.set(4, 6, 8);
  scene.add(key);

  const fill = new DirectionalLight(0x8aa6ff, 0.55);
  fill.position.set(-5, 3, 2);
  scene.add(fill);

  const rim = new DirectionalLight(0xffffff, 0.35);
  rim.position.set(-2, 5, -6);
  scene.add(rim);
}

function resolveCamera(
  root: Object3D,
  width: number,
  height: number,
  options: RenderGltfCameraOptions | undefined,
): Camera {
  if (options?.useEmbeddedCamera !== false) {
    let embeddedCamera: Camera | null = null;
    root.traverse((object) => {
      if (embeddedCamera || !(object as Camera).isCamera) {
        return;
      }
      embeddedCamera = object as Camera;
    });
    if (embeddedCamera) {
      return embeddedCamera;
    }
  }

  const bounds = new Box3().setFromObject(root);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const radius = Math.max(size.x, size.y, size.z) / 2 || 0.5;
  const fov = options?.fov ?? 45;
  const distance = radius / Math.tan((fov * Math.PI) / 360) + radius * 1.5;

  const camera = new PerspectiveCamera(fov, width / height, 0.01, radius * 64);
  const position = options?.position ?? [center.x + distance * 0.75, center.y + radius * 0.6, center.z + distance];
  const target = options?.target ?? [center.x, center.y, center.z];

  camera.position.set(position[0], position[1], position[2]);
  camera.lookAt(target[0], target[1], target[2]);
  return camera;
}

function disposeMaterial(material: Material): void {
  const values = Object.values(material as Material & Record<string, unknown>);
  for (const value of values) {
    if (value && typeof value === "object" && (value as Texture).isTexture) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}

function disposeSceneGraph(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) {
      return;
    }

    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach(disposeMaterial);
  });
}

export async function renderGltf(options: RenderGltfOptions): Promise<RenderGltfResult> {
  const renderer = await createHeadlessWebGPURenderer({
    width: options.width,
    height: options.height,
    ...(options.dawnFlags ? { dawnFlags: options.dawnFlags } : {}),
    ...(options.powerPreference ? { powerPreference: options.powerPreference } : {}),
  });
  const rendererHandle = renderer.unsafeGetWebGpuRenderer();
  const inspection = await inspectGltfAsset(options.path);
  let loadedScene: Object3D | null = null;

  try {
    const gltf = await loadGltfFromFile(options.path, rendererHandle);
    loadedScene = gltf.scene;
    const scene = new Scene();
    if (options.background) {
      scene.background = new Color(options.background);
    }

    scene.add(gltf.scene);
    addLighting(scene, options.lighting ?? "studio");

    const camera = resolveCamera(gltf.scene, options.width, options.height, options.camera);
    await renderer.render(scene, camera);
    const buffer = await renderer.toBuffer(options.format ?? "png");

    return {
      buffer,
      diagnostics: renderer.getDiagnostics(),
      inspection,
    };
  } finally {
    if (loadedScene) {
      disposeSceneGraph(loadedScene);
    }
    await renderer.dispose();
  }
}
