# @rendergl/headless-three-webgpu

Headless Three.js rendering in Node.js, powered by WebGPU and Dawn.

![render cover image](https://i.imgur.com/UlEpFJy.gif)

> ⚠️ This is a part of the core rendering layer powering [render.gl](https://www.render.gl). It's an open-source, standalone tool and does not require any account or API key. That said, if you are looking for cloud-based 3D rendering with a lot more features on top, check out [render.gl](https://www.render.gl).

## What

Headless browser rendering can be heavy, slow to bootstrap, or awkward to deploy. This package gives you a real Three.js + WebGPU renderer in Node.js without a browser, a canvas, or a display server.

Use this package when you want the low-level renderer API for your own scenes. If you mostly want to render GLTF/GLB files, pair it with `@rendergl/headless-three-webgpu-helpers`. If you just want a command, use `@rendergl/headless-three-webgpu-cli`.

## Install

Make sure you have Node.js 24 or newer installed.

```bash
npm install @rendergl/headless-three-webgpu three
```

`three` is a peer dependency so your app stays in control of the Three.js version.

## Quickstart

```ts
import {
  createHeadlessWebGPURenderer,
  createRendererRuntime,
} from "@rendergl/headless-three-webgpu";
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

## API

The main exports are:

- `createRendererRuntime()` - installs the Node WebGPU runtime and Dawn-backed polyfills
- `createHeadlessWebGPURenderer()` - creates a renderer for a specific size
- `createRendererWithRuntime()` - convenience wrapper when you want runtime and renderer together
- `encodeImageToBuffer()` - encode raw RGBA output to `png` or `webp`
- `runRendererBenchmark()` - quick benchmark helper for runtime checks

The renderer can output `png` and `webp` buffers.

## Related Packages

- `@rendergl/headless-three-webgpu-helpers` - GLTF loading, inspection, environment maps, lighting presets, and convenience rendering
- `@rendergl/headless-three-webgpu-cli` - the `rgl` command

## Develop

This package lives in a `pnpm` + `turbo` monorepo.

```bash
pnpm install
pnpm --filter @rendergl/headless-three-webgpu build
pnpm --filter @rendergl/headless-three-webgpu test
```
