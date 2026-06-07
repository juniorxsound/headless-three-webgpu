import { loadGltfDocument } from "./gltf-document.js";

import type { GltfAssetSummary } from "./types.js";

export async function inspectGltfAsset(path: string): Promise<GltfAssetSummary> {
  const document = await loadGltfDocument(path);
  const json = document.json;

  return {
    path,
    format: document.format,
    byteLength: document.byteLength,
    scenes: json.scenes?.length ?? 0,
    nodes: json.nodes?.length ?? 0,
    meshes: json.meshes?.length ?? 0,
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    images: json.images?.length ?? 0,
    animations: json.animations?.length ?? 0,
    cameras: json.cameras?.length ?? 0,
    extensionsUsed: json.extensionsUsed ?? [],
    generators: json.asset?.generator ? [json.asset.generator] : [],
  };
}
