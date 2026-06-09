# headless-three-webgpu

Render images, videos and GIFs using headless three.js with WebGPU and Dawn.

![render cover image](https://i.imgur.com/UlEpFJy.gif)

> ⚠️ This is a part of the core rendering layer powering [render.gl](https://www.render.gl). It's an open-source, standalone tool and does not require any account or API key. That said, if you are looking for cloud-based 3D rendering with a lot more features on top, check out [render.gl](https://www.render.gl).

## What

Headless browser rendering can be heavy, slow to bootstrap, or awkward to integrate and deploy. `headless-three-webgpu` renders Three.js scenes headlessly in Node.js. It levrages Three.js rendering capabilities and WebGPU through Dawn, so you get a real GPU pipeline without a browser, a canvas, or a display server. This is helpful if you want to render 3D images, videos and GIFs in a server, desktop or agent harness (there are skills for this in the `.agents` folder).

## Packages

- `@rendergl/headless-three-webgpu` - core headless renderer runtime and API
- `@rendergl/headless-three-webgpu-helpers` - GLTF loading, inspection, and convenience rendering helpers
- `@rendergl/headless-three-webgpu-cli` - the `rgl` CLI

## Install

> Make sure you have Node.js 24 or newer installed.

Install what you need from npm.

Just the CLI, no code:

```bash
npm install -D @rendergl/headless-three-webgpu-cli
```

The core renderer for your own scenes (`three` is a peer dependency):

```bash
npm install @rendergl/headless-three-webgpu three
```

The core renderer plus GLTF helpers:

```bash
npm install @rendergl/headless-three-webgpu @rendergl/headless-three-webgpu-helpers three
```

## Quickstart

Render a GLB from the command line:

```bash
npx rgl render ./model.glb --width 1280 --height 720 --output ./frame.png
```

Render a custom JavaScript scene module:

```bash
npx rgl render --js ./scene.mjs --width 1280 --height 720 --output ./frame.png
```

Inspect a model without touching the GPU:

```bash
npx rgl inspect ./model.glb
```

## Core API

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

## Helper API

GLTF-specific conveniences live in `packages/helpers` so the core renderer stays generic:

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

Render with image-based lighting using an HDR environment map:

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

## CLI

The CLI intentionally wraps the packages above instead of re-implementing renderer logic.

```bash
rgl render ./model.glb --output ./frame.png
rgl render --js ./scene.mjs --output ./frame.png
rgl render ./model.glb --light '{"type":"point","position":[2,3,4],"intensity":0.8,"color":"#ffd39b"}'
rgl render ./model.glb --env-map ./studio.hdr --env-background --env-intensity 1.2
rgl video ./model.glb --output ./turntable.mp4 --camera turntable --duration 6 --fps 30
rgl inspect ./model.glb
rgl bench --iterations 20 --format png
```

### Video

`rgl video` renders an animated clip and requires `ffmpeg` on your `PATH` (or set `RGL_FFMPEG_PATH`). The container is inferred from the output extension (`.mp4`, `.mov`, `.webm`, `.gif`), and frames are streamed straight to ffmpeg as raw RGBA so memory stays flat for long clips.

```bash
rgl video ./model.glb --output ./turntable.mp4 --camera turntable --duration 6 --fps 30
rgl video ./model.glb --output ./dolly.webm --camera dolly-in --ease
rgl video ./model.glb --output ./loop.gif --camera turntable --fps 15 --duration 3
```

GLTF/GLB renders support the `turntable`, `dolly-in`, and `dolly-out` camera presets plus all the lighting and environment flags from `rgl render`. For `--js` scene modules there is no preset: drive the camera and everything else from the module's `update(delta)` hook, which runs once per frame with `delta = 1 / fps`.

Tune the encode with `--fps`, `--duration`, `--crf` (lower is higher quality), `--codec`, and `--no-loop` (GIF). Because `.mp4`/`.mov`/`.webm` encode to `yuv420p`, `--width` and `--height` must be even for those containers (GIF allows odd sizes).

```bash
rgl video --js ./scene.mjs --output ./scene.mp4 --fps 24 --duration 5
```

Environment maps currently support local equirectangular `.hdr` and `.ktx2` files for GLTF/GLB renders. Use `--env-background` to show the map behind the model, `--env-intensity` to control IBL strength, and `--env-blur` to soften the visible background.

For `--js`, export a named `setup({ width, height })` function that returns `{ scene, camera }`. You can also export an optional `update(delta)` hook that runs once before the frame is rendered:

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

## Develop

Working on this repo itself? It is a `pnpm` + `turbo` monorepo targeting Node 24.

```bash
nvm use
pnpm install
pnpm build
pnpm test
```

From inside the workspace, run the CLI against the local build:

```bash
pnpm --filter @rendergl/headless-three-webgpu-cli exec rgl render ./model.glb --output ./frame.png
```

## Credits

- [opensource3dassets.com](https://www.opensource3dassets.com/) models used in the cover image
- [three.js](https://threejs.org/) for making the 3D web as good as it is today
- [Google Dawn](https://dawn.googlesource.com/dawn) WebGPU implementation
- [@jscottsmith](https://github.com/jscottsmith) for contributions to render.gl
- [@caseypugh](https://github.com/caseypugh) and [@jamiew](https://github.com/jamiew) for advising on render.gl
