---
name: rgl-cli
description: Use the rgl CLI from @rendergl/headless-three-webgpu-cli to render GLB/GLTF assets, scene JSON documents, images, videos, and reference sheets from Node.js.
---

# rgl-cli

Use this skill when you need to render images, videos, GIFs, inspect GLTF/GLB assets, write or render `.rgl.json` scene documents, or benchmark the headless renderer from the command line.

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

Render a persistent scene document:

```bash
npm exec -- rgl render --json ./scene.rgl.json --sequence hero-shot --time 2.5 --width 1280 --height 720 --output ./frame.png
```

Render a video (requires `ffmpeg` on `PATH`, or set `RGL_FFMPEG_PATH`):

```bash
npm exec -- rgl video ./model.glb --output ./orbit.mp4 --camera turntable --duration 6 --fps 30
```

Render a scene document video:

```bash
npm exec -- rgl video --json ./scene.rgl.json --output ./scene.mp4 --width 1280 --height 720
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
- `--json <path>`: render a persistent `.rgl.json` scene document instead of a GLTF/GLB or JS module
- `--view <id>`: select a scene document view when using `--json`
- `--sequence <id>`: evaluate a scene document sequence when using `--json`
- `--time <seconds>`: evaluate a scene document at a specific time when using `--json`
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

For `--json` scene documents:

- `rgl video --json ./scene.rgl.json --output ./scene.mp4` renders every sequence in document order into one stitched video when `--sequence` is omitted.
- `rgl video --json ./scene.rgl.json --sequence shot-a --output ./shot-a.mp4` renders only that sequence.
- `rgl render --json ./scene.rgl.json --sequence shot-a --time 1.25 --output ./shot-a.png` renders one evaluated frame.
- `--duration` on `video --json` overrides each selected sequence's duration; omit it to use per-sequence durations.
- `--fps` on `video --json` overrides the output FPS; omit it to use the first selected sequence's `fps`.

## Scene JSON Documents

Scene documents use `schemaVersion: "rgl.scene/v1"` and are the preferred format for persistent scenes, reusable camera moves, multi-shot videos, and reference frames. Keep them explicit and simple; map keys must match embedded `id` fields.

Minimal shape:

```json
{
  "schemaVersion": "rgl.scene/v1",
  "id": "example-scene",
  "assets": {},
  "objects": {},
  "cameras": {},
  "lights": {},
  "views": {},
  "sequences": {},
  "activeViewId": "view-main",
  "render": {
    "output": { "width": 1280, "height": 720 },
    "background": "#101216"
  }
}
```

Assets:

- Model assets use `{ "kind": "model", "sourcePath": "./model.glb" }`.
- Primitive assets use `{ "kind": "primitive", "primitive": { "type": "box" } }`.
- Primitive types are `box`, `sphere`, `cone`, `cylinder`, `plane`, and `grid`.
- Relative `sourcePath` values resolve from the scene document path.

Objects:

- Use `source: { "type": "asset", "assetId": "asset-id" }` for models/primitives.
- Use `source: { "type": "group" }` for grouping.
- Use `parentId` to build hierarchy.
- `transform.position`, `transform.rotation`, and `transform.scale` are vec3 arrays.
- Object material support is intentionally small: `material.color`.

Cameras, lights, and views:

- Perspective cameras support `transform.position`, `target`, `up`, `fov`, `near`, and `far`.
- Lights support `ambient`, `directional`, `hemisphere`, `point`, and `spot`.
- Views point at a camera with `cameraId`, define `output`, and may override `background`.

Sequences:

- A scene can contain multiple sequences. Each sequence should have `id`, `duration`, `fps`, and `tracks`.
- Tracks target one path on an object, camera, light, or view:

```json
{
  "id": "camera-position",
  "target": { "type": "camera", "id": "camera-main", "path": "transform.position" },
  "valueType": "vec3",
  "keyframes": {
    "start": { "id": "start", "time": 0, "value": [0, 1.5, 4], "interpolation": "linear" },
    "end": { "id": "end", "time": 5, "value": [0, 1.5, 3.2] }
  }
}
```

- Common camera track paths are `transform.position`, `target`, `up`, `fov`, `near`, and `far`.
- Supported value types include `number`, `boolean`, `string`, `color`, and `vec2`/`vec3`/`vec4`.
- Use dense linear keyframes for smooth arcs/orbits until higher-level curve/path helpers exist.

Render passes:

- Add render passes in document or view metadata:

```json
{
  "metadata": {
    "semantic": {
      "renderPasses": ["color", "depth"],
      "outputs": { "rgb": true, "depth": true }
    }
  }
}
```

- `rgl render --json` writes the color output to `--output` and writes additional pass outputs next to it, such as `frame.depth.png`.
- `rgl video --json` currently streams color frames to ffmpeg; use `render --json` for depth stills.

Useful examples in this repo:

- `examples/simple-depth-rgb.rgl.json`
- `examples/brooks-shoe-cinematic.rgl.json`
- `examples/brooks-shoe-reference-sheet.rgl.json`
- `examples/stick-figure-cinematic.rgl.json`
- `examples/room-couch-skeleton-cinematic.rgl.json`

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
