# @rendergl/headless-three-webgpu-helpers

GLTF loading, inspection, and convenience rendering helpers for `@rendergl/headless-three-webgpu`.

![render cover image](https://i.imgur.com/UlEpFJy.gif)

> ⚠️ This is a part of the core rendering layer powering [render.gl](https://www.render.gl). It's an open-source, standalone tool and does not require any account or API key. That said, if you are looking for cloud-based 3D rendering with a lot more features on top, check out [render.gl](https://www.render.gl).

## What

Use this when you want to render or inspect `.gltf` / `.glb` assets from Node.js without hand-wiring loaders every time. It builds on the core headless WebGPU renderer and adds the practical bits you usually need around GLTF files.

## Install

Make sure you have Node.js 24 or newer installed.

```bash
npm install @rendergl/headless-three-webgpu @rendergl/headless-three-webgpu-helpers three
```

`@rendergl/headless-three-webgpu` and `three` are peer dependencies.

## Quickstart

```ts
import { renderGltf } from "@rendergl/headless-three-webgpu-helpers";

const result = await renderGltf({
  path: "./model.glb",
  width: 1440,
  height: 900,
  format: "webp",
  lighting: {
    preset: "studio",
    lights: [
      {
        type: "point",
        position: [2, 3, 4],
        intensity: 0.8,
        color: "#ffd39b",
      },
    ],
  },
});
```

`result.buffer` contains the encoded image.

## Environment Maps

Local equirectangular `.hdr` and `.ktx2` environment maps are supported for GLTF/GLB renders.

```ts
const result = await renderGltf({
  path: "./model.glb",
  width: 1440,
  height: 900,
  environment: {
    path: "./studio.hdr",
    background: true,
    blur: 0.2,
    intensity: 1.2,
  },
});
```

## Inspection

You can inspect a model without touching the GPU:

```ts
import { inspectGltfAsset } from "@rendergl/headless-three-webgpu-helpers";

const summary = await inspectGltfAsset("./model.glb");
```

## API

The main exports are:

- `renderGltf()` - load, frame, light, render, and encode a GLTF/GLB asset
- `prepareGltfScene()` - load and prepare a scene when you want to take over rendering yourself
- `computeGltfFraming()` - compute a camera framing for a loaded scene
- `inspectGltfAsset()` - summarize a GLTF/GLB without rendering
- `loadGltfFromFile()` - load a model from disk
- `loadGltfDocument()` and `inlineGltfExternalResources()` - lower-level GLTF document helpers

## Agent Instructions

This package ships versioned agent instructions for coding agents:

```txt
node_modules/@rendergl/headless-three-webgpu-helpers/agent/AGENTS.md
node_modules/@rendergl/headless-three-webgpu-helpers/agent/skills/rgl-gltf/SKILL.md
```

Point your agent there when you want it to use the installed package version as the source of truth.

## Related Packages

- `@rendergl/headless-three-webgpu` - core headless renderer runtime and API
- `@rendergl/headless-three-webgpu-cli` - the `rgl` command that wraps these helpers

## Develop

This package lives in a `pnpm` + `turbo` monorepo.

```bash
pnpm install
pnpm --filter @rendergl/headless-three-webgpu-helpers build
pnpm --filter @rendergl/headless-three-webgpu-helpers test
```
