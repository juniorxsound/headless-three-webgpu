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

Render a video (requires `ffmpeg` on PATH):

```bash
pnpm exec rgl video ./model.glb --output ./orbit.mp4 --camera turntable --duration 6 --fps 30
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

GLTF-only camera, lighting, and environment options:

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
- `--env-map <path>`: equirectangular `.hdr` or `.ktx2` environment map
- `--env-background`: use the environment map as scene background
- `--env-blur <number>`: background blur from 0 to 1 (requires `--env-background`)
- `--env-intensity <number>`: environment lighting intensity (0 to 10)

Custom light JSON shapes:

```json
{"type":"ambient","intensity":0.8,"color":"#ffffff"}
{"type":"directional","position":[4,6,8],"intensity":1.2,"color":"#ffffff"}
{"type":"hemisphere","skyColor":"#fff4dc","groundColor":"#d9e7ff","intensity":0.5}
{"type":"point","position":[2,3,4],"intensity":1,"color":"#ffd39b","distance":0,"decay":2}
```

## Video

`rgl video [file]` renders an animated clip. It requires `ffmpeg` on the `PATH`
(set `RGL_FFMPEG_PATH` to point at a specific binary). The output container is
inferred from the extension: `.mp4`, `.mov`, `.webm`, or `.gif`. Frames are
streamed straight to ffmpeg as raw RGBA, so memory stays flat for long clips.

```bash
pnpm exec rgl video ./model.glb --output ./turntable.mp4 --camera turntable --duration 6 --fps 30
pnpm exec rgl video ./model.glb --output ./dolly.webm --camera dolly-in --duration 4 --ease
pnpm exec rgl video ./model.glb --output ./loop.gif --camera turntable --fps 15 --duration 3
```

Video parameters (in addition to all `rgl render` GLTF options):

- `--output <path>`: required; `.mp4`, `.mov`, `.webm`, or `.gif`
- `--camera turntable|dolly-in|dolly-out`: GLTF camera motion (default `turntable`)
- `--fps <number>`: frames per second (default 30)
- `--duration <seconds>`: clip length (default 6); frame count = `round(duration * fps)`
- `--degrees <number>`: turntable arc in degrees (default 360)
- `--ease`: ease camera motion in and out
- `--crf <number>`: encoder quality (lower is higher quality)
- `--codec <codec>`: override the video codec, e.g. `libx264` or `libvpx-vp9`
- `--no-loop`: disable infinite looping for GIF output

For `--js` scene modules there is no camera preset: drive all motion (including
the camera) from the module's `update(delta)` hook, which is called once per
frame with `delta = 1 / fps`.

```bash
pnpm exec rgl video --js ./scene.mjs --output ./scene.mp4 --fps 24 --duration 5
```

Environment map options are GLTF-only, same as `rgl render`.

## Environment Maps

Render with image-based lighting using `.hdr` or `.ktx2` equirectangular environment maps:

```bash
pnpm exec rgl render ./model.glb --env-map ./studio.hdr --output ./frame.png
```

Show the environment as background with optional blur:

```bash
pnpm exec rgl render ./model.glb --env-map ./outdoor.hdr --env-background --env-blur 0.3 --output ./frame.png
```

Adjust environment lighting intensity:

```bash
pnpm exec rgl render ./model.glb --env-map ./studio.hdr --env-intensity 1.5 --output ./frame.png
```

Environment maps are only supported for GLTF/GLB renders, not JS scene modules.

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
