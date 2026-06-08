import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import {
  AmbientLight,
  Box3,
  Color,
  DataTexture,
  DataUtils,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FloatType,
  HalfFloatType,
  HemisphereLight,
  LinearFilter,
  LinearSRGBColorSpace,
  PerspectiveCamera,
  PointLight,
  RGBAFormat,
  Scene,
  Vector3,
  type Camera,
  type ColorRepresentation,
  type Material,
  type Mesh,
  type Object3D,
  type RenderTarget,
  type Texture,
} from "three";
import { createHeadlessWebGPURenderer } from "@rendergl/headless-three-webgpu";
import { PMREMGenerator, type WebGPURenderer } from "three/webgpu";
import type { z } from "zod";

import { inspectGltfAsset } from "./inspect-gltf.js";
import { loadGltfFromFile } from "./gltf-loader.js";
import { loadNodeKtx2Texture } from "./node-ktx2-loader.js";
import {
  renderGltfEnvironmentOptionsSchema,
  renderGltfCameraOptionsSchema,
  renderGltfOptionsSchema,
  renderGltfSceneLightSchema,
} from "./render-gltf-schema.js";

import type {
  GltfFraming,
  PreparedGltfScene,
  RenderGltfLightingOptions,
  RenderGltfOptions,
  RenderGltfResult,
  RenderGltfSceneLight,
} from "./types.js";

type ParsedLightingOptions = z.infer<typeof renderGltfOptionsSchema>["lighting"];
type ParsedEnvironmentOptions = z.infer<typeof renderGltfEnvironmentOptionsSchema> | undefined;
type ParsedCameraOptions = z.infer<typeof renderGltfCameraOptionsSchema> | undefined;
type ParsedSceneLight = z.infer<typeof renderGltfSceneLightSchema>;
type LoadedEnvironmentResources = {
  sourceTexture: Texture;
  pmremTarget: RenderTarget;
};

export function normalizeSceneLight(light: ParsedSceneLight): RenderGltfSceneLight {
  switch (light.type) {
    case "ambient":
      return {
        type: "ambient",
        ...(light.color !== undefined ? { color: light.color } : {}),
        ...(light.intensity !== undefined ? { intensity: light.intensity } : {}),
      };
    case "directional":
      return {
        type: "directional",
        position: light.position,
        ...(light.color !== undefined ? { color: light.color } : {}),
        ...(light.intensity !== undefined ? { intensity: light.intensity } : {}),
      };
    case "hemisphere":
      return {
        type: "hemisphere",
        ...(light.skyColor !== undefined ? { skyColor: light.skyColor } : {}),
        ...(light.groundColor !== undefined ? { groundColor: light.groundColor } : {}),
        ...(light.intensity !== undefined ? { intensity: light.intensity } : {}),
      };
    case "point":
      return {
        type: "point",
        position: light.position,
        ...(light.color !== undefined ? { color: light.color } : {}),
        ...(light.intensity !== undefined ? { intensity: light.intensity } : {}),
        ...(light.distance !== undefined ? { distance: light.distance } : {}),
        ...(light.decay !== undefined ? { decay: light.decay } : {}),
      };
  }
}

function resolveLightingOptions(lighting: ParsedLightingOptions): RenderGltfLightingOptions {
  if (!lighting) {
    return { preset: "studio" };
  }

  if (typeof lighting === "string") {
    return { preset: lighting };
  }

  const resolved: RenderGltfLightingOptions = {};
  if (lighting.preset) {
    resolved.preset = lighting.preset;
  }
  if (lighting.ambientIntensity !== undefined) {
    resolved.ambientIntensity = lighting.ambientIntensity;
  }
  if (lighting.keyIntensity !== undefined) {
    resolved.keyIntensity = lighting.keyIntensity;
  }
  if (lighting.fillIntensity !== undefined) {
    resolved.fillIntensity = lighting.fillIntensity;
  }
  if (lighting.rimIntensity !== undefined) {
    resolved.rimIntensity = lighting.rimIntensity;
  }
  if (lighting.keyPosition) {
    resolved.keyPosition = lighting.keyPosition;
  }
  if (lighting.fillPosition) {
    resolved.fillPosition = lighting.fillPosition;
  }
  if (lighting.rimPosition) {
    resolved.rimPosition = lighting.rimPosition;
  }
  if (lighting.lights) {
    resolved.lights = lighting.lights.map(normalizeSceneLight);
  }

  return {
    preset: "studio",
    ...resolved,
  };
}

function resolveLightColor(
  color: ColorRepresentation | undefined,
  fallback: ColorRepresentation,
): ColorRepresentation {
  return color ?? fallback;
}

