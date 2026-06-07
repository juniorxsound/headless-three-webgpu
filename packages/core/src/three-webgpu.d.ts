declare module "three/webgpu" {
  import type { Camera, ColorRepresentation, RenderTarget, Scene } from "three";

  export class WebGPURenderer {
    constructor(parameters?: Record<string, unknown>);
    outputColorSpace: string;
    toneMapping: number;
    init(): Promise<void>;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setClearColor(color: ColorRepresentation, alpha?: number): void;
    setRenderTarget(
      renderTarget: RenderTarget | null,
      activeCubeFace?: number,
      activeMipmapLevel?: number,
    ): void;
    render(scene: Scene, camera: Camera): void;
    readRenderTargetPixelsAsync(
      renderTarget: RenderTarget,
      x: number,
      y: number,
      width: number,
      height: number,
      textureIndex?: number,
      faceIndex?: number,
    ): Promise<ArrayBufferView>;
    dispose(): void;
  }
}
