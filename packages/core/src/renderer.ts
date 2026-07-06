import {
  Color,
  HalfFloatType,
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
  asHdrPixels,
  asUint8Bytes,
  convertLinearRgba8ToSrgb,
  deflateRgba8UnormRows,
  rgbaReadbackBytesPerRow,
  toLinearRgba8Buffer,
  toSrgbRgba8Buffer,
} from "./readback.js";
import { createRendererRuntime } from "./runtime.js";

import type {
  CreateHeadlessWebGPURendererOptions,
  HeadlessWebGPURenderer,
  HeadlessWebGPURendererDiagnostics,
  ReadbackFormat,
  ReadPixelsOptions,
  RenderPipelineLike,
  RendererRuntime,
} from "./types.js";

function resolveReadbackTextureType(format: ReadbackFormat) {
  switch (format) {
    case "rgba8unorm":
      return UnsignedByteType;
    case "rgba16float":
      return HalfFloatType;
  }
}

function createReadbackTarget(width: number, height: number, format: ReadbackFormat): RenderTarget {
  const target = new RenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
    format: RGBAFormat,
    type: resolveReadbackTextureType(format),
  });
  target.texture.generateMipmaps = false;
  return target;
}

export async function createHeadlessWebGPURenderer(
  options: CreateHeadlessWebGPURendererOptions = {},
): Promise<HeadlessWebGPURenderer> {
  const alpha = options.alpha ?? true;
  const antialias = options.antialias ?? true;
  const readbackFormat = options.readbackFormat ?? "rgba8unorm";
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

  let target = createReadbackTarget(width, height, readbackFormat);
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
    target = createReadbackTarget(nextWidth, nextHeight, readbackFormat);
  };

  const readPixels = async (options: ReadPixelsOptions = {}): Promise<Uint8Array> => {
    ensureActive();
    const view = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
    const colorSpace = options.colorSpace ?? "srgb";

    if (view instanceof Uint16Array || view instanceof Float32Array) {
      return colorSpace === "linear"
        ? toLinearRgba8Buffer(asHdrPixels(view), width, height)
        : toSrgbRgba8Buffer(asHdrPixels(view), width, height);
    }

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

    return colorSpace === "linear" ? packed : convertLinearRgba8ToSrgb(packed);
  };

  return {
    async render(scene: Scene, camera: Camera) {
      ensureActive();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
    },
    async renderPipeline(renderPipeline: RenderPipelineLike) {
      ensureActive();
      renderer.setRenderTarget(target);
      renderPipeline.render();
      renderer.setRenderTarget(null);
    },
    setSize(nextWidth: number, nextHeight: number) {
      ensureActive();
      resizeTarget(nextWidth, nextHeight);
    },
    readPixels,
    async toBuffer(format, options) {
      ensureActive();
      const pixels = await readPixels(options);
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
        readbackFormat,
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
