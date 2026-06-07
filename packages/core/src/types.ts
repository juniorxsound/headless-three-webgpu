import type { Camera, Scene } from "three";
import type { WebGPURenderer } from "three/webgpu";

export type OutputFormat = "png" | "webp";

export interface RendererAdapterInfoSnapshot {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

export interface RendererRuntimeDiagnostics {
  requestedAt: string;
  powerPreference: GPUPowerPreference;
  dawnFlags: string[];
  adapterRequestMs: number;
  deviceRequestMs: number;
  adapterInfo: RendererAdapterInfoSnapshot | null;
}

export interface RendererRuntimeOptions {
  dawnFlags?: string[];
  powerPreference?: GPUPowerPreference;
}

export interface RendererRuntime {
  gpu: GPU;
  adapter: GPUAdapter;
  device: GPUDevice;
  dawnFlags: string[];
  diagnostics: RendererRuntimeDiagnostics;
  dispose(): Promise<void>;
}

export interface CreateHeadlessWebGPURendererOptions extends RendererRuntimeOptions {
  runtime?: RendererRuntime;
  width?: number;
  height?: number;
  alpha?: boolean;
  antialias?: boolean;
  clearColor?: string | number;
  clearAlpha?: number;
}

export interface HeadlessWebGPURendererDiagnostics {
  width: number;
  height: number;
  alpha: boolean;
  antialias: boolean;
  runtime: RendererRuntimeDiagnostics;
}

export interface HeadlessWebGPURenderer {
  render(scene: Scene, camera: Camera): Promise<void>;
  setSize(width: number, height: number): void;
  readPixels(): Promise<Uint8Array>;
  toBuffer(format: OutputFormat): Promise<Uint8Array>;
  unsafeGetWebGpuRenderer(): WebGPURenderer;
  getDiagnostics(): HeadlessWebGPURendererDiagnostics;
  dispose(): Promise<void>;
}

export interface EncodeImageOptions {
  pixels: Uint8Array;
  width: number;
  height: number;
  format: OutputFormat;
}

export interface RendererBenchmarkOptions extends RendererRuntimeOptions {
  width?: number;
  height?: number;
  iterations?: number;
  format?: OutputFormat;
}

export interface RendererBenchmarkResult {
  iterations: number;
  width: number;
  height: number;
  format: OutputFormat;
  averageRenderMs: number;
  averageReadbackMs: number;
  averageEncodeMs: number;
  averageTotalMs: number;
  diagnostics: RendererRuntimeDiagnostics;
}
