---
name: rgl-core
description: Use @rendergl/headless-three-webgpu for low-level headless Three.js WebGPU rendering from Node.js.
---

# rgl-core

Use this skill when you need the low-level programmatic renderer API from Node.js.

For GLTF/GLB convenience rendering, prefer `@rendergl/headless-three-webgpu-helpers` and its packaged `rgl-gltf` skill.

## Install

```bash
npm install @rendergl/headless-three-webgpu three
```

`three` is a peer dependency. Import WebGPU-ready Three.js classes from `three/webgpu` when building scenes for this renderer.

## Main Entrypoints

- `createRendererRuntime(options?)`
- `createHeadlessWebGPURenderer(options?)`
- `createRendererWithRuntime(options?)`
- `runRendererBenchmark(options?)`

Renderer methods:

- `render(scene, camera)`
- `setSize(width, height)`
- `readPixels()`
- `toBuffer("png" | "webp")`
- `getDiagnostics()`
- `dispose()`

## Minimal Render

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

## Renderer Options

- `width?: number`
- `height?: number`
- `runtime?: RendererRuntime`
- `readbackFormat?: "rgba8unorm" | "rgba16float"` (defaults to `"rgba8unorm"`)
- `alpha?: boolean`
- `antialias?: boolean`
- `clearColor?: string | number`
- `clearAlpha?: number`
- `dawnFlags?: string[]`
- `powerPreference?: GPUPowerPreference`

Notes:

- Use a shared `RendererRuntime` when creating multiple renderers in one process.
- Always call `dispose()` on renderers and runtimes you create.
- Output formats are `png` and `webp`.
- `readPixels()` returns RGBA bytes. The default readback target is 8-bit; choose
  `"rgba16float"` only for precision/HDR workflows that need half-float readback.

## Runtime Notes

- Local macOS usually uses Dawn -> Metal.
- Linux GPU usually uses Dawn -> Vulkan.
- Windows GPU uses the native Dawn backend.
- CPU-only cloud or CI usually needs SwiftShader with Dawn on Vulkan.

Pass Dawn flags with `dawnFlags` or `RGL_DAWN_FLAGS`:

```ts
const renderer = await createHeadlessWebGPURenderer({
  width: 1024,
  height: 1024,
  dawnFlags: ["backend=vulkan"],
});
```

## Smoke Test Shape

Consumer smoke tests should prove:

1. the renderer initializes
2. render returns pixels or an encoded buffer
3. resources are disposed

```ts
const renderer = await createHeadlessWebGPURenderer({ width: 256, height: 256 });
await renderer.render(scene, camera);
const png = await renderer.toBuffer("png");
await renderer.dispose();
```
