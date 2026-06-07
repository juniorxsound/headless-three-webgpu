import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { inspectGltfAsset } from "../src/inspect-gltf.js";
import { inlineGltfExternalResources } from "../src/gltf-document.js";

describe("inspectGltfAsset", () => {
  it("reports counts from a JSON glTF file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rgl-gltf-"));
    const filePath = join(directory, "scene.gltf");
    await writeFile(
      filePath,
      JSON.stringify({
        asset: { version: "2.0", generator: "test-suite" },
        scenes: [{}],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{}] }],
        materials: [{}],
        textures: [{}],
        images: [{}],
        cameras: [{}],
        animations: [{}],
        extensionsUsed: ["KHR_draco_mesh_compression"],
      }),
    );

    await expect(inspectGltfAsset(filePath)).resolves.toMatchObject({
      format: "gltf",
      scenes: 1,
      nodes: 1,
      meshes: 1,
      materials: 1,
      textures: 1,
      images: 1,
      cameras: 1,
      animations: 1,
      extensionsUsed: ["KHR_draco_mesh_compression"],
      generators: ["test-suite"],
    });
  });

  it("inlines external buffers into data URIs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rgl-inline-"));
    const gltfPath = join(directory, "scene.gltf");
    const binPath = join(directory, "mesh.bin");
    await writeFile(binPath, Buffer.from([1, 2, 3, 4]));
    await writeFile(
      gltfPath,
      JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ uri: "mesh.bin", byteLength: 4 }],
      }),
    );

    const inlined = await inlineGltfExternalResources(gltfPath);
    expect(new TextDecoder().decode(inlined)).toContain("data:application/octet-stream;base64");
  });
});
