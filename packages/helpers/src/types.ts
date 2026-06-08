import type {
  HeadlessWebGPURenderer,
  HeadlessWebGPURendererDiagnostics,
  OutputFormat,
  RendererRuntimeOptions,
} from "@rendergl/headless-three-webgpu";
import type { Camera, Scene } from "three";

export type GltfLightingPreset = "studio" | "flat" | "none";

export type RenderGltfLightColor = string | number;

export interface RenderGltfAmbientLight {
  type: "ambient";
  color?: RenderGltfLightColor;
  intensity?: number;
}

export interface RenderGltfDirectionalLight {
  type: "directional";
  color?: RenderGltfLightColor;
  intensity?: number;
  position: [number, number, number];
}

export interface RenderGltfHemisphereLight {
  type: "hemisphere";
  skyColor?: RenderGltfLightColor;
  groundColor?: RenderGltfLightColor;
  intensity?: number;
}

export interface RenderGltfPointLight {
  type: "point";
  color?: RenderGltfLightColor;
  intensity?: number;
  position: [number, number, number];
  distance?: number;
  decay?: number;
}

export type RenderGltfSceneLight =
  | RenderGltfAmbientLight
  | RenderGltfDirectionalLight
  | RenderGltfHemisphereLight
  | RenderGltfPointLight;

export interface RenderGltfLightingOptions {
  preset?: GltfLightingPreset;
  ambientIntensity?: number;
  keyIntensity?: number;
  fillIntensity?: number;
  rimIntensity?: number;
  keyPosition?: [number, number, number];
  fillPosition?: [number, number, number];
  rimPosition?: [number, number, number];
  lights?: RenderGltfSceneLight[];
}

export interface RenderGltfEnvironmentOptions {
  path: string;
  background?: boolean;
  blur?: number;
  intensity?: number;
}

export interface RenderGltfCameraOptions {
  position?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  useEmbeddedCamera?: boolean;
}

export interface RenderGltfOptions extends Omit<RendererRuntimeOptions, "powerPreference"> {
  path: string;
  width: number;
  height: number;
  format?: OutputFormat;
  background?: string;
  lighting?: GltfLightingPreset | RenderGltfLightingOptions;
  environment?: RenderGltfEnvironmentOptions;
  camera?: RenderGltfCameraOptions;
}

export interface RenderGltfResult {
  buffer: Uint8Array;
  diagnostics: HeadlessWebGPURendererDiagnostics;
  inspection: GltfAssetSummary;
}

/**
 * Bounding-box framing derived from a loaded GLTF/GLB scene. Useful for driving
 * animated cameras (orbits, dollies) without re-deriving the bounds per frame.
 */
export interface GltfFraming {
  center: [number, number, number];
  radius: number;
  distance: number;
  fov: number;
  near: number;
  far: number;
  aspect: number;
}

/**
 * A fully built GLTF/GLB scene ready to render one or many frames. The caller
 * owns the lifecycle and must invoke `dispose` exactly once when finished.
 */
export interface PreparedGltfScene {
  renderer: HeadlessWebGPURenderer;
  scene: Scene;
  camera: Camera;
  framing: GltfFraming;
  inspection: GltfAssetSummary;
  dispose: () => Promise<void>;
}

export interface GltfAssetSummary {
  path: string;
  format: "gltf" | "glb";
  byteLength: number;
  scenes: number;
  nodes: number;
  meshes: number;
  materials: number;
  textures: number;
  images: number;
  animations: number;
  cameras: number;
  extensionsUsed: string[];
  generators: string[];
}

export interface LoadedGltfDocument {
  format: "gltf" | "glb";
  byteLength: number;
  json: {
    asset?: {
      generator?: string;
    };
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string }>;
    animations?: unknown[];
    cameras?: unknown[];
    materials?: unknown[];
    meshes?: unknown[];
    nodes?: unknown[];
    scenes?: unknown[];
    textures?: unknown[];
    extensionsUsed?: string[];
  };
}
