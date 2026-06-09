---
name: rgl-gltf
description: Use @rendergl/headless-three-webgpu-helpers for GLTF/GLB loading, inspection, framing, lighting, environment maps, and convenience rendering.
---

# rgl-gltf

Use this skill when the input is a `.gltf` or `.glb` asset and you want a Node.js API instead of the `rgl` command.

## Install

```bash
npm install @rendergl/headless-three-webgpu @rendergl/headless-three-webgpu-helpers three
```

`@rendergl/headless-three-webgpu` and `three` are peer dependencies.

## Main Entrypoints

- `renderGltf(options)`
- `prepareGltfScene(options)`
- `computeGltfFraming(root, options)`
- `inspectGltfAsset(path)`
- `loadGltfFromFile(path, renderer)`
- `loadGltfDocument(path)`
- `inlineGltfExternalResources(path)`

## Render a Model

```ts
import { renderGltf } from "@rendergl/headless-three-webgpu-helpers";

const result = await renderGltf({
  path: "./model.glb",
  width: 1024,
  height: 1024,
  format: "png",
  lighting: "studio",
});
```

`result.buffer` contains the encoded image. `result.diagnostics` contains renderer diagnostics. `result.inspection` contains the GLTF summary.

## Important Options

- `path: string`
- `width: number`
- `height: number`
- `format?: "png" | "webp"`
- `background?: string`
- `dawnFlags?: string[]`
- `lighting?: "studio" | "flat" | "none" | lightingObject`
- `camera?: { position?, target?, fov?, useEmbeddedCamera? }`
- `environment?: environmentObject`

Lighting object:

- `preset?: "studio" | "flat" | "none"`
- `ambientIntensity?: number`
- `keyIntensity?: number`
- `fillIntensity?: number`
- `rimIntensity?: number`
- `keyPosition?: [x, y, z]`
- `fillPosition?: [x, y, z]`
- `rimPosition?: [x, y, z]`
- `lights?: customLight[]`

Custom light types:

- `ambient`
- `directional`
- `hemisphere`
- `point`

## Environment Maps

Local equirectangular `.hdr` and `.ktx2` environment maps are supported.

```ts
const result = await renderGltf({
  path: "./model.glb",
  width: 1024,
  height: 1024,
  format: "png",
  lighting: "none",
  environment: {
    path: "./studio.hdr",
    background: true,
    blur: 0.2,
    intensity: 1.2,
  },
});
```

Environment object:

- `path: string`
- `background?: boolean`
- `blur?: number`
- `intensity?: number`

## Inspect Without Rendering

```ts
import { inspectGltfAsset } from "@rendergl/headless-three-webgpu-helpers";

const summary = await inspectGltfAsset("./model.glb");
```

Inspection does not initialize the GPU.

## Prepare Once, Render Many

Use `prepareGltfScene()` for animation, custom camera movement, or multi-frame rendering.

```ts
import { prepareGltfScene } from "@rendergl/headless-three-webgpu-helpers";

const prepared = await prepareGltfScene({
  path: "./model.glb",
  width: 1024,
  height: 1024,
});

await prepared.renderer.render(prepared.scene, prepared.camera);
const png = await prepared.renderer.toBuffer("png");
await prepared.dispose();
```

Always call `prepared.dispose()` exactly once.
