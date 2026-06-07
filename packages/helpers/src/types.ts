import type {
  HeadlessWebGPURendererDiagnostics,
  OutputFormat,
  RendererRuntimeOptions,
} from "headless-three-webgpu";

export type GltfLightingPreset = "studio" | "flat" | "none";

export interface RenderGltfCameraOptions {
  position?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  useEmbeddedCamera?: boolean;
}

export interface RenderGltfOptions extends RendererRuntimeOptions {
  path: string;
  width: number;
  height: number;
  format?: OutputFormat;
  background?: string;
  lighting?: GltfLightingPreset;
  camera?: RenderGltfCameraOptions;
}

export interface RenderGltfResult {
  buffer: Uint8Array;
  diagnostics: HeadlessWebGPURendererDiagnostics;
  inspection: GltfAssetSummary;
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