function addCustomLights(scene: Scene, lights: RenderGltfSceneLight[] | undefined): void {
  if (!lights) {
    return;
  }

  for (const light of lights) {
    switch (light.type) {
      case "ambient":
        scene.add(new AmbientLight(resolveLightColor(light.color, 0xffffff), light.intensity ?? 1));
        break;
      case "directional": {
        const directionalLight = new DirectionalLight(
          resolveLightColor(light.color, 0xffffff),
          light.intensity ?? 1,
        );
        directionalLight.position.set(light.position[0], light.position[1], light.position[2]);
        scene.add(directionalLight);
        break;
      }
      case "hemisphere":
        scene.add(
          new HemisphereLight(
            resolveLightColor(light.skyColor, 0xffffff),
            resolveLightColor(light.groundColor, 0x444444),
            light.intensity ?? 1,
          ),
        );
        break;
      case "point": {
        const pointLight = new PointLight(
          resolveLightColor(light.color, 0xffffff),
          light.intensity ?? 1,
          light.distance ?? 0,
          light.decay ?? 2,
        );
        pointLight.position.set(light.position[0], light.position[1], light.position[2]);
        scene.add(pointLight);
        break;
      }
    }
  }
}

function addLighting(scene: Scene, lightingInput: ParsedLightingOptions): void {
  const lighting = resolveLightingOptions(lightingInput);
  const preset = lighting.preset ?? "studio";

  if (preset === "none") {
    addCustomLights(scene, lighting.lights);
    return;
  }

  if (preset === "flat") {
    scene.add(new AmbientLight(0xffffff, lighting.ambientIntensity ?? 1.1));
    const key = new DirectionalLight(0xffffff, lighting.keyIntensity ?? 0.75);
    const keyPosition = lighting.keyPosition ?? [3, 5, 4];
    key.position.set(keyPosition[0], keyPosition[1], keyPosition[2]);
    scene.add(key);
    addCustomLights(scene, lighting.lights);
    return;
  }

  scene.add(new AmbientLight(0xffffff, lighting.ambientIntensity ?? 0.45));

  const key = new DirectionalLight(0xffffff, lighting.keyIntensity ?? 1.35);
  const keyPosition = lighting.keyPosition ?? [4, 6, 8];
  key.position.set(keyPosition[0], keyPosition[1], keyPosition[2]);
  scene.add(key);

  const fill = new DirectionalLight(0x8aa6ff, lighting.fillIntensity ?? 0.55);
  const fillPosition = lighting.fillPosition ?? [-5, 3, 2];
  fill.position.set(fillPosition[0], fillPosition[1], fillPosition[2]);
  scene.add(fill);

  const rim = new DirectionalLight(0xffffff, lighting.rimIntensity ?? 0.35);
  const rimPosition = lighting.rimPosition ?? [-2, 5, -6];
  rim.position.set(rimPosition[0], rimPosition[1], rimPosition[2]);
  scene.add(rim);
  addCustomLights(scene, lighting.lights);
}

async function loadEnvironmentTexture(renderer: WebGPURenderer, path: string): Promise<Texture> {
  const extension = extname(path).toLowerCase();

  if (extension === ".ktx2") {
    const arrayBuffer = await readFile(path);
    const texture = await loadNodeKtx2Texture(
      renderer,
      arrayBuffer.buffer.slice(
        arrayBuffer.byteOffset,
        arrayBuffer.byteOffset + arrayBuffer.byteLength,
      ),
    );
    texture.flipY = true;
    texture.mapping = EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    return texture;
  }

  if (extension === ".hdr") {
    const arrayBuffer = await readFile(path);
    const hdr = new HDRLoader()
      .setDataType(FloatType)
      .parse(
        arrayBuffer.buffer.slice(
          arrayBuffer.byteOffset,
          arrayBuffer.byteOffset + arrayBuffer.byteLength,
        ),
      );

    const halfFloatData =
      hdr.data instanceof Float32Array
        ? Uint16Array.from(hdr.data, (value) => DataUtils.toHalfFloat(value))
        : null;

    if (!halfFloatData) {
      throw new Error(
        `HDR decode failed: HDRLoader returned unsupported data type "${hdr.data?.constructor?.name ?? "unknown"}"`,
      );
    }

    const texture = new DataTexture(
      halfFloatData,
      hdr.width,
      hdr.height,
      RGBAFormat,
      HalfFloatType,
    );
    texture.mapping = EquirectangularReflectionMapping;
    texture.colorSpace = LinearSRGBColorSpace;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = true;
    texture.needsUpdate = true;
    return texture;
  }

  throw new Error(`Unsupported environment map format "${extension}". Use .hdr or .ktx2`);
}

