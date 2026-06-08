---
name: rgl-core
description: Use the core and helper Node.js APIs for headless WebGPU rendering.
---

# rgl-core

Use this skill when you need the programmatic API from Node.js.

Prefer:

- `@rendergl/headless-three-webgpu` for low-level renderer control
- `@rendergl/headless-three-webgpu-helpers` for GLTF or GLB workflows

## Install

Core only:

```bash
pnpm add @rendergl/headless-three-webgpu three
```

Core plus GLTF helpers:

```bash
pnpm add @rendergl/headless-three-webgpu @rendergl/headless-three-webgpu-helpers three
```

## Core API

Main entrypoints:

- `createRendererRuntime(options?)`
- `createHeadlessWebGPURenderer(options?)`
- `runRendererBenchmark(options?)`

Renderer shape:

- `render(scene, camera)`
- `setSize(width, height)`
- `readPixels()`
- `toBuffer("png" | "webp")`
- `getDiagnostics()`
- `dispose()`

Minimal example:

```ts
import { createHeadlessWebGPURenderer } from "@rendergl/headless-three-webgpu";
import * as THREE from "three/webgpu";

const renderer = await createHeadlessWebGPURenderer({
  width: 1024,
  height: 1024,
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 4);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));

await renderer.render(scene, camera);
const png = await renderer.toBuffer("png");
await renderer.dispose();
```

Renderer options:

- `width?: number`
- `height?: number`
- `runtime?: RendererRuntime`
- `alpha?: boolean`
- `antialias?: boolean`
- `clearColor?: string | number`
- `clearAlpha?: number`
- `dawnFlags?: string[]`

Notes:

- antialiasing defaults to `true`
- output color conversion is handled in readback
- runtime defaults to high-performance adapter selection

## GLTF Helpers

Use helpers if the input is a GLTF or GLB and you do not need to build the scene manually.

Main entrypoints:

- `renderGltf(options)`
- `inspectGltfAsset(path)`
- `loadGltfFromFile(path, renderer)`

Minimal example:

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

Important helper parameters:

- `path: string`
- `width: number`
- `height: number`
- `format?: "png" | "webp"`
- `background?: string`
- `dawnFlags?: string[]`
- `lighting?: "studio" | "flat" | "none" | lightingObject`
- `camera?: { position?, target?, fov?, useEmbeddedCamera? }`

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

Custom lights:

- `ambient`
- `directional`
- `hemisphere`
- `point`

## Runtime Options

Local:

- macOS: Dawn -> Metal
- Linux GPU: Dawn -> Vulkan
- Windows GPU: Dawn -> native backend

Cloud Linux with GPU:

- prefer Dawn -> Vulkan
- pass `dawnFlags: ["backend=vulkan"]`
- or use `RGL_DAWN_FLAGS=backend=vulkan`

CPU-only cloud or CI:

- use SwiftShader
- run Dawn on Vulkan against SwiftShader
- usually package this in Docker

Typical CPU setup idea:

- install SwiftShader libraries
- configure Vulkan ICD env vars for SwiftShader
- use `backend=vulkan`

## Testing

Consumer smoke tests should prove:

1. renderer can initialize
2. render returns pixels or a buffer
3. output file can be written

Core smoke test:

```ts
const renderer = await createHeadlessWebGPURenderer({ width: 256, height: 256 });
await renderer.render(scene, camera);
const png = await renderer.toBuffer("png");
await renderer.dispose();
```

Helper smoke test:

```ts
const result = await renderGltf({
  path: "./model.glb",
  width: 256,
  height: 256,
  format: "png",
});
```

For CI or cloud, prefer running these tests inside the same Docker image you expect consumers to use.
