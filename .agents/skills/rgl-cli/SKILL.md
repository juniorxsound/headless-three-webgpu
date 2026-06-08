---
name: rgl-cli
description: Use the rgl CLI to render, inspect, and benchmark assets.
---

# rgl-cli

Use this skill when you need to render or inspect assets from the command line.

## Install

```bash
pnpm add -D @rendergl/headless-three-webgpu-cli
```

Run with:

```bash
pnpm exec rgl --help
```

## Main Commands

Render GLTF or GLB:

```bash
pnpm exec rgl render ./model.glb --width 1024 --height 1024 --output ./frame.png
```

Render a custom Three.js scene module:

```bash
pnpm exec rgl render --js ./scene.mjs --width 1024 --height 1024 --output ./frame.png
```

Inspect an asset:

```bash
pnpm exec rgl inspect ./model.glb
```

Benchmark the runtime:

```bash
pnpm exec rgl bench --width 1024 --height 1024 --iterations 10 --format png
```

## Render Parameters

`rgl render [file]`

- `--width <number>`
- `--height <number>`
- `--output <path>`
- `--format png|webp`
- `--js <path>`: render a scene module instead of a GLTF or GLB
- `--dawn-flag <flag>`: repeatable Dawn runtime flags

GLTF-only camera and lighting options:

- `--background <color>`
- `--lighting studio|flat|none`
- `--ambient-intensity <number>`
- `--key-intensity <number>`
- `--fill-intensity <number>`
- `--rim-intensity <number>`
- `--key-position x,y,z`
- `--fill-position x,y,z`
- `--rim-position x,y,z`
- `--light <json>`: repeatable custom light
- `--camera-position x,y,z`
- `--camera-target x,y,z`
- `--fov <number>`

Custom light JSON shapes:

```json
{"type":"ambient","intensity":0.8,"color":"#ffffff"}
{"type":"directional","position":[4,6,8],"intensity":1.2,"color":"#ffffff"}
{"type":"hemisphere","skyColor":"#fff4dc","groundColor":"#d9e7ff","intensity":0.5}
{"type":"point","position":[2,3,4],"intensity":1,"color":"#ffd39b","distance":0,"decay":2}
```

## JS Scene Modules

Scene modules should import `three/webgpu` directly and return `{ scene, camera }`.

```ts
import * as THREE from "three/webgpu";

export default async function createScene({ width, height }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  return { scene, camera };
}
```

You can also export `createScene` instead of a default export.

## Runtime Options

Default runtime:

- local macOS: Dawn -> Metal
- local Windows/Linux with GPU: Dawn -> native backend
- output is headless WebGPU inside Node

Cloud Linux with GPU:

- use Dawn -> Vulkan
- pass Vulkan flags with `--dawn-flag ...` or `RGL_DAWN_FLAGS`

Example:

```bash
RGL_DAWN_FLAGS="backend=vulkan" pnpm exec rgl render ./model.glb --output ./frame.png
```

CPU-only cloud or CI:

- use SwiftShader
- run Dawn on Vulkan against SwiftShader
- usually this is best inside Docker

Typical CPU setup idea:

- install SwiftShader shared libraries
- set Vulkan ICD env vars for SwiftShader
- run with `RGL_DAWN_FLAGS="backend=vulkan"`

## Testing

Fast smoke tests for consumers:

```bash
pnpm exec rgl inspect ./model.glb
pnpm exec rgl render ./model.glb --output ./frame.png
test -f ./frame.png
```

For JS scene modules:

```bash
pnpm exec rgl render --js ./scene.mjs --output ./frame.png
test -f ./frame.png
```