async function loadEnvironmentResources(
  renderer: WebGPURenderer,
  environment: NonNullable<ParsedEnvironmentOptions>,
): Promise<LoadedEnvironmentResources> {
  const sourceTexture = await loadEnvironmentTexture(renderer, environment.path);
  const pmremGenerator = new PMREMGenerator(renderer);

  try {
    const pmremTarget = pmremGenerator.fromEquirectangular(sourceTexture);
    return { sourceTexture, pmremTarget };
  } catch (error) {
    sourceTexture.dispose();
    throw error;
  } finally {
    pmremGenerator.dispose();
  }
}

async function applyEnvironment(
  scene: Scene,
  renderer: WebGPURenderer,
  environment: ParsedEnvironmentOptions,
): Promise<LoadedEnvironmentResources | null> {
  if (!environment) {
    return null;
  }

  const resources = await loadEnvironmentResources(renderer, environment);
  scene.environment = resources.pmremTarget.texture;
  scene.environmentIntensity = environment.intensity ?? 1;

  if (environment.background) {
    scene.background =
      environment.blur && environment.blur > 0
        ? resources.pmremTarget.texture
        : resources.sourceTexture;
    scene.backgroundBlurriness = environment.blur ?? 0;
    scene.backgroundIntensity = environment.intensity ?? 1;
    renderer.setClearColor(new Color(0x000000), 1);
  }

  return resources;
}

function disposeEnvironmentResources(resources: LoadedEnvironmentResources | null): void {
  if (!resources) {
    return;
  }

  resources.pmremTarget.dispose();
  resources.sourceTexture.dispose();
}

export function computeGltfFraming(
  root: Object3D,
  width: number,
  height: number,
  fov = 45,
): GltfFraming {
  const bounds = new Box3().setFromObject(root);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const radius = Math.max(size.x, size.y, size.z) / 2 || 0.5;
  const distance = radius / Math.tan((fov * Math.PI) / 360) + radius * 1.5;

  return {
    center: [center.x, center.y, center.z],
    radius,
    distance,
    fov,
    near: 0.01,
    far: radius * 64,
    aspect: width / height,
  };
}

function resolveCamera(
  root: Object3D,
  width: number,
  height: number,
  options: ParsedCameraOptions,
  framing: GltfFraming,
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

  const { center, radius, distance, fov, near, far, aspect } = framing;
  const camera = new PerspectiveCamera(fov, aspect, near, far);
  const position = options?.position ?? [
    center[0] + distance * 0.75,
    center[1] + radius * 0.6,
    center[2] + distance,
  ];
  const target = options?.target ?? center;

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

/**
 * Build a renderable GLTF/GLB scene without rendering a frame. The caller is
 * responsible for invoking `dispose` once finished. Useful for rendering many
 * frames (e.g. video) from a single load while animating the camera.
 */
export async function prepareGltfScene(input: RenderGltfOptions): Promise<PreparedGltfScene> {
  const options = renderGltfOptionsSchema.parse(input);
  const renderer = await createHeadlessWebGPURenderer({
    width: options.width,
    height: options.height,
    ...(options.dawnFlags ? { dawnFlags: options.dawnFlags } : {}),
  });
  const rendererHandle = renderer.unsafeGetWebGpuRenderer();
  const inspection = await inspectGltfAsset(options.path);
  let loadedScene: Object3D | null = null;
  let environmentResources: LoadedEnvironmentResources | null = null;

  const dispose = async (): Promise<void> => {
    disposeEnvironmentResources(environmentResources);
    if (loadedScene) {
      disposeSceneGraph(loadedScene);
    }
    await renderer.dispose();
  };

  try {
    const gltf = await loadGltfFromFile(options.path, rendererHandle);
    loadedScene = gltf.scene;
    const scene = new Scene();
    if (options.background) {
      scene.background = new Color(options.background);
    }

    scene.add(gltf.scene);
    addLighting(scene, options.lighting ?? "studio");
    environmentResources = await applyEnvironment(scene, rendererHandle, options.environment);

    const framing = computeGltfFraming(
      gltf.scene,
      options.width,
      options.height,
      options.camera?.fov,
    );
    const camera = resolveCamera(
      gltf.scene,
      options.width,
      options.height,
      options.camera,
      framing,
    );

    return {
      renderer,
      scene,
      camera,
      framing,
      inspection,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export async function renderGltf(input: RenderGltfOptions): Promise<RenderGltfResult> {
  const format = input.format ?? "png";
  const prepared = await prepareGltfScene(input);

  try {
    await prepared.renderer.render(prepared.scene, prepared.camera);
    const buffer = await prepared.renderer.toBuffer(format);

    return {
      buffer,
      diagnostics: prepared.renderer.getDiagnostics(),
      inspection: prepared.inspection,
    };
  } finally {
    await prepared.dispose();
  }
}
