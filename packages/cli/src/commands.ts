import { basename, dirname, extname, join } from "node:path";

import type { OutputFormat, RendererBenchmarkOptions } from "headless-three-webgpu";
import type { RenderGltfCameraOptions, RenderGltfOptions } from "headless-three-webgpu-helpers";

export function parseVector3(value: string | undefined): [number, number, number] | undefined {
  if (!value) {
    return undefined;
  }

  const parts = value
    .split(",")
    .map((segment) => Number(segment.trim()))
    .filter((segment) => Number.isFinite(segment));

  if (parts.length !== 3) {
    throw new Error(`Expected a comma-separated vector with three numeric values, got "${value}"`);
  }

  return [parts[0]!, parts[1]!, parts[2]!];
}

export function resolveFormat(
  format: string | undefined,
  outputPath?: string,
): OutputFormat {
  if (format === "png" || format === "webp") {
    return format;
  }

  const extension = outputPath ? extname(outputPath).toLowerCase() : "";
  return extension === ".webp" ? "webp" : "png";
}

export function resolveOutputPath(
  sourcePath: string,
  outputPath: string | undefined,
  format: OutputFormat,
): string {
  if (outputPath) {
    return outputPath;
  }

  const name = basename(sourcePath, extname(sourcePath));
  return join(dirname(sourcePath), `${name}.${format}`);
}

export function buildRenderOptions(
  sourcePath: string,
  options: {
    width: number;
    height: number;
    format?: string;
    output?: string;
    background?: string;
    lighting?: "studio" | "flat" | "none";
    cameraPosition?: string;
    cameraTarget?: string;
    fov?: number;
    dawnFlag?: string[];
    powerPreference?: GPUPowerPreference;
  },
): { render: RenderGltfOptions; outputPath: string } {
  const format = resolveFormat(options.format, options.output);
  const position = parseVector3(options.cameraPosition);
  const target = parseVector3(options.cameraTarget);
  const camera: RenderGltfCameraOptions = {
    ...(position ? { position } : {}),
    ...(target ? { target } : {}),
    ...(options.fov !== undefined ? { fov: options.fov } : {}),
  };

  return {
    render: {
      path: sourcePath,
      width: options.width,
      height: options.height,
      format,
      ...(options.background ? { background: options.background } : {}),
      ...(options.lighting ? { lighting: options.lighting } : {}),
      ...(Object.keys(camera).length > 0 ? { camera } : {}),
      ...(options.dawnFlag ? { dawnFlags: options.dawnFlag } : {}),
      ...(options.powerPreference ? { powerPreference: options.powerPreference } : {}),
    },
    outputPath: resolveOutputPath(sourcePath, options.output, format),
  };
}

export function buildBenchOptions(options: {
  width: number;
  height: number;
  iterations: number;
  format?: string;
  dawnFlag?: string[];
  powerPreference?: GPUPowerPreference;
}): RendererBenchmarkOptions {
  return {
    width: options.width,
    height: options.height,
    iterations: options.iterations,
    format: resolveFormat(options.format),
    ...(options.dawnFlag ? { dawnFlags: options.dawnFlag } : {}),
    ...(options.powerPreference ? { powerPreference: options.powerPreference } : {}),
  };
}
