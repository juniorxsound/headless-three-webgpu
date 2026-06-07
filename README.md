# headless-three-webgpu

`headless-three-webgpu` is an open-source renderer runtime for running Three.js on top of Dawn/WebGPU inside Node.js. It is extracted from the renderer technology behind render.gl, and its published packages use the `@rendergl/*` scope while staying intentionally scoped as a developer-facing engine and toolkit rather than a hosted product SDK.

The boundary is simple:

- This repo includes the headless WebGPU runtime, a renderer-first API, GLTF helpers, a CLI, examples, and docs.
- This repo does not include hosted platform concerns such as auth, billing, tenancy, usage metering, delivery URLs, or dashboard code.
- render.gl remains the hosted product built on top of this renderer technology.

## Why this exists

Headless browser rendering can be heavy, slow to bootstrap, or awkward to integrate into build pipelines. This project focuses on a narrower job:

- bring Dawn/WebGPU to Node
- present a familiar Three.js-style renderer API
- support offscreen rendering and pixel readback
- make GLTF rendering practical with Node-specific texture, DRACO, and KTX2 helpers
- provide a thin CLI for local automation and benchmarking

## Packages

- `@rendergl/three-headless`: core headless renderer runtime and API
- `@rendergl/three-headless-helpers`: GLTF loading, inspection, and convenience rendering helpers
- `@rendergl/three-headless-cli`: the `rgl` CLI

## Quickstart

This repository targets Node 24 and uses `pnpm` only.

```bash
nvm use
pnpm install
pnpm build
pnpm test
```

Render a GLB with the CLI:

```bash
pnpm --filter @rendergl/three-headless-cli exec rgl render ./model.glb --width 1280 --height 720 --output ./frame.png
```

Inspect a model without touching the GPU:

```bash
pnpm --filter @rendergl/three-headless-cli exec rgl inspect ./model.glb
```

## Core API

```ts
import { createHeadlessWebGPURenderer, createRendererRuntime } from "@rendergl/three-headless";
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "three/webgpu";

const runtime = await createRendererRuntime();
const renderer = await createHeadlessWebGPURenderer({
  runtime,
  width: 1024,
  height: 1024,
});

const scene = new Scene();
scene.add(new AmbientLight(0xffffff, 0.6));

const sun = new DirectionalLight(0xffffff, 1.4);
sun.position.set(4, 6, 8);
scene.add(sun);

scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: "#4f8cff" })));

const camera = new PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(2, 2, 3);
camera.lookAt(0, 0, 0);

await renderer.render(scene, camera);
const png = await renderer.toBuffer("png");

await renderer.dispose();
await runtime.dispose();
```

## Helper API

GLTF-specific conveniences live in `packages/helpers` so the core renderer stays generic:

```ts
import { renderGltf } from "@rendergl/three-headless-helpers";

const result = await renderGltf({
  path: "./model.glb",
  width: 1440,
  height: 900,
  format: "webp",
  lighting: "studio",
});
```

## CLI

The CLI intentionally wraps the packages above instead of re-implementing renderer logic.

```bash
rgl render ./model.glb --output ./frame.png
rgl inspect ./model.glb
rgl bench --iterations 20 --format png
```

## CPU-only and diagnostics

CPU-oriented guidance and benchmark tips live in:

- [docs/getting-started.md](/Users/juniorxsound/Dev/headless-three-webgpu/docs/getting-started.md)
- [docs/cpu-only.md](/Users/juniorxsound/Dev/headless-three-webgpu/docs/cpu-only.md)
- [docs/architecture.md](/Users/juniorxsound/Dev/headless-three-webgpu/docs/architecture.md)

The runtime exposes adapter and Dawn flag diagnostics so render jobs can log the exact environment they ran under.

## Status

This first pass focuses on a clean public API, package boundaries, the GLTF helper path, the CLI, and practical extraction of the renderer runtime. Advanced hosted-product behavior from render.gl is intentionally not part of this repository, and broader example coverage can land in a follow-up pass.
