import {
  Color,
  NoToneMapping,
  RenderTarget,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Camera,
  type Scene,
} from "three";
import { WebGPURenderer } from "three/webgpu";

import { createHeadlessWebGpuCanvas } from "./headless-webgpu-canvas.js";
import { encodeImageToBuffer } from "./image-encoding.js";
import {
  asUint8Bytes,
  convertLinearRgba8ToSrgb,
  deflateRgba8UnormRows,
  rgbaReadbackBytesPerRow,
} from "./readback.js";
import { createRendererRuntime } from "./runtime.js";

import type {
  CreateHeadlessWebGPURendererOptions,
  HeadlessWebGPURenderer,
  HeadlessWebGPURendererDiagnostics,
  RendererRuntime,
} from "./types.js";

function createReadbackTarget(width: number, height: number): RenderTarget {
  const target = new RenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
    format: RGBAFormat,
    type: UnsignedByteType,
  });
  target.texture.generateMipmaps = false;
  return target;
}

export async function createHeadlessWebGPURenderer(
  options: CreateHeadlessWebGPURendererOptions = {},
): Promise<HeadlessWebGPURenderer> {
  const alpha = options.alpha ?? true;
  const antialias = options.antialias ?? true;
  let width = options.width ?? 1024;
  let height = options.height ?? 1024;
  const runtime = options.runtime ?? (await createRendererRuntime(options));
  const ownsRuntime = !options.runtime;
  const { canvas, gpuContext } = createHeadlessWebGpuCanvas(width, height);

  const renderer = new WebGPURenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gpuContext,
    device: runtime.device,
    alpha,
    antialias,
  });

  await renderer.init();
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(options.clearColor ?? new Color(0x000000), options.clearAlpha ?? 0);

  let target = createReadbackTarget(width, height);
  let disposed = false;

  const ensureActive = (): void => {
    if (disposed) {
      throw new Error("Renderer has already been disposed");
    }
  };

  const resizeTarget = (nextWidth: number, nextHeight: number): void => {
    width = nextWidth;
    height = nextHeight;
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    renderer.setSize(nextWidth, nextHeight, false);
    target.dispose();
    target = createReadbackTarget(nextWidth, nextHeight);
  };

  const readPixels = async (): Promise<Uint8Array> => {
    ensureActive();
    const view = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
    const bytes = asUint8Bytes(view);
    const bytesPerRow = bytes.byteLength / height;
    const packed =
      !Number.isInteger(bytesPerRow) || bytesPerRow < width * 4
        ? bytes
        : deflateRgba8UnormRows(
            bytes,
            width,
            height,
            bytesPerRow || rgbaReadbackBytesPerRow(width),
          );

    // Rendering into a RenderTarget skips the final sRGB display conversion,
    // so the raw readback stays linear unless we resolve it ourselves.
    return convertLinearRgba8ToSrgb(packed);
  };

  return {
    async render(scene: Scene, camera: Camera) {
      ensureActive();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
    },
    setSize(nextWidth: number, nextHeight: number) {
      ensureActive();
      resizeTarget(nextWidth, nextHeight);
    },
    readPixels,
    async toBuffer(format) {
      ensureActive();
      const pixels = await readPixels();
      return encodeImageToBuffer({
        pixels,
        width,
        height,
        format,
      });
    },
    unsafeGetWebGpuRenderer() {
      ensureActive();
      return renderer;
    },
    getDiagnostics(): HeadlessWebGPURendererDiagnostics {
      return {
        width,
        height,
        alpha,
        antialias,
        runtime: runtime.diagnostics,
      };
    },
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      target.dispose();
      renderer.dispose();
      gpuContext.unconfigure();

      if (ownsRuntime) {
        await runtime.dispose();
      }
    },
  };
}

export async function createRendererWithRuntime(
  runtime: RendererRuntime,
  options: Omit<CreateHeadlessWebGPURendererOptions, "runtime"> = {},
): Promise<HeadlessWebGPURenderer> {
  return createHeadlessWebGPURenderer({
    ...options,
    runtime,
  });
}
