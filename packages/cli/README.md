# @rendergl/headless-three-webgpu-cli

The `rgl` CLI for rendering images, videos, and GIFs with headless Three.js, WebGPU, and Dawn.

![render cover image](https://i.imgur.com/UlEpFJy.gif)

> ⚠️ This is a part of the core rendering layer powering [render.gl](https://www.render.gl). It's an open-source, standalone tool and does not require any account or API key. That said, if you are looking for cloud-based 3D rendering with a lot more features on top, check out [render.gl](https://www.render.gl).

## Install

Make sure you have Node.js 24 or newer installed.

```bash
npm install -D @rendergl/headless-three-webgpu-cli
```

Or run it directly:

```bash
npx --package @rendergl/headless-three-webgpu-cli rgl render ./model.glb --width 1280 --height 720 --output ./frame.png
```

## Render Images

Render a GLB:

```bash
rgl render ./model.glb --width 1280 --height 720 --output ./frame.png
```

Render a custom JavaScript scene module:

```bash
rgl render --js ./scene.mjs --width 1280 --height 720 --output ./frame.png
```

Add lights and environment maps:

```bash
rgl render ./model.glb --light '{"type":"point","position":[2,3,4],"intensity":0.8,"color":"#ffd39b"}'
rgl render ./model.glb --env-map ./studio.hdr --env-background --env-intensity 1.2
```

Render a scene document:

```bash
rgl render --json ./scene.rgl.json --sequence hero-shot --time 2.5 --output ./frame.png
```

Scene documents are persistent `.rgl.json` files using `schemaVersion: "rgl.scene/v1"`. They can define assets, objects, cameras, lights, views, and named sequences with track/keyframe animation. Use `--view` to pick a view, `--sequence` to pick a sequence, and `--time` to evaluate a specific frame. If the scene requests multiple render passes with metadata such as `renderPasses: ["color", "depth"]`, `render --json` writes the color frame to `--output` and additional pass files next to it, for example `frame.depth.png`.

## Render Video

`rgl video` renders an animated clip and requires `ffmpeg` on your `PATH`, or set `RGL_FFMPEG_PATH`.

```bash
rgl video ./model.glb --output ./turntable.mp4 --camera turntable --duration 6 --fps 30
rgl video ./model.glb --output ./dolly.webm --camera dolly-in --ease
rgl video ./model.glb --output ./loop.gif --camera turntable --fps 15 --duration 3
```

The output container is inferred from the file extension: `.mp4`, `.mov`, `.webm`, or `.gif`. Frames are streamed straight to ffmpeg as raw RGBA so memory stays flat for long clips.

GLTF/GLB video renders support `turntable`, `dolly-in`, and `dolly-out` camera presets, plus the lighting and environment flags from `rgl render`. For `--js` scene modules, drive animation from the module's `update(delta)` hook.

Because `.mp4`, `.mov`, and `.webm` encode to `yuv420p`, `--width` and `--height` must be even for those containers. GIF allows odd sizes.

Render a scene document to video:

```bash
rgl video --json ./scene.rgl.json --output ./reference.mp4
```

When `--sequence` is omitted, `video --json` renders every sequence in document order into one stitched file. Pass `--sequence <id>` to render only one sequence. `--duration` overrides each selected sequence duration, and `--fps` overrides the output frame rate. Scene-document video currently streams color frames to ffmpeg; use `render --json` for depth or other still-pass outputs.

## Inspect

Inspect a model without touching the GPU:

```bash
rgl inspect ./model.glb
```

## Benchmark

Run a quick renderer benchmark:

```bash
rgl bench --iterations 20 --format png
```

## JavaScript Scene Modules

For `--js`, export a named `setup({ width, height })` function that returns `{ scene, camera }`. You can also export an optional `update(delta)` hook that runs once before each frame is rendered.

```ts
import * as THREE from "three/webgpu";

let cube: THREE.Mesh;

export async function setup({ width, height }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial({ color: "#7cc4ff" });

  cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  return { scene, camera };
}

export function update(delta) {
  cube.rotation.y += delta;
}
```

## Agent Instructions

This package ships versioned agent instructions for coding agents:

```txt
node_modules/@rendergl/headless-three-webgpu-cli/agent/AGENTS.md
node_modules/@rendergl/headless-three-webgpu-cli/agent/skills/rgl-cli/SKILL.md
```

Point your agent there when you want it to use the installed package version as the source of truth.

## Related Packages

- `@rendergl/headless-three-webgpu` - core headless renderer runtime and API
- `@rendergl/headless-three-webgpu-helpers` - GLTF loading, inspection, and convenience rendering helpers

## Develop

This package lives in a `pnpm` + `turbo` monorepo.

```bash
pnpm install
pnpm --filter @rendergl/headless-three-webgpu-cli build
pnpm --filter @rendergl/headless-three-webgpu-cli test
```

From inside the workspace, run the local build:

```bash
pnpm --filter @rendergl/headless-three-webgpu-cli exec rgl render ./model.glb --output ./frame.png
```
