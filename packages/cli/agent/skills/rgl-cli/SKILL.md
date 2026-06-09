---
name: rgl-cli
description: Use the rgl CLI from @rendergl/headless-three-webgpu-cli to render, inspect, and benchmark 3D assets from Node.js.
---

# rgl-cli

Use this skill when you need to render images, videos, GIFs, inspect GLTF/GLB assets, or benchmark the headless renderer from the command line.

## Install

```bash
npm install -D @rendergl/headless-three-webgpu-cli
```

Run after installing:

```bash
npm exec -- rgl --help
```

Run without installing:

```bash
npx --package @rendergl/headless-three-webgpu-cli rgl --help
```

## Main Commands

Render GLTF or GLB:

```bash
npm exec -- rgl render ./model.glb --width 1024 --height 1024 --output ./frame.png
```

Render a custom Three.js scene module:

```bash
npm exec -- rgl render --js ./scene.mjs --width 1024 --height 1024 --output ./frame.png
```

Render a video (requires `ffmpeg` on `PATH`, or set `RGL_FFMPEG_PATH`):

```bash
npm exec -- rgl video ./model.glb --output ./orbit.mp4 --camera turntable --duration 6 --fps 30
```

Inspect an asset without touching the GPU:

```bash
npm exec -- rgl inspect ./model.glb
```

Benchmark the runtime:

```bash
npm exec -- rgl bench --width 1024 --height 1024 --iterations 10 --format png
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
- `--env-intensity <number>`: environment lighting intensity from 0 to 10

Custom light JSON shapes:

```json
{"type":"ambient","intensity":0.8,"color":"#ffffff"}
{"type":"directional","position":[4,6,8],"intensity":1.2,"color":"#ffffff"}
{"type":"hemisphere","skyColor":"#fff4dc","groundColor":"#d9e7ff","intensity":0.5}
{"type":"point","position":[2,3,4],"intensity":1,"color":"#ffd39b","distance":0,"decay":2}
```

## Video

`rgl video [file]` renders an animated clip. The output container is inferred from the extension: `.mp4`, `.mov`, `.webm`, or `.gif`. Frames are streamed straight to ffmpeg as raw RGBA so memory stays flat for long clips.

```bash
npm exec -- rgl video ./model.glb --output ./turntable.mp4 --camera turntable --duration 6 --fps 30
npm exec -- rgl video ./model.glb --output ./dolly.webm --camera dolly-in --duration 4 --ease
npm exec -- rgl video ./model.glb --output ./loop.gif --camera turntable --fps 15 --duration 3
```

Video parameters, in addition to GLTF render options:

- `--output <path>`: required; `.mp4`, `.mov`, `.webm`, or `.gif`
- `--camera turntable|dolly-in|dolly-out`: GLTF camera motion
- `--fps <number>`: frames per second
- `--duration <seconds>`: clip length
- `--degrees <number>`: turntable arc in degrees
- `--ease`: ease camera motion in and out
- `--crf <number>`: encoder quality, lower is higher quality
- `--codec <codec>`: override the video codec
- `--no-loop`: disable infinite looping for GIF output

For `--js` scene modules there is no camera preset. Drive motion from the module's `update(delta)` hook, which is called once per frame with `delta = 1 / fps`.

## JS Scene Modules

Scene modules should export a named `setup({ width, height })` function that returns `{ scene, camera }`. They may also export `update(delta)`.

```ts
import * as THREE from "three/webgpu";

let cube: THREE.Mesh;

export async function setup({ width, height }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);

  cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: "#7cc4ff" }));
  scene.add(cube);

  return { scene, camera };
}

export function update(delta) {
  cube.rotation.y += delta;
}
```

## Runtime Notes

- Local macOS usually uses Dawn -> Metal.
- Linux GPU usually uses Dawn -> Vulkan.
- CPU-only cloud or CI usually needs SwiftShader with Dawn on Vulkan.
- Pass Dawn flags with `--dawn-flag ...` or `RGL_DAWN_FLAGS`.

Example:

```bash
RGL_DAWN_FLAGS="backend=vulkan" npm exec -- rgl render ./model.glb --output ./frame.png
```
