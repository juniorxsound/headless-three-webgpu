interface HeadlessCanvasContext {
  canvas: {
    width: number;
    height: number;
    style: Partial<CSSStyleDeclaration>;
    setAttribute(name: string, value: string): void;
    getContext(type: string): GPUCanvasContext | null;
  };
  gpuContext: GPUCanvasContext;
}

export function createHeadlessWebGpuCanvas(width: number, height: number): HeadlessCanvasContext {
  let swap: GPUTexture | null = null;

  const canvas = {
    width,
    height,
    style: {} as Partial<CSSStyleDeclaration>,
    setAttribute(_name: string, _value: string) {
      return undefined;
    },
    getContext(type: string) {
      return type === "webgpu" ? gpuContext : null;
    },
  };

  const gpuContext = {
    canvas,
    configure(config: GPUCanvasConfiguration) {
      swap?.destroy();
      swap = config.device.createTexture({
        label: "rendergl-three-headless-swap",
        size: [canvas.width, canvas.height],
        format: config.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
    },
    getCurrentTexture(): GPUTexture {
      if (!swap) {
        throw new Error("GPUCanvasContext.configure() must be called before rendering");
      }

      return swap;
    },
    unconfigure() {
      swap?.destroy();
      swap = null;
    },
  } as GPUCanvasContext;

  return { canvas, gpuContext };
}
